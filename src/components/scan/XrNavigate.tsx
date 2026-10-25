"use client"

import { useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { useXRInputSourceState } from "@react-three/xr"

import { xrHands } from "@/helpers/xrHands"
import { xrRig } from "@/helpers/xrRig"
import {
  beginTwoHand,
  deadzone,
  oneHandMatrix,
  snapTurnPosition,
  twoHandMatrix,
  walkDelta,
  type TwoHandStart,
} from "@/lib/xr/manipulate"
import { scanStats } from "@/helpers/scanStats"
import {
  FLY_SPEED_MS,
  GRAB_SCALE_MAX,
  GRAB_SCALE_MIN,
  MOVE_SPEED_MS,
  SNAP_TURN_DEG,
  STICK_DEADZONE,
} from "@/config/xrScan"

/** Moving about, and handling the model.
 *
 *  WITHOUT THIS THE HEADSET IS A STEREO PHOTOGRAPH. The viewer presented a
 *  correctly scaled, correctly placed point cloud and then offered no way to
 *  go anywhere near it or turn it round -- which is most of what anyone wants
 *  to do with a survey. The report was exact: "the VR function does nothing to
 *  add to functionality."
 *
 *  TWO FRAMES OF REFERENCE, AND THE SPLIT IS THE DESIGN.
 *
 *    The STICKS move the room. Left stick walks the play space, right stick
 *    snaps the yaw and raises or lowers it. This is the user travelling, and
 *    it is in metres of room at both scales -- a metre is a metre whether you
 *    are standing over a table or inside a stadium.
 *
 *    The GRIPS move the model. Squeeze one controller and the cloud is stuck
 *    to your hand; squeeze both and the distance between your hands scales it
 *    while the bearing between them turns it. This is handling an object, and
 *    it is the direct answer to "turning it or expanding it".
 *
 *  Keeping those apart matters: a control scheme where the stick sometimes
 *  moves you and sometimes moves the world is one nobody can build a reflex
 *  for.
 *
 *  NO REACT IN ANY OF IT. Everything is written straight onto two Object3Ds
 *  in a frame callback. A thumbstick at 72Hz through useState would be 72
 *  renders a second of a tree containing a point cloud.
 */

/** Scratch, all of it. This runs every frame in a session. */
const headQuat = new THREE.Quaternion()
const headEuler = new THREE.Euler(0, 0, 0, "YXZ")
const move = new THREE.Vector3()
const leftPos = new THREE.Vector3()
const rightPos = new THREE.Vector3()
const handMatrix = new THREE.Matrix4()
const composed = new THREE.Matrix4()

type Grab =
  | { kind: "none" }
  /** One hand: the model is parented to the hand for the duration. */
  | { kind: "one"; hand: "left" | "right"; handInverseTimesModel: THREE.Matrix4 }
  /** Two hands: scale and yaw from how the hands move relative to each other.
   *  The arithmetic lives in lib/xr/manipulate.ts, where it is tested. */
  | { kind: "two"; start: TwoHandStart }

export function XrNavigate({ onReset }: { onReset?: () => void }) {
  const camera = useThree((s) => s.camera)
  const left = useXRInputSourceState("controller", "left")
  const right = useXRInputSourceState("controller", "right")
  const grab = useRef<Grab>({ kind: "none" })
  /** A snap must not repeat until the stick has come back to centre. */
  const snapArmed = useRef(true)
  const wasY = useRef(false)

  useFrame((_, dtRaw) => {
    // READ FROM THE MODULE, not from props. See helpers/xrRig.ts: mutating a
    // ref reached through props inside a frame callback is what the React
    // Compiler's immutability rule rejects, and it is right to.
    const rig = xrRig.origin
    const target = xrRig.model
    if (!rig || !target) return
    // A long frame (a node landing, a GC pause) must not teleport anyone.
    const dt = Math.min(dtRaw, 0.1)

    const stick = (c: typeof left, id = "xr-standard-thumbstick") => {
      const s = c?.gamepad?.[id]
      return {
        x: deadzone(s?.xAxis ?? 0, STICK_DEADZONE),
        y: deadzone(s?.yAxis ?? 0, STICK_DEADZONE),
      }
    }
    const squeezing = (c: typeof left) =>
      (c?.gamepad?.["xr-standard-squeeze"]?.button ?? 0) > 0.6

    // --- the sticks: move the room ------------------------------------
    const ls = stick(left)
    if (ls.x || ls.y) {
      // RELATIVE TO WHERE YOU ARE LOOKING, not to where the play space is
      // pointing. Yaw only -- taking the full head quaternion would send you
      // into the floor whenever you glanced down, which is the classic
      // version of this bug.
      camera.getWorldQuaternion(headQuat)
      headEuler.setFromQuaternion(headQuat)
      rig.position.add(walkDelta(ls.x, ls.y, headEuler.y, MOVE_SPEED_MS, dt, move))
    }

    const rs = stick(right)
    if (rs.y) rig.position.y -= rs.y * FLY_SPEED_MS * dt
    if (Math.abs(rs.x) > 0.6) {
      if (snapArmed.current) {
        // ROTATE ABOUT THE HEAD, not about the origin. Turning about the play
        // space's origin swings you through an arc when you are standing away
        // from it, which feels like being shoved sideways.
        const sign = rs.x > 0 ? -1 : 1
        const angle = (sign * SNAP_TURN_DEG * Math.PI) / 180
        camera.getWorldPosition(move)
        rig.position.copy(snapTurnPosition(rig.position, move, angle, leftPos))
        rig.rotation.y += angle
        snapArmed.current = false
      }
    } else if (Math.abs(rs.x) < 0.3) {
      snapArmed.current = true
    }

    // --- the grips: move the model -------------------------------------
    const lh = xrHands.left
    const rh = xrHands.right
    const lOn = squeezing(left) && lh != null
    const rOn = squeezing(right) && rh != null
    const held = (lOn ? 1 : 0) + (rOn ? 1 : 0)

    // BROUGHT UP TO DATE BY HAND. This runs BEFORE gl.render, which is where
    // three refreshes world matrices, so without these the grab would track
    // the hands one frame late -- and `target.matrix` would be captured from
    // the previous frame's TRS, which is the frame before the grab started.
    if (held > 0) {
      if (lh) lh.updateWorldMatrix(true, false)
      if (rh) rh.updateWorldMatrix(true, false)
      target.updateMatrix()
    }

    if (held === 0) {
      grab.current = { kind: "none" }
    } else if (held === 2) {
      lh!.getWorldPosition(leftPos)
      rh!.getWorldPosition(rightPos)
      if (grab.current.kind !== "two") {
        grab.current = {
          kind: "two",
          start: beginTwoHand(leftPos, rightPos, target.matrix, target.scale.x),
        }
      } else {
        twoHandMatrix(grab.current.start, leftPos, rightPos, GRAB_SCALE_MIN, GRAB_SCALE_MAX, composed)
        composed.decompose(target.position, target.quaternion, target.scale)
      }
    } else {
      const hand = lOn ? "left" : "right"
      const node = lOn ? lh! : rh!
      if (grab.current.kind !== "one" || grab.current.hand !== hand) {
        handMatrix.copy(node.matrixWorld).invert()
        grab.current = {
          kind: "one",
          hand,
          handInverseTimesModel: handMatrix.multiply(target.matrix).clone(),
        }
      } else {
        // The model rides the hand: its pose relative to the hand is whatever
        // it was at the moment of the squeeze.
        oneHandMatrix(node.matrixWorld, grab.current.handInverseTimesModel, composed)
        composed.decompose(target.position, target.quaternion, target.scale)
      }
    }

    // --- Y resets, because losing the model is easy and finding it is not --
    const yNow = left?.gamepad?.["y-button"]?.state === "pressed"
    if (yNow && !wasY.current) {
      target.position.set(0, 0, 0)
      target.quaternion.identity()
      target.scale.setScalar(1)
      rig.position.set(0, 0, 0)
      rig.rotation.set(0, 0, 0)
      grab.current = { kind: "none" }
      onReset?.()
    }
    wasY.current = yNow

    // The panel's ratio has to follow what the hands did, or it reports the
    // rig's scale while you are looking at something ten times the size.
    scanStats.userScale = target.scale.x
  })

  return null
}
