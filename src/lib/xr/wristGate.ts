import * as THREE from "three"

/** Turning your wrist to raise the menu, as a state machine.
 *
 *  Pure, so the one property that matters can actually be asserted: it must
 *  not flicker. A gate built from a single threshold chatters, and a probe
 *  cannot see that in a headless browser because a real session cannot be
 *  driven here at all -- so without these functions being separable from the
 *  component, "does it flicker" would only ever be answered by a person
 *  wearing it and saying "it feels twitchy".
 */

const forearm = new THREE.Vector3()
const palm = new THREE.Vector3()
const reference = new THREE.Vector3()
const projected = new THREE.Vector3()
const cross = new THREE.Vector3()

/** The wrist's roll about its own forearm axis, in degrees, signed.
 *
 *  NOT AN EULER ANGLE, and that is the whole reason this is a function rather
 *  than one line at the call site. `Euler.setFromQuaternion` degenerates when
 *  the object points near the chosen order's pole -- and the pole for a
 *  forearm is "arm hanging by your side", which is where an arm spends most
 *  of its time. The gate would work on a raised arm and die on a resting one.
 *
 *  Instead: project the palm axis onto the plane normal to the forearm axis,
 *  and measure its signed angle from a reference that is also in that plane.
 *  That is a true intrinsic roll and it is defined for every orientation.
 *
 *  `forearmAxis` and `palmAxis` are passed in rather than hard-coded, so the
 *  one thing that genuinely cannot be determined off-hardware -- which way
 *  round a given controller's grip space is -- lives in config beside the
 *  thresholds, and this function can be tested without knowing the answer.
 */
export function wristRoll(
  orientation: THREE.Quaternion,
  forearmAxis: readonly [number, number, number],
  palmAxis: readonly [number, number, number],
): number {
  forearm.set(forearmAxis[0], forearmAxis[1], forearmAxis[2]).applyQuaternion(orientation).normalize()
  palm.set(palmAxis[0], palmAxis[1], palmAxis[2]).applyQuaternion(orientation).normalize()

  // World up, flattened into the plane normal to the forearm, is the zero of
  // the angle: a palm facing the floor reads 0 and a palm turned toward the
  // face climbs from there. Using world up rather than a body-relative
  // direction keeps this independent of which way the wearer is facing.
  reference.set(0, -1, 0)
  reference.addScaledVector(forearm, -reference.dot(forearm))
  if (reference.lengthSq() < 1e-8) {
    // The forearm is pointing straight up or straight down, so "roll relative
    // to up" has no meaning. Report 0 rather than a number derived from
    // floating-point noise -- the gate then simply does not fire, which is
    // the correct behaviour for an arm held vertically.
    return 0
  }
  reference.normalize()

  projected.copy(palm).addScaledVector(forearm, -palm.dot(forearm))
  if (projected.lengthSq() < 1e-8) return 0
  projected.normalize()

  const cos = THREE.MathUtils.clamp(projected.dot(reference), -1, 1)
  // Signed, via the component of the cross product along the forearm, so
  // rolling one way is positive and the other negative. Supination -- turning
  // the palm up toward the face -- is the direction that should open it.
  cross.crossVectors(reference, projected)
  const sign = Math.sign(cross.dot(forearm)) || 1
  return (Math.acos(cos) * 180) / Math.PI * sign
}

export interface GateState {
  open: boolean
  /** When the current candidate crossing began; `null` when not crossing.
   *
   *  NULL AND NOT 0. The first version used 0 as the sentinel and the test
   *  caught it immediately: a timestamp of 0 is indistinguishable from "not
   *  crossing", so a crossing that begins at t=0 never accumulates any dwell
   *  and the gate never opens. `performance.now()` is never actually 0 in a
   *  browser, which is exactly what makes it the kind of bug that survives to
   *  production and then fires on some other clock. */
  since: number | null
}

export const GATE_CLOSED: GateState = { open: false, since: null }

export interface GateInput {
  /** Degrees, from `wristRoll`. Absolute value is compared. */
  roll: number
  /** How many grips are currently held. */
  held: number
  now: number
  onDeg: number
  offDeg: number
  onDwellMs: number
  offDwellMs: number
}

/** The next gate state. Called every frame; returns a new object only when
 *  something changed, so the caller can compare by `open` alone.
 *
 *  TWO THRESHOLDS AND TWO DWELLS. The thresholds stop tremor crossing the
 *  boundary repeatedly; the dwells stop a threshold swept through on the way
 *  to somewhere else from counting as a request. The OFF dwell is the longer
 *  one deliberately -- a menu that disappears while you are reaching for one
 *  of its buttons is worse than one that lingers a quarter second.
 *
 *  `held` SUPPRESSES IT ENTIRELY, and this is the part that is easy to miss:
 *  the two-handed grab turns the model by the bearing between your hands,
 *  which means resizing the survey IS a wrist roll. Without this the menu
 *  would open every single time the wearer scaled the model -- the gesture
 *  the viewer's headline control is built from.
 */
export function nextGateState(state: GateState, i: GateInput): GateState {
  if (i.held > 0) {
    // Mid-grab: close immediately and disarm. Not "hold whatever we had" --
    // a menu already open when a grab starts would otherwise sit there for
    // the whole manipulation.
    return state.open || state.since !== null ? GATE_CLOSED : state
  }

  const magnitude = Math.abs(i.roll)
  const crossing = state.open ? magnitude <= i.offDeg : magnitude >= i.onDeg
  const dwell = state.open ? i.offDwellMs : i.onDwellMs

  if (!crossing) {
    // Back on the right side of the threshold: forget any partial dwell.
    return state.since === null ? state : { open: state.open, since: null }
  }

  const since = state.since ?? i.now
  if (i.now - since >= dwell) return { open: !state.open, since: null }
  return state.since === null ? { open: state.open, since } : state
}
