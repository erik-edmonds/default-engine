"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"

import { cameraBase, cameraShakeActive, initCameraBase } from "@/helpers/cameraBase"
import { pointerState } from "@/helpers/cursor"
import { prefersReducedMotion } from "@/helpers/motion"

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
  const offset = useRef({ yaw: 0, pitch: 0 })
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
    initCameraBase(camera.quaternion)

    // CameraShake writes camera.rotation outright while a strike decays, and
    // this runs after it. Freeze -- do not ease to zero -- so the offset we
    // hand back is bit-identical to the baseline the shake captured, and the
    // hand-back is invisible. See cameraShakeActive.
    if (cameraShakeActive.current) return
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
    // Targets are zero when the pointer leaves, so the view eases back to the
    // composed framing rather than staying stuck at whatever tilt the pointer
    // held as it crossed the edge.
    easing.damp(offset.current, "yaw", -ndcX * MAX_YAW, SMOOTH_TIME, dt)
    easing.damp(offset.current, "pitch", ndcY * MAX_PITCH, SMOOTH_TIME, dt)

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
  }, 0.5)
  // 0.5, not 0: priority 0 is where the animation mixer and CameraShake write,
  // and the EffectComposer renders at 1. A fractional priority is the only slot
  // that lands after every writer and still before the frame is drawn.

  return null
}
