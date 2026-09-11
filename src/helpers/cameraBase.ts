"use client"

import * as THREE from "three"

/** Where the camera is *aimed*, as opposed to where it is currently pointing.
 *
 *  These are different the moment anything layers a temporary offset on top of
 *  the aim -- which is exactly what CameraLook does with the cursor. Before it
 *  existed, `camera.rotation` was the only record of the aim, and three
 *  separate places snapshot that value and animate away from it:
 *
 *    - CameraController.zoomIn clones camera.rotation as a tween start
 *    - CameraController.flyTo clones camera.quaternion as a slerp start
 *    - drei's CameraShake (Thunder.tsx) captures it once on mount as the
 *      baseline it then writes every frame as baseline + noise
 *
 *  Write a look-offset into camera.rotation and all three bake it in
 *  permanently: the flight starts from a tilt it never unwinds, and the shake
 *  decays back to a tilt rather than to level. So the offset is never written
 *  into the aim. Instead the aim lives here, every mutation publishes to it,
 *  and CameraLook composes `cameraBase * offset` into camera.quaternion
 *  absolutely -- never read-modify-write, so it cannot drift however many
 *  frames it runs for.
 *
 *  Module-level rather than an atom: this is read and written inside the frame
 *  loop, where a React re-render per change would be absurd. Same handoff
 *  shape as cursorNode/pointerState in cursor.ts. */
export const cameraBase = new THREE.Quaternion()

let initialised = false

/** Seed the aim from wherever the camera currently points, once.
 *
 *  Guarded because it is called from two places that race: CameraController's
 *  mount effect, and CameraLook's first frame (it mounts later, on `started`).
 *  Whichever runs first wins; the other must not clobber an aim that a flight
 *  may already have moved. An unguarded copy from CameraLook would also be
 *  wrong in the one case that matters -- entering the scene runs intro(), which
 *  publishes the island rotation before the first look frame ever runs. */
export function initCameraBase(quaternion: THREE.Quaternion) {
  if (initialised) return
  cameraBase.copy(quaternion)
  initialised = true
}

export function setCameraBase(quaternion: THREE.Quaternion) {
  cameraBase.copy(quaternion)
  initialised = true
}

export function setCameraBaseFromEuler(euler: THREE.Euler) {
  cameraBase.setFromEuler(euler)
  initialised = true
}

/** True while drei's CameraShake is mounted and writing camera.rotation
 *  outright (Thunder.tsx). CameraLook runs at a later frame priority, so
 *  without standing down it would overwrite every shake frame and the strike
 *  would jolt nothing.
 *
 *  Published as a flag rather than derived from the `thunder` atom because the
 *  rig's lifetime is a timer inside Thunder (SHAKE_MS), not the atom's value,
 *  and because the gate is `striking && !flying` -- two conditions, only one of
 *  which is visible from outside.
 *
 *  CameraLook freezes its offset while this is set rather than easing it to
 *  zero, and that is load-bearing: CameraShake's baseline is whatever the
 *  camera held on the frame it mounted, i.e. `cameraBase * frozenOffset`. It
 *  decays back to exactly that, so resuming with the same frozen offset hands
 *  the camera back with no visible step. */
export const cameraShakeActive = { current: false }
