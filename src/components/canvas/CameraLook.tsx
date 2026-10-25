"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"

import { cameraBase, cameraShakeActive, initCameraBase } from "@/helpers/cameraBase"
import { cursorLock, pointerState } from "@/helpers/cursor"
import { prefersReducedMotion } from "@/helpers/motion"
import { useAtomValue } from "jotai"
import { cameraFlying, inSkyJourney, openPortalId } from "@/helpers/StateProvider"
import { xrActive, xrArmed, xrPriority } from "@/helpers/xr"

// How far the view swings at the very edge of the screen. Small on purpose:
// this is parallax, not a camera control. Past about 6 degrees the island
// starts sliding out of its composition and the scene reads as loose rather
// than alive.
const MAX_YAW = THREE.MathUtils.degToRad(4)
const MAX_PITCH = THREE.MathUtils.degToRad(3)

// The same 0.25s the rest of the scene damps on (CameraHelpers.tsx's Rig,
// AvatarController's sky scroll), so the view lags the cursor by the same
// amount everything else lags its input.
const SMOOTH_TIME = 0.25

// One dropped frame must not teleport the view. Same clamp, and the same
// reason, as CursorDriver.
const MAX_DELTA = 1 / 30

const WORLD_UP = new THREE.Vector3(0, 1, 0)

/** A small parallax swing of the camera's *view*, following the cursor.
 *
 *  The camera itself never moves -- position is untouched here, and the whole
 *  point of the effect is that the framing pivots rather than drifts. What it
 *  writes is camera.quaternion, composed absolutely from the aim published in
 *  cameraBase:
 *
 *      camera.quaternion = yaw(world up) * cameraBase * pitch(camera right)
 *
 *  Absolute, so it is idempotent -- run it for a million frames and there is no
 *  accumulated drift, because nothing is ever read back out of the camera. See
 *  helpers/cameraBase.ts for why the aim has to live outside the camera at all.
 *
 *  Yaw goes about WORLD up rather than the camera's own up so the horizon can
 *  never tilt; pitch goes about the camera's right, which is a screen-space
 *  axis, so the sign is correct wherever the camera happens to be facing.
 *
 *  Desktop only, by mount site (page.tsx gates on !isCoarsePointer). A touch
 *  device has no hovering pointer to follow -- the gyroscope is the equivalent
 *  there, and is a separate pass. */
export function CameraLook() {
  const offset = useRef({ yaw: 0, pitch: 0, amplitude: 1 })
  // Read as refs, not as props: these change a handful of times in a session
  // and must not re-render a component that writes the camera every frame.
  const skyJourneyValue = useAtomValue(inSkyJourney)
  const skyJourney = useRef(skyJourneyValue)
  useEffect(() => {
    skyJourney.current = skyJourneyValue
  }, [skyJourneyValue])
  const portalValue = useAtomValue(openPortalId) !== null
  const portalOpen = useRef(portalValue)
  useEffect(() => {
    portalOpen.current = portalValue
  }, [portalValue])
  const flyingValue = useAtomValue(cameraFlying)
  const flying = useRef(flyingValue)
  useEffect(() => {
    flying.current = flyingValue
  }, [flyingValue])
  // NOT a ref, unlike the three above: this one has to re-render, because the
  // priority it feeds is a useFrame dependency. See xrPriority.
  const armed = useAtomValue(xrArmed)
  const scratch = useMemo(
    () => ({
      yawQuat: new THREE.Quaternion(),
      pitchQuat: new THREE.Quaternion(),
      right: new THREE.Vector3(),
    }),
    [],
  )

  useFrame((state, delta) => {
    const { camera, size } = state
    // In a session the camera is the headset's, written by three from the
    // pose every frame and copied into both eye cameras. Touching its
    // quaternion here is not a parallax effect, it is a lie about where the
    // user's head is -- the single most reliable way to make someone ill.
    // The priority below drops to 0 so the render gate opens; this is what
    // stops the writing.
    if (xrActive.current) return
    initCameraBase(camera.quaternion)

    // CameraShake writes camera.rotation outright while a strike decays, and
    // this runs after it. Freeze -- do not ease to zero -- so the offset we
    // hand back is bit-identical to the baseline the shake captured, and the
    // hand-back is invisible. See cameraShakeActive.
    if (cameraShakeActive.current) return

    // FROZEN WHILE THE CURSOR HAS HOLD OF A HOTSPOT.
    //
    // The parallax and the magnet were fighting each other, and the magnet
    // was losing. Measured: a marker's ring is ~15px across, and moving the
    // pointer onto it swings the camera enough to carry it 65-110px -- past
    // even the lock's 99px release radius on a long approach. So the marker
    // would light up as the lock engaged, the still-settling camera would
    // drag it out from under the cursor, the lock would quietly let go, and
    // the click would land on nothing. That is the whole of "it does not
    // register, there is no click".
    //
    // Freezing rather than easing to zero, for the same reason the shake
    // above freezes: easing to zero MOVES the camera, which moves the ring,
    // which is the problem again in the opposite direction. Held still, the
    // marker stays exactly where the user aimed, and the offset resumes from
    // where it was the moment they let go -- continuous, no step.
    //
    // Only hotspots. Other magnets (clouds, props) are large or incidental
    // and do not need the world to hold still for them.
    if (cursorLock.current?.type === "cameraHotspot") return
    if (prefersReducedMotion()) return

    // pointerState rather than r3f's state.pointer: it is fed by a
    // window-level capture-phase listener in SceneCursor, so it stays correct
    // while the pointer is over the DOM chrome (the name stamp, the sound
    // toggle) instead of freezing at the last position that reached the
    // canvas. It also already knows when the pointer has left the window.
    const engaged = pointerState.seen && pointerState.inWindow
    const ndcX = engaged ? (pointerState.x / size.width) * 2 - 1 : 0
    const ndcY = engaged ? 1 - (pointerState.y / size.height) * 2 : 0

    const dt = Math.min(delta, MAX_DELTA)

    // Parallax is eased OUT whenever something else owns the framing, rather
    // than disappearing with the component.
    //
    // This used to be mounted on `!isInSkyJourneyValue`, so at the moment the
    // journey began it unmounted holding up to 4 degrees of yaw and 3 of pitch
    // -- and unmounting unwinds nothing, so that offset vanished in a single
    // frame. It landed on exactly the frame that already carried the camera's
    // hand-over, adding to a step that was already the biggest in the
    // sequence. Now the component stays mounted and its amplitude goes to
    // zero, so the swing is given back smoothly and there is nothing left to
    // drop. Every gate below is folded into that same amplitude for the same
    // reason -- do NOT turn any of them into a mount condition.
    //
    //   skyJourney  the journey owns the camera outright.
    //   portalOpen  a portal interior is drawn with the SAME camera as the
    //               overworld (helpers/globeMarker.ts), so cursor parallax
    //               swings the interior too -- which reads as the world
    //               sliding around rather than as depth, because there is no
    //               foreground left to parallax against.
    //   flying      a hotspot flight or the portal entry slerps the aim; a
    //               swing on top of that is a wobble, not parallax.
    const amplitude = skyJourney.current || portalOpen.current || flying.current ? 0 : 1
    easing.damp(offset.current, "amplitude", amplitude, SMOOTH_TIME, dt)

    // Targets are zero when the pointer leaves, so the view eases back to the
    // composed framing rather than staying stuck at whatever tilt the pointer
    // held as it crossed the edge.
    easing.damp(offset.current, "yaw", -ndcX * MAX_YAW * offset.current.amplitude, SMOOTH_TIME, dt)
    easing.damp(offset.current, "pitch", ndcY * MAX_PITCH * offset.current.amplitude, SMOOTH_TIME, dt)

    // Column 0 of the camera's world matrix is its right axis. Read from the
    // aim rather than from the live matrix so the axis does not itself wobble
    // with the offset it is being used to produce.
    scratch.right.set(1, 0, 0).applyQuaternion(cameraBase)

    scratch.yawQuat.setFromAxisAngle(WORLD_UP, offset.current.yaw)
    scratch.pitchQuat.setFromAxisAngle(scratch.right, offset.current.pitch)

    camera.quaternion
      .copy(cameraBase)
      .premultiply(scratch.yawQuat)
      .premultiply(scratch.pitchQuat)
  }, xrPriority(armed, 0.5))
  // 0.5, not 0: priority 0 is where the animation mixer and CameraShake write,
  // and the EffectComposer renders at 1. A fractional priority is the only slot
  // that lands after every writer and still before the frame is drawn.
  //
  // ARMED, IT GOES TO 0 -- and 0 is not "first", it is "unprioritised".
  // fiber counts prioritised subscribers and refuses to auto-render while any
  // exist, so in a session, where the composer cannot run and three does the
  // drawing, every one of these has to come off the count or nothing is drawn
  // at all. See xrPriority.

  return null
}
