import * as THREE from "three"

/** The arithmetic of moving about and handling a model, with no React, no
 *  renderer and no session.
 *
 *  SEPARATED SO IT CAN BE CHECKED. A real XR session cannot be driven
 *  headless in this project -- headless Chromium ships a native XRSystem with
 *  no device, and `iwer` refuses to install over one -- so a browser probe
 *  cannot reach any of this. That would leave the two-handed grab, which is
 *  three matrix products and an inverse, verified only by a person in a
 *  headset noticing the model "feels wrong". Every function here is a pure
 *  function of its inputs and has an invariant that is either exactly true or
 *  quietly broken:
 *
 *    - scaling about the midpoint leaves the midpoint where it was
 *    - rotating the hands turns the model by the same angle, about that point
 *    - a snap turn leaves the wearer's head exactly where it was
 *    - walking is relative to where you are looking, never to where the play
 *      space happens to be pointing
 */

const step = new THREE.Matrix4()
const Y_AXIS = new THREE.Vector3(0, 1, 0)

/** Stick values inside the deadzone are zero, not scaled.
 *
 *  Quest sticks rest around 0.02-0.05 and drift with wear, so without this the
 *  view creeps while nobody is touching anything -- which reads as the scene
 *  being broken rather than as a worn stick. */
export function deadzone(value: number, threshold: number): number {
  return Math.abs(value) < threshold ? 0 : value
}

/** How far the play space moves this frame, in metres.
 *
 *  YAW ONLY from the head. Taking the full head orientation would send you
 *  into the floor whenever you glanced down, which is the classic version of
 *  this bug. `stickY` is positive BACKWARD, per the WebXR gamepad mapping. */
export function walkDelta(
  stickX: number,
  stickY: number,
  headYaw: number,
  speedMs: number,
  dt: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target
    .set(stickX, 0, stickY)
    .applyAxisAngle(Y_AXIS, headYaw)
    .multiplyScalar(speedMs * dt)
}

/** Yaw the play space about the WEARER'S HEAD rather than about its origin.
 *
 *  The difference is not cosmetic. Turning about the origin swings anyone
 *  standing away from it through an arc, which feels like being shoved
 *  sideways at the exact moment they were trying to look at something else.
 *  Rotating about the head leaves the head where it is and only changes which
 *  way it faces, which is what a snap turn is supposed to be.
 *
 *  Returns the play space's new position; the caller adds `angle` to its yaw.
 */
export function snapTurnPosition(
  originPosition: THREE.Vector3,
  headWorld: THREE.Vector3,
  angle: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  // ROTATED BY three, NOT BY HAND. The first version wrote the 2x2 rotation
  // out in x and z directly, which is the convention for rotating in a plane
  // where z plays the part of y -- and that is the OPPOSITE sense to three's
  // rotation about +Y. The caller does `rig.rotation.y += angle`, so the two
  // disagreed and a snap turn moved the wearer instead of just turning them.
  // Using the same `applyAxisAngle` the rest of the engine uses removes the
  // chance of that entirely.
  target.set(originPosition.x - headWorld.x, 0, originPosition.z - headWorld.z)
  target.applyAxisAngle(Y_AXIS, angle)
  return target.set(
    headWorld.x + target.x,
    originPosition.y,
    headWorld.z + target.z,
  )
}

/** What one grabbing hand does: the model keeps the pose it had relative to
 *  that hand at the moment of the squeeze.
 *
 *  `handInverseTimesModel` is captured once, on grab, as
 *  `hand.matrixWorld⁻¹ · model.matrix`. */
export function oneHandMatrix(
  handWorld: THREE.Matrix4,
  handInverseTimesModel: THREE.Matrix4,
  target = new THREE.Matrix4(),
): THREE.Matrix4 {
  return target.multiplyMatrices(handWorld, handInverseTimesModel)
}

export interface TwoHandStart {
  span: number
  mid: THREE.Vector3
  yaw: number
  model: THREE.Matrix4
  /** The model's scale when the grab began, so the clamp bounds the MODEL
   *  rather than how far the hands happened to travel. */
  scale: number
}

/** Capture what the hands and the model looked like when both grips closed. */
export function beginTwoHand(
  left: THREE.Vector3,
  right: THREE.Vector3,
  modelMatrix: THREE.Matrix4,
  modelScale: number,
): TwoHandStart {
  const span = new THREE.Vector3().subVectors(right, left)
  return {
    span: Math.max(span.length(), 1e-4),
    mid: new THREE.Vector3().addVectors(left, right).multiplyScalar(0.5),
    yaw: Math.atan2(span.x, span.z),
    model: modelMatrix.clone(),
    scale: modelScale,
  }
}

/** The model's new matrix from where the two hands are now.
 *
 *      delta = T(mid) · Ry(startYaw − yaw) · S(factor) · T(−startMid)
 *      model = delta · startModel
 *
 *  BUILT AS ONE MATRIX, not as three mutations of the object, because the
 *  scale and the rotation both have to happen about the point BETWEEN THE
 *  HANDS. Scaling an Object3D's `scale` directly scales about its own origin,
 *  and a survey's origin is nowhere near where you are holding it -- the
 *  model would shoot off sideways as it grew, which is the single most common
 *  way this interaction is got wrong.
 */
export function twoHandMatrix(
  start: TwoHandStart,
  left: THREE.Vector3,
  right: THREE.Vector3,
  scaleMin: number,
  scaleMax: number,
  target = new THREE.Matrix4(),
): THREE.Matrix4 {
  const span = new THREE.Vector3().subVectors(right, left)
  const distance = Math.max(span.length(), 1e-4)
  const mid = new THREE.Vector3().addVectors(left, right).multiplyScalar(0.5)
  const yaw = Math.atan2(span.x, span.z)

  const factor = THREE.MathUtils.clamp(
    distance / start.span,
    scaleMin / start.scale,
    scaleMax / start.scale,
  )

  const delta = new THREE.Matrix4()
    .makeTranslation(mid.x, mid.y, mid.z)
    .multiply(step.makeRotationY(start.yaw - yaw))
    .multiply(step.makeScale(factor, factor, factor))
    .multiply(step.makeTranslation(-start.mid.x, -start.mid.y, -start.mid.z))

  return target.multiplyMatrices(delta, start.model)
}
