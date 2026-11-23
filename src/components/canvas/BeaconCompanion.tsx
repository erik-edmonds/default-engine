"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { Beacon } from "@/components/models/Beacon"
import {
  OPTICS_CAMERA_AT,
  OPTICS_COMPANION_DISTANCE,
  OPTICS_COMPANION_DROP,
  OPTICS_COMPANION_SCALE,
  OPTICS_SETTLE_LAMBDA,
  OPTICS_WAKE_PATH,
  OPTICS_WAKE_SECONDS,
  opticsPullBackEase,
} from "@/config/optics"
import { opticsPhaseAt, opticsRun } from "@/helpers/optics"
import { makeScreenPlaneScratch, placeScreenPlane } from "@/helpers/screenPlane"
import { frameHalfHeight } from "@/helpers/skyFrame"

/** Hand the beacon's live world position to whoever needs it -- right now
 *  OpticsPulse, which uses it as the wave's origin.
 *
 *  getWorldPosition rather than reading `position` directly: the group happens
 *  to sit under a single identity parent today, so the two agree, but that is
 *  a fact about Scene.tsx's tree rather than anything this file controls.
 *  It also forces the ancestor matrix update, which r3f otherwise does AFTER
 *  frame callbacks -- so reading matrixWorld without it is a frame stale.
 *  Two ancestors deep, this costs nothing. */
function publish(node: THREE.Group) {
  node.getWorldPosition(opticsRun.beacon)
}

/** The orientation the beacon rests at, which the group below gives it by
 *  carrying no rotation at all. Module scope because the frame loop reads it
 *  and must not allocate; a constant rather than a ref because it is one. */
const REST = new THREE.Quaternion()

/** The point on the tour path, before the pull-back blend moves it.
 *
 *  MODULE SCOPE, not a useMemo, and that is the lint talking as much as the
 *  convention: `react-hooks/immutability` flags a value derived during render
 *  and then mutated in a callback, which is exactly what this is now that the
 *  blend adds the offset and the bob into it in place. Shared across mounts
 *  safely because nothing reads it between frames -- it is written and
 *  consumed inside one callback. */
const FLOWN = new THREE.Vector3()

/** How far the camera has travelled since the pull-back began. Module scope
 *  for the same two reasons FLOWN is. */
const DRIFT = new THREE.Vector3()

type BeaconCompanionProps = {
  /** Where the beacon rests, in world space. Computed by Hologram from the
   *  call site's position -- this does not know about the pier. */
  position: [number, number, number]
  scale: number
  route?: string
  onActivate?: () => void
}

/** The beacon, and the flight that takes it off its base and onto the screen.
 *
 *  OWNS THE GROUP IT WRITES, rather than being handed a ref to one. The first
 *  version took the node as a prop so Hologram could keep placing it, which
 *  reads well and is wrong twice over: it mutates a prop every frame, and it
 *  splits one object's transform across two files so that neither can be read
 *  on its own. Here Hologram says where the beacon rests and this owns
 *  everything that happens to it afterwards.
 *
 *  INERT UNTIL A RUN STARTS, which is what lets /Blob render the same hologram
 *  with no optics at all. That page passes no `onActivate`, so the beacon falls
 *  back to its route push, no run is ever started, the phase stays `idle` and
 *  the frame callback returns before it touches anything.
 *
 *  WHY THE ANCHOR IS RECOMPUTED RATHER THAN PARENTED TO THE CAMERA: the two
 *  reasons helpers/screenPlane.ts gives. r3f's camera is shared with every
 *  portal interior, so children hung off it leak across a route change, and a
 *  portal's own pass sees a different camera than the one it is finally drawn
 *  with. Three vector rotations a frame owes nothing to anyone. */
export function BeaconCompanion({ position, scale, route, onActivate }: BeaconCompanionProps) {
  const camera = useThree((s) => s.camera)
  const group = useRef<THREE.Group>(null)

  /** Everything the frame loop touches, allocated once. The rule is stated at
   *  Environment.tsx:412 and OceanWater.ts:367 and it holds here: this runs
   *  inside the render loop at priority 0. */
  const scratch = useMemo(() => makeScreenPlaneScratch(), [])
  const anchor = useMemo(() => new THREE.Object3D(), [])

  /** The tour is authored in world space around the hologram's current spot,
   *  but it is FLOWN relative to wherever this instance actually rests.
   *
   *  The offset is zero today, because OPTICS_WAKE_POINTS[0] and the position
   *  Hologram derives are the same point. It exists so they cannot silently
   *  disagree: config/positions.ts records at length what this codebase pays
   *  when one place holds two copies of a position and only one of them is
   *  updated. */
  const offset = useMemo(() => {
    const first = OPTICS_WAKE_PATH.points[0]
    return new THREE.Vector3(position[0], position[1], position[2]).sub(first)
  }, [position])

  useFrame((state, delta) => {
    const node = group.current
    if (!node) return

    const t = opticsRun.t
    const phase = opticsPhaseAt(t, opticsRun.airborne)
    if (phase === "idle") {
      // A BREATH WHILE IT WAITS. The pier now carries a ring widening under
      // the beacon to say the thing is clickable (BeaconLure), and a
      // dead-still orb sitting in the middle of it reads as a prop that the
      // animation happens to be near rather than as the source of it.
      //
      // This file used to return here without touching the transform at all,
      // on the grounds that the JSX below should be the single statement of
      // where the beacon lives. It still is: the bob is written as an OFFSET
      // from the `position` prop every frame, so there is one source for the
      // resting point and no drift -- which matters more than usual here,
      // because OPTICS_WAKE_PATH.points[0] has to keep agreeing with it or the
      // tour silently translates (see `offset` above).
      //
      // Small on purpose. A quarter of the ring's own period, so the two are
      // obviously the same creature, and shallow enough that nothing measured
      // against the resting point moves meaningfully.
      node.position.set(position[0], position[1] + Math.sin(state.clock.elapsedTime * 0.7) * 0.04, position[2])
      publish(node)
      return
    }

    // THE ANCHOR IS NEEDED BY EVERY PHASE FROM HERE DOWN, not just the ones
    // that hold it: `waking` blends toward it while the tour is still running.
    // Computed once, before the branch, rather than twice inside it.
    const drop = frameHalfHeight(OPTICS_COMPANION_DISTANCE) * OPTICS_COMPANION_DROP
    placeScreenPlane(anchor, camera, OPTICS_COMPANION_DISTANCE, -drop, 0, scratch)

    if (phase === "waking") {
      opticsRun.airborne = true

      const p = Math.min(1, Math.max(0, t / OPTICS_WAKE_SECONDS))
      // Smoothstep rather than a linear sweep of the curve. The beacon starts
      // from rest on its base and finishes by handing over to a damp, so both
      // ends want zero velocity -- a linear parameter lurches at the start and
      // stops dead at the end.
      const eased = p * p * (3 - 2 * p)
      // getPointAt, not getPoint: arc-length parameterised, so the beacon
      // holds a steady speed through the tight corners of the circuit instead
      // of racing the long straights and crawling the bends. three caches the
      // length table after the first call, so this allocates nothing.
      OPTICS_WAKE_PATH.getPointAt(eased, FLOWN)
      FLOWN.add(offset)
      // One bob riding on top of the flight, so it reads as something alive
      // rather than something on rails. A full turn of sine starts and ends at
      // zero, so it adds nothing to either endpoint of the path.
      FLOWN.y += Math.sin(p * Math.PI * 2) * 0.18

      // THE BEACON TRAVELS WITH THE CAMERA.
      //
      // The tour is authored in WORLD space. The camera leaves at
      // OPTICS_CAMERA_AT and the tour runs to OPTICS_WAKE_SECONDS, so for the
      // 1.4 seconds they overlap the beacon flies waypoints that know nothing
      // about a camera receding behind them -- it falls back through the frame
      // and then, because the smoothstep above has zero velocity at p = 1, it
      // stops dead at the last waypoint while the camera is still at its
      // fastest. Measured off a capture: motionless from about t+2.3 to t+2.5,
      // then a second, separate swoop as `settling` dragged it to the anchor.
      //
      // WHAT IS DONE ABOUT IT: the whole circuit is dragged along by however
      // far the camera has travelled, so the beacon holds its place in frame
      // and keeps flying the shape it was authored to fly.
      //
      // AND WHAT WAS DONE ABOUT IT FIRST, WHICH WAS WRONG AND IS WORTH KEEPING
      // HERE. The obvious fix is to lerp the path point toward the companion
      // anchor on the same curve the camera rides. It reads well on paper and
      // it visibly reverses: the circuit's tail swings LEFT, back toward the
      // pier, while the anchor sits to the RIGHT of it, so whichever end of
      // the lerp dominates flips halfway through. Tracked across a recording,
      // the beacon's screen x ran 255 -> 128 -> 196 -- out, turn around, back.
      // Interpolating between two targets that are each moving, in different
      // directions, cannot be made monotonic by choosing a nicer curve.
      //
      // A translation can. `DRIFT` only ever grows, and it grows along one
      // axis of motion -- the camera's -- so adding a fraction of it to the
      // path can introduce no reversal of its own. What is left on screen is
      // exactly the circuit, played at the size and position it had when the
      // camera set off.
      const pull = opticsPullBackEase(
        Math.min(1, Math.max(0, (t - OPTICS_CAMERA_AT) / (OPTICS_WAKE_SECONDS - OPTICS_CAMERA_AT))),
      )
      // `home.position` is the camera where the run began, captured by
      // OpticsCamera on the run's first frame. The camera does not move
      // between then and OPTICS_CAMERA_AT, so it is also the camera at the
      // moment the pull-back starts -- which is the origin this offset wants.
      // Guarded because the capture happens in another component's callback
      // and this one may run first on the very first frame.
      if (opticsRun.home.captured) {
        DRIFT.subVectors(camera.position, opticsRun.home.position)
        FLOWN.addScaledVector(DRIFT, pull)
      }
      node.position.copy(FLOWN)
      // Absolute, from the resting orientation -- NOT a per-frame slerp toward
      // the anchor, which would be a damp and would compound frame over frame
      // into something whose value depends on the frame rate. REST is identity
      // because the group below carries position and scale and no rotation.
      node.quaternion.copy(REST).slerp(anchor.quaternion, pull)
      // A swell as it comes alive, collapsing onto the companion size on the
      // same curve. It used to return to its resting size and then shrink
      // separately once the phase changed, which is the same two-motion
      // problem the position had.
      node.scale.setScalar(
        THREE.MathUtils.lerp(scale * (1 + 0.18 * Math.sin(p * Math.PI)), OPTICS_COMPANION_SCALE, pull),
      )
      publish(node)
      return
    }

    // Settling, scanning, companion: one rule, hold the anchor. The damp is
    // what absorbs any residual gap, and it is a damp rather than a tween
    // because the anchor MOVES while the camera is still arriving -- a tween
    // toward a moving point either overshoots it or arrives before it does.
    // The same argument CameraHotspot.tsx:240 makes for its label fade.
    //
    // With the blend above there is normally nothing left for it to close; it
    // still earns its place for the second-click path, where `start()` seeds
    // the clock past the wake boundary and this branch is where the beacon
    // enters.
    node.position.x = THREE.MathUtils.damp(node.position.x, anchor.position.x, OPTICS_SETTLE_LAMBDA, delta)
    node.position.y = THREE.MathUtils.damp(node.position.y, anchor.position.y, OPTICS_SETTLE_LAMBDA, delta)
    node.position.z = THREE.MathUtils.damp(node.position.z, anchor.position.z, OPTICS_SETTLE_LAMBDA, delta)

    // Rotation matters on a sphere here, which is not obvious: drei's
    // MeshDistortMaterial samples its noise in OBJECT space, so a beacon
    // holding a fixed world rotation while the camera turns shows one frozen
    // lumpy face. Carrying the camera's rotation keeps the distortion moving
    // against the view the way it does on the pier.
    // slerp mutates in place -- no allocation.
    node.quaternion.slerp(anchor.quaternion, 1 - Math.exp(-OPTICS_SETTLE_LAMBDA * delta))

    node.scale.setScalar(
      THREE.MathUtils.damp(node.scale.x, OPTICS_COMPANION_SCALE, OPTICS_SETTLE_LAMBDA, delta),
    )
    publish(node)
  })

  return (
    <group ref={group} position={position} scale={scale}>
      {/* A unit sphere at the group's origin. The transform is all up here so
          the frame loop has one node to write. */}
      <Beacon route={route} onActivate={onActivate} />
    </group>
  )
}
