import * as THREE from "three"

import {
  ISLAND_CAMERA_POSITION,
  ISLAND_CAMERA_ROTATION,
} from "@/config/positions"

/** The scroll journey: one continuous curve that sweeps around the OUTSIDE of
 *  the island cluster, passing through each destination's authored viewpoint on
 *  the way.
 *
 *  Waypoints are written as bearing/radius/height rather than as raw x,z
 *  because that is the shape of the thing being tuned -- "push this bit further
 *  out", "take it higher over the back" -- and because the island world is
 *  radially arranged around the origin. Bearing 0 is +Z (the side Home looks
 *  from) and increases toward +X, matching atan2(x, z).
 *
 *  For reference when tuning, the terrain's measured reach by bearing (from
 *  77k transformed vertices, ocean and sky excluded):
 *
 *      bearing      0..105    reach ~15.5   (the main island and its skirt)
 *      bearing    120..135    reach  33.7   (the moon island -- Donate)
 *      bearing    150..165    reach  ~20
 *      bearing    180..210    reach ~28.7   and stands up to y 23 (Contact's)
 *      bearing    225..240    reach ~30.9   (the left tree -- Models)
 *      bearing    255..345    reach ~15.4
 *
 *  So a waypoint clears the terrain when its radius comfortably exceeds the
 *  reach at its bearing. `yarn` a build and run the path-clearance check in
 *  verification rather than trusting that by eye -- the reach figures above are
 *  maxima over 15-degree buckets, so they are coarser than the geometry. */

export type JourneyStopId = "home" | "moon-island" | "left-tree" | "upper"

/** Where the camera looks when it is not at a destination. An exterior arc
 *  looks inward, so these are all points in or above the cluster. */
type Waypoint =
  /** An authored destination viewpoint -- position AND orientation come from
   *  config/positions.ts, so the camera arrives framed exactly as a hotspot
   *  flight leaves it today. */
  | { stop: JourneyStopId }
  /** A point on the arc between destinations. */
  | { bearing: number; radius: number; height: number; look: [number, number, number] }

const STOP_VIEWPOINTS: Record<JourneyStopId, { position: THREE.Vector3; rotation: THREE.Euler }> = {
  home: { position: ISLAND_CAMERA_POSITION, rotation: ISLAND_CAMERA_ROTATION },
  "moon-island": {
    position: new THREE.Vector3(15.098318983889161, 6.795693566831701, -23.697681471253638),
    rotation: new THREE.Euler(-2.9175429419626573, 0.625576950652443, 3.0089403059512394),
  },
  "left-tree": {
    position: new THREE.Vector3(-30.122744508150035, 3.1939029441428497, -17.846728003905334),
    rotation: new THREE.Euler(2.9832870595298493, -1.210737021708071, 2.9932851097059734),
  },
  upper: {
    position: new THREE.Vector3(-12.138549003045972, 15.973606020841718, -28.466165069815958),
    rotation: new THREE.Euler(-2.836699146874793, -0.5418705211428874, -2.980689379532905),
  },
}

/** How far ahead a destination's look-target is placed along its own view axis.
 *  Any distance reproduces the authored rotation exactly (the target is on the
 *  view ray); this one only sets how much the look-target MOVES between
 *  waypoints, which is what smooths the turn. Too short and the camera snaps
 *  its gaze on arrival; too long and it barely turns at all. */
const LOOK_DISTANCE = 14

/** Home, out around the right flank, behind the cluster to the far side, then
 *  a climb up to the high island. Bearings run 346 -> 40 -> 95 -> 128 -> 147
 *  (Donate) -> 172 -> 212 -> 239 (Models) -> 225 -> 203 (Contact): one sweep
 *  eastward and round the back, then a short double-back and rise, because
 *  Contact sits inside the arc that Models is on. */
const WAYPOINTS: Waypoint[] = [
  { stop: "home" },
  { bearing: 40, radius: 24, height: 1.5, look: [0, -1, 2] },
  { bearing: 95, radius: 26, height: 4, look: [0, 0, -2] },
  // Outside the moon island, which reaches r 33.7 through here.
  { bearing: 128, radius: 40, height: 10, look: [8, 4, -16] },
  { stop: "moon-island" },
  // Behind everything. Contact's island stands to y 23 at r 28.7 around
  // bearing 195, so this passes it at r 40 rather than over the top.
  { bearing: 172, radius: 40, height: 9, look: [2, 3, -18] },
  { bearing: 212, radius: 40, height: 8, look: [-10, 4, -20] },
  { stop: "left-tree" },
  // The climb, and it has to happen BEHIND Contact rather than beside it.
  // Contact's island occupies x -19..-8, z -27..-15, and its viewpoint sits at
  // z -28.5, just outside that near face. A waypoint at z -26 (which is where
  // this one started) put the approach on the island's side of the viewpoint,
  // so the path slid along the face at 1.6 units -- closer than any
  // destination gets. From further out in z the camera arrives from open
  // water, turning in to the island rather than skimming it.
  // ...and high, which is what keeps the turn at Models from being a cusp.
  // Models is the one place the route has to reverse: it sits at bearing 239
  // while Contact, the next stop, is back at 203, and the path already passed
  // 203 on its way here. That reversal is inherent to the order of the
  // destinations. Climbing hard on the way out turns it from a flat
  // out-and-back into an ascending loop, which is both a gentler turn and a
  // better arrival -- the camera rises over Contact's island and settles down
  // onto the viewpoint rather than sidling up to it.
  { bearing: 216, radius: 43, height: 20, look: [-14, 9, -22] },
  { stop: "upper" },
]

const FORWARD = new THREE.Vector3(0, 0, -1)

function positionOf(w: Waypoint) {
  if ("stop" in w) return STOP_VIEWPOINTS[w.stop].position.clone()
  const theta = THREE.MathUtils.degToRad(w.bearing)
  return new THREE.Vector3(w.radius * Math.sin(theta), w.height, w.radius * Math.cos(theta))
}

function lookOf(w: Waypoint) {
  if ("stop" in w) {
    const { position, rotation } = STOP_VIEWPOINTS[w.stop]
    return position.clone().addScaledVector(FORWARD.clone().applyEuler(rotation), LOOK_DISTANCE)
  }
  return new THREE.Vector3(...w.look)
}

const POSITIONS = WAYPOINTS.map(positionOf)
const LOOKS = WAYPOINTS.map(lookOf)

/** 'centripetal' rather than the uniform default: with control points this
 *  unevenly spaced (12 units apart in places, 30 in others) a uniform
 *  Catmull-Rom overshoots into cusps and loops around the close ones, which on
 *  a camera path means swinging out and back for no reason. Centripetal
 *  parameterisation is the variant that provably cannot self-intersect. */
export const JOURNEY_PATH = new THREE.CatmullRomCurve3(POSITIONS, false, "centripetal")
export const JOURNEY_LOOK = new THREE.CatmullRomCurve3(LOOKS, false, "centripetal")

// three's default is 200 samples for the whole curve, which over nine segments
// is ~22 each. That is too coarse where the path turns hard (it doubles back
// at Models), and the arc-length table is what makes getPointAt hold a
// constant speed -- with the default the camera measurably sped up and slowed
// down by 28% through that turn. Set before anything asks for a length, or the
// table is built at the old resolution and cached.
JOURNEY_PATH.arcLengthDivisions = 4000
JOURNEY_LOOK.arcLengthDivisions = 4000

/** Samples per segment used to build the arc-length table below. */
const SEGMENT_SAMPLES = 64
const SEGMENTS = POSITIONS.length - 1

/** Cumulative arc length at each control point.
 *
 *  This is what lets the two curves stay in step. The position curve is
 *  sampled by ARC LENGTH (getPointAt) so the camera moves at a constant speed
 *  -- but the look curve has its own, different arc length, so sampling it at
 *  the same u would drift: by the time the camera reached a destination its
 *  gaze would be somewhere between two waypoints. Instead the scroll's arc
 *  length is converted back into "which segment, how far along it", and the
 *  look curve is sampled in that index space with getPoint. Both then arrive
 *  at every control point simultaneously, by construction. */
const CUMULATIVE = (() => {
  const lengths = JOURNEY_PATH.getLengths(SEGMENTS * SEGMENT_SAMPLES)
  return Array.from({ length: POSITIONS.length }, (_, i) => lengths[i * SEGMENT_SAMPLES])
})()
const TOTAL_LENGTH = CUMULATIVE[CUMULATIVE.length - 1]

export const JOURNEY_LENGTH = TOTAL_LENGTH

/** The scroll fraction at which each destination is reached. Derived, not
 *  authored: the legs are different lengths and the camera holds a constant
 *  speed, so the long Donate->Models traverse simply takes more scrolling than
 *  the short ones. */
export const JOURNEY_STOPS: { id: JourneyStopId; u: number; index: number }[] = WAYPOINTS.flatMap((w, i) =>
  "stop" in w ? [{ id: w.stop, u: CUMULATIVE[i] / TOTAL_LENGTH, index: i }] : [],
)

/** Which control points are destinations rather than tunable waypoints. */
export const JOURNEY_STOP_INDICES = new Set(JOURNEY_STOPS.map((s) => s.index))

/** Position and look-target at scroll fraction `u`, 0 at Home and 1 at
 *  Contact. `u` may sit slightly outside [0,1] -- the spring's rubber band
 *  overshoots the ends -- and both curves extrapolate gracefully there. */
export function journeyPose(u: number, position: THREE.Vector3, look: THREE.Vector3) {
  const clamped = Math.min(1, Math.max(0, u))
  JOURNEY_PATH.getPointAt(clamped, position)

  // Arc length -> segment + local fraction, so the look curve can be sampled
  // in index space and stay in step (see CUMULATIVE).
  const target = clamped * TOTAL_LENGTH
  let i = 0
  while (i < SEGMENTS - 1 && CUMULATIVE[i + 1] < target) i++
  const span = CUMULATIVE[i + 1] - CUMULATIVE[i]
  const local = span > 0 ? (target - CUMULATIVE[i]) / span : 0
  JOURNEY_LOOK.getPoint((i + local) / SEGMENTS, look)

  // Past the ends, carry on in a straight line rather than stalling -- the
  // rubber band is only ever a few percent, and a stalled camera at the limit
  // reads as the spring having broken.
  if (u !== clamped) {
    const edge = u < 0 ? -1 : 1
    const tangent = JOURNEY_PATH.getTangentAt(clamped)
    position.addScaledVector(tangent, (u - clamped) * TOTAL_LENGTH)
    look.addScaledVector(tangent, (u - clamped) * TOTAL_LENGTH * 0.5 * edge * edge)
  }
  return position
}

/** Sampled polyline, for the ?path debug overlay. */
export function journeyPolyline(divisions = 400) {
  return JOURNEY_PATH.getSpacedPoints(divisions)
}

export const JOURNEY_CONTROL_POINTS = POSITIONS
export const JOURNEY_LOOK_POINTS = LOOKS
