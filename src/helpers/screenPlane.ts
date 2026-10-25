/** Parking a plane square to the camera, a fixed distance in front of it.
 *
 *  The sky's four sections are mostly flat pictures now rather than objects
 *  standing in a corridor -- painted sheets behind the card's hole, and
 *  blocks of type that appear in place rather than flying past. All of them
 *  want the same thing: a quad that behaves like a layer on the screen,
 *  whatever the camera is doing.
 *
 *  WHY NOT PARENT THEM TO THE CAMERA. Two reasons. The sheets live inside a
 *  MeshPortalMaterial scene, which has no camera to hang off; and r3f's
 *  camera is shared with the island, so adding children to it leaks across a
 *  route change. Recomputing the transform each frame costs three vector
 *  rotations and owes nothing to anyone.
 */

import * as THREE from "three"
import { skyFrame } from "@/helpers/skyFrame"

export type ScreenPlaneScratch = { f: THREE.Vector3; u: THREE.Vector3; r: THREE.Vector3 }

/** Where the real camera is. A THREE.Camera satisfies this structurally, so
 *  callers in the main scene just pass `state.camera`.
 *
 *  IT HAS TO BE PASSABLE, because of where some of these planes live. The
 *  parallax sheets are children of a MeshPortalMaterial, and drei renders
 *  those through a RenderTexture with an r3f store of its own -- so the
 *  `state.camera` a frame callback sees in there is NOT the camera the
 *  portal is finally drawn with. Positioning against it put the sheets
 *  thirty units in front of a camera that was somewhere else entirely, and
 *  the window came out showing nothing but its own backdrop. */
export type CameraPose = { position: THREE.Vector3; quaternion: THREE.Quaternion }

/** Allocate the three scratch vectors this needs. Call once, in a useMemo --
 *  these are written every frame and must not be re-made per call. */
export function makeScreenPlaneScratch(): ScreenPlaneScratch {
  return { f: new THREE.Vector3(), u: new THREE.Vector3(), r: new THREE.Vector3() }
}

/** The frame's size in world units at `distance` in front of the camera.
 *
 *  Off skyFrame, which is republished every frame from the LIVE lens -- so
 *  this is right on a phone in portrait as well as on a desktop, which a
 *  frozen design aspect was not. */
export function screenPlaneFrame(distance: number) {
  return { width: 2 * distance * skyFrame.tanH, height: 2 * distance * skyFrame.tanV }
}

/** Square to the camera, `distance` ahead, offset `up` and `across` in world
 *  units along the camera's own axes. */
export function placeScreenPlane(
  node: THREE.Object3D,
  camera: CameraPose,
  distance: number,
  up: number,
  across: number,
  scratch: ScreenPlaneScratch,
) {
  node.quaternion.copy(camera.quaternion)
  scratch.f.set(0, 0, -1).applyQuaternion(camera.quaternion)
  scratch.u.set(0, 1, 0).applyQuaternion(camera.quaternion)
  scratch.r.set(1, 0, 0).applyQuaternion(camera.quaternion)
  node.position
    .copy(camera.position)
    .addScaledVector(scratch.f, distance)
    .addScaledVector(scratch.u, up)
    .addScaledVector(scratch.r, across)
}
