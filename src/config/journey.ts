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
 *  For reference when tuning, the terrain's measured reach by bearing --
 *  48.9k transformed vertices across 146 meshes, ocean and sky planes excluded,
 *  counting only geometry between y -8 and y +24 (the band a camera actually
 *  flies through; a deep underside is not something you have to go around):
 *
 *      bearing      0..135    reach  15.6   tops out at y  -0.4
 *      bearing    140..160    reach  25.1   tops out at y   6.3   (moon island -- Donate)
 *      bearing    165..220    reach  34.0   tops out at y  17.8   (Contact's, the tall one)
 *      bearing    225..245    reach  26.3   tops out at y   5.8   (the left tree -- Models)
 *      bearing    250..355    reach  15.4   tops out at y  -1.0
 *
 *  An earlier version of this table put the moon island at "bearings 120..135,
 *  reach 33.7". Both halves were wrong -- it spans 133..164 and reaches 25.1 --
 *  and because ROUTE_ARC and the leg-1 waypoint below were both written from
 *  it, the camera swung 22 units wider than anything required at bearing 128
 *  and then came back in. That swing is what "it goes out and in" was.
 *
 *  A waypoint clears the terrain when its radius exceeds the reach at its
 *  bearing. Re-measure rather than trusting this by eye: the clearance check in
 *  verification reads the shipped geometry, and it is the arbiter. */

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
  // Close in. Terrain reaches only 15.5 through these bearings, so there is
  // nothing out here to avoid -- an earlier 24 and 26 put the camera further
  // from the island than either end of the leg, for no reason, across what is
  // the longest passage in the journey.
  //
  // 18, not 20: the curve runs wider than its control points through here,
  // pulled outward by the wide waypoint that follows, so 20 measured 22.6 on
  // the path itself. These are the numbers to raise if the camera ever ends up
  // clipping the island's skirt.
  { bearing: 40, radius: 18, height: 1.5, look: [0, -1, 2] },
  { bearing: 95, radius: 19, height: 3, look: [0, 0, -2] },
  // This used to be radius 37 at height 10, "because the moon island reaches
  // r 33.6 through bearings 120-135". It does not -- it starts at bearing 133
  // and reaches 25.1, and out here the terrain stops at r 14.8 and y -0.6. The
  // old numbers swung the camera 17 units wider and 5 higher than anything
  // required, and then had to come back in for the arrival: that out-and-back
  // was the whole complaint about this leg.
  { bearing: 128, radius: 24, height: 5, look: [8, 4, -16] },
  // Where the moon island actually begins. Coming outside it HERE, rather than
  // 20 degrees early, is what lets the radius climb once instead of twice.
  { bearing: 140, radius: 29, height: 6.5, look: [10, 4, -18] },
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

// --- scroll -> path position ----------------------------------------------
//
// The scroll does not map straight onto the path. It holds at the destinations
// you travel through, so the camera arrives at a portal and STOPS there for a
// screen's worth of scrolling before moving on -- without which you sweep past
// the thing the destination exists for.
//
// Home and Contact get no band: Home is where the journey starts and Contact is
// where the scroll runs out, so both already hold on their own.
const DWELL_STOPS: JourneyStopId[] = ["moon-island", "left-tree"]

/** Screens of scrolling spent travelling, across the whole journey. */
export const JOURNEY_TRAVEL_SCREENS = 12
/** ...and spent held at each dwelling destination. */
export const JOURNEY_DWELL_SCREENS = 1
/** Total scrollable range, in screens. The spacer is one taller than this,
 *  since the scrollable range of a document is its height minus one viewport. */
export const JOURNEY_SCROLL_SCREENS =
  JOURNEY_TRAVEL_SCREENS + JOURNEY_DWELL_SCREENS * DWELL_STOPS.length

/** How much of a travel segment is spent ramping up to speed, and the same
 *  again slowing down into the stop at the far end.
 *
 *  Deliberately a fraction of each segment rather than an ease across the whole
 *  of it: easing a whole leg leaves the camera slow at both ends and quick
 *  through the middle, which is the "rushed through it" complaint wearing a
 *  different hat. This gives a trapezoid -- accelerate, hold a constant cruise,
 *  decelerate -- so speed is even for most of a passage and only changes where
 *  the camera is arriving or leaving. */
const RAMP = 0.18

/** Integral of a smoothstep ramp-up, cruise, ramp-down profile, normalised so
 *  f(0) = 0 and f(1) = 1. Its derivative (the speed) is continuous at both
 *  ends, so the camera never changes velocity abruptly.
 *
 *  Exported because a route flight wants exactly this profile too -- see
 *  flyRoute in CameraController. Anything else (a gsap power ease, say) peaks
 *  at roughly twice its own mean speed, which through a corner is the whole
 *  difference between travelling and being flung. */
export function trapezoid(t: number) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const a = RAMP
  // Integral of smoothstep 3x^2-2x^3 from 0 to x is x^3 - x^4/2; over the whole
  // ramp (x = 1) that is 1/2, hence the a/2 terms below.
  const area = 1 - a
  if (t < a) {
    const x = t / a
    return (a * (x ** 3 - (x ** 4) / 2)) / area
  }
  if (t <= 1 - a) return (a / 2 + (t - a)) / area
  const x = (1 - t) / a
  return (a / 2 + (1 - 2 * a) + a * (0.5 - (x ** 3 - (x ** 4) / 2))) / area
}

/** The scroll timeline: alternating travel segments and holds, each with the
 *  span of scroll it occupies and the stretch of path it covers. Built once
 *  from the destinations' own arc-length positions, so retuning a waypoint
 *  moves everything in step. */
const TIMELINE = (() => {
  const segments: { scroll: number; from: number; to: number; hold: boolean }[] = []
  let cursor = 0
  for (const stop of JOURNEY_STOPS) {
    if (stop.u > cursor) {
      segments.push({ scroll: (stop.u - cursor) * JOURNEY_TRAVEL_SCREENS, from: cursor, to: stop.u, hold: false })
      cursor = stop.u
    }
    if (DWELL_STOPS.includes(stop.id)) {
      segments.push({ scroll: JOURNEY_DWELL_SCREENS, from: stop.u, to: stop.u, hold: true })
    }
  }
  if (cursor < 1) segments.push({ scroll: (1 - cursor) * JOURNEY_TRAVEL_SCREENS, from: cursor, to: 1, hold: false })

  const total = segments.reduce((sum, s) => sum + s.scroll, 0)
  let start = 0
  return segments.map((s) => {
    const span = { ...s, start: start / total, end: (start + s.scroll) / total }
    start += s.scroll
    return span
  })
})()

/** Where along the path a scroll fraction (0..1 of the document) puts the
 *  camera. Monotonic, so scrolling back retraces exactly. */
export function journeyUForScroll(scroll: number) {
  const s = Math.min(1, Math.max(0, scroll))
  for (const seg of TIMELINE) {
    if (s > seg.end) continue
    if (seg.hold) return seg.from
    const span = seg.end - seg.start
    return seg.from + (seg.to - seg.from) * trapezoid(span > 0 ? (s - seg.start) / span : 1)
  }
  return 1
}

/** The scroll fraction at which each destination is first reached -- the start
 *  of its hold, for those that have one. Used by the tests, and handy for any
 *  future "jump to this destination" affordance. */
export const JOURNEY_STOP_SCROLL: { id: JourneyStopId; scroll: number; holdUntil: number }[] =
  JOURNEY_STOPS.map((stop) => {
    const hold = TIMELINE.find((seg) => seg.hold && seg.from === stop.u)
    const arrive = TIMELINE.find((seg) => !seg.hold && seg.to === stop.u)
    const scroll = hold ? hold.start : arrive ? arrive.end : stop.u === 0 ? 0 : 1
    return { id: stop.id, scroll, holdUntil: hold ? hold.end : scroll }
  })

// --- direct routes between destinations ------------------------------------
//
// Tapping a destination on the rail flies straight there. Scrolling the whole
// itinerary past every intermediate portal to reach the one you asked for is
// the behaviour of a scrollbar, not of a menu, and Donate -> Contact in
// particular would sweep through Models on the way -- announcing a place you
// did not choose, twice, before delivering the one you did.
//
// Rather than hand-authoring six paths (and twelve, counting both directions),
// generalise what the itinerary already is: an exterior arc around the
// cluster. One table of arc waypoints by bearing, and a route is the stretch of
// that arc between two destinations, walked the short way round.

/** What it takes to get past the world at a given bearing.
 *
 *  Radius only. There used to be a `minHeight` here as well, and it was doing
 *  active harm: it lifted the path 10 units at bearing 128 to clear a ridge
 *  whose top is at y -0.6, which is the vertical half of the swing-out-and-back.
 *  It is also unnecessary -- the reach above is measured across the WHOLE
 *  flight band, so a path outside it clears the terrain at any height the
 *  camera uses, and height is then free to interpolate straight between the two
 *  endpoints with no bump of its own.
 *
 *  Each entry carries the measured reach it was derived from, so the next
 *  person can tell a deliberate margin from a stale number. Sampled where the
 *  silhouette actually changes rather than at round bearings. */
const ROUTE_ARC: { bearing: number; radius: number }[] = [
  { bearing: 0, radius: 20 },    // reach 15.4
  { bearing: 40, radius: 20 },   // reach 15.6
  { bearing: 70, radius: 20 },   // reach 15.5
  { bearing: 95, radius: 20 },   // reach 15.5
  { bearing: 115, radius: 20 },  // reach 15.4
  // Was 37, from a table that put the moon island here. It is not here -- it
  // starts at bearing 133 -- and this is open water to r 14.8.
  { bearing: 128, radius: 20 },  // reach 14.8
  { bearing: 145, radius: 29 },  // reach 25.1  the moon island (Donate)
  { bearing: 160, radius: 29 },  // reach 24.4
  { bearing: 172, radius: 38 },  // reach 31.1
  // Contact's island is the tall one: it stands to y 17.8, so there is no
  // going over it and the radius has to do all the work. These carry a wider
  // margin than the rest of the table for that reason -- a reach+4 here
  // measured 2.93 units of real clearance, because the bin maxima understate
  // a silhouette this ragged and height cannot make up the difference.
  { bearing: 190, radius: 41 },  // reach 34.0
  { bearing: 212, radius: 40 },  // reach 33.1
  { bearing: 230, radius: 33 },  // reach 26.3  the left tree (Models)
  { bearing: 250, radius: 30 },  // reach 24.9
  { bearing: 270, radius: 20 },  // reach 15.1
  { bearing: 290, radius: 20 },  // reach 14.2
  { bearing: 310, radius: 20 },  // reach 15.3
  { bearing: 330, radius: 20 },  // reach 15.4
]

/** Where a travelling route looks: inward and slightly down, at a point on its
 *  own bearing a fraction of the way in. The look point orbits with the camera,
 *  so the cluster stays framed for the whole flight instead of sliding out of
 *  shot the way a fixed target would.
 *
 *  0.55 is not a taste value -- it is what the rest of the scene already does.
 *  Every destination's own authored aim, and every wide waypoint on the scroll
 *  itinerary, sits at this radius ratio:
 *
 *      moon-island 0.51   left-tree 0.61   upper 0.57
 *      itinerary waypoints at 128/172/212 deg: 0.48 / 0.45 / 0.56
 *
 *  An earlier 0.25 aimed twice as deep into the cluster as any of them, so the
 *  whole mismatch had to be paid off in the final segment: the look target
 *  moved 1.68x as far as the camera there against 0.25x everywhere else, which
 *  is a portal snapping across the frame on arrival. */
const ROUTE_LOOK_RADIUS = 0.55
const ROUTE_LOOK_DROP = 0.55

/** How much of the route at each end is spent blending the arc's own inward
 *  gaze into the destination's authored aim. Generous on purpose: the
 *  correction is small now that the radii agree, and spreading a small
 *  correction over a quarter of the flight is invisible, where concentrating
 *  even a small one into the last control-point segment is a flick. */
const ROUTE_LOOK_BLEND = 0.28

/** Degrees of bearing between control points. Even spacing is half of what
 *  makes a route smooth, and not for the obvious reason: `poseAt` converts the
 *  position's ARC LENGTH into the look curve's INDEX space, so a segment that
 *  is short in arc length makes the gaze sprint through a full segment's worth
 *  of look curve. The old construction took whatever bearings the clearance
 *  table happened to have, which put 8-degree segments next to 40-degree ones. */
const ROUTE_SAMPLE_DEG = 4

/** Fraction of the route at each end over which the terrain lift fades in.
 *  The two endpoints are authored camera viewpoints -- known-good positions
 *  that the scene is built around -- so nothing needs lifting AT them, and
 *  tapering is what keeps a route starting and ending exactly where the
 *  scroll journey would leave you.
 *
 *  Short, because a long taper suppresses the lift exactly where it is most
 *  needed: Contact's island sits right beside Contact's own viewpoint, so at
 *  0.3 the first 43 degrees out of Contact had almost no lift and the route
 *  passed the island at 3.56 units. The endpoints stay pinned either way --
 *  this only decides how fast the lift arrives once you have left one. */
const ROUTE_LIFT_TAPER = 0.15

/** Passes of a [1,2,1]/4 kernel run over the lift before it is added to the
 *  base profile. This is the part that rounds the moon island's shoulder: the
 *  lift is a max(), and a max of two smooth functions still has a corner where
 *  they cross. Smoothing the lift alone leaves the base interpolation -- and
 *  therefore both endpoints -- untouched. */
const ROUTE_LIFT_SMOOTHING = 6

function bearingOf(p: THREE.Vector3) {
  return (THREE.MathUtils.radToDeg(Math.atan2(p.x, p.z)) + 360) % 360
}

/** Signed angle from `a` to `b`, in (-180, 180]. Its sign is which way round
 *  the arc is shorter, which is the whole routing decision. */
function shortestSweep(a: number, b: number) {
  return ((((b - a) % 360) + 540) % 360) - 180
}

const smoothstep = (t: number) => t * t * (3 - 2 * t)

/** What the world demands at a given bearing, as a CONTINUOUS function rather
 *  than ten isolated points.
 *
 *  ROUTE_ARC is unchanged and still means the same thing; this only reads it
 *  differently. Treating its entries as waypoints to visit is what produced a
 *  radius profile that stepped 15 -> 18 -> 18 -> 37 -> 28 on the way to Donate.
 *  Treating them as a requirement to stay outside lets a route meet the
 *  constraint without adopting its shape. */
function arcRequirement(bearing: number): number {
  const b = ((bearing % 360) + 360) % 360
  const table = ROUTE_ARC
  let lo = table[table.length - 1]
  let hi = table[0]
  for (let i = 0; i < table.length; i++) {
    if (table[i].bearing <= b && (i === table.length - 1 || table[i + 1].bearing > b)) {
      lo = table[i]
      hi = table[(i + 1) % table.length]
      break
    }
  }
  // Below the first entry we are in the wrap-around gap between the last and
  // the first, which the loop above cannot express.
  if (b < table[0].bearing) {
    lo = table[table.length - 1]
    hi = table[0]
  }
  let span = ((hi.bearing - lo.bearing) % 360 + 360) % 360
  if (span === 0) span = 360
  const k = smoothstep(Math.min(1, (((b - lo.bearing) % 360 + 360) % 360) / span))
  return THREE.MathUtils.lerp(lo.radius, hi.radius, k)
}

/** One in-place smoothing pass set over an array, endpoints held fixed. */
function smoothSeries(values: number[], passes: number) {
  let current = values
  for (let pass = 0; pass < passes; pass++) {
    const next = current.slice()
    for (let i = 1; i < current.length - 1; i++) {
      next[i] = (current[i - 1] + 2 * current[i] + current[i + 1]) / 4
    }
    current = next
  }
  return current
}

export interface Route {
  /** Total arc length, so a caller can scale the flight's duration to the
   *  distance rather than flying a short hop as slowly as a long one. */
  length: number
  /** Position and look-target at `t` in 0..1, sampled by arc length so the
   *  flight holds a constant speed -- the same two-curve lockstep the scroll
   *  journey uses, and for the same reason. */
  poseAt: (t: number, position: THREE.Vector3, look: THREE.Vector3) => THREE.Vector3
  /** For the ?path debug overlay and for the clearance check. */
  polyline: (divisions?: number) => THREE.Vector3[]
  /** ...and where it is looking at each of those points, so the gaze can be
   *  measured from outside too. A path that clears the islands while whipping
   *  the view around is still wrong, and only this makes that visible. */
  lookPolyline: (divisions?: number) => THREE.Vector3[]
}

function buildRoute(positions: THREE.Vector3[], looks: THREE.Vector3[]): Route {
  const path = new THREE.CatmullRomCurve3(positions, false, "centripetal")
  const look = new THREE.CatmullRomCurve3(looks, false, "centripetal")
  path.arcLengthDivisions = 4000
  look.arcLengthDivisions = 4000

  const segments = positions.length - 1
  const lengths = path.getLengths(segments * SEGMENT_SAMPLES)
  const cumulative = Array.from({ length: positions.length }, (_, i) => lengths[i * SEGMENT_SAMPLES])
  const total = cumulative[cumulative.length - 1]

  const poseAt = (t: number, position: THREE.Vector3, target: THREE.Vector3) => {
    const u = Math.min(1, Math.max(0, t))
    path.getPointAt(u, position)
    const at = u * total
    let i = 0
    while (i < segments - 1 && cumulative[i + 1] < at) i++
    const span = cumulative[i + 1] - cumulative[i]
    const local = span > 0 ? (at - cumulative[i]) / span : 0
    look.getPoint((i + local) / segments, target)
    return position
  }

  return {
    length: total,
    poseAt,
    polyline: (divisions = 160) => path.getSpacedPoints(divisions),
    lookPolyline: (divisions = 160) => {
      const out: THREE.Vector3[] = []
      const p = new THREE.Vector3()
      for (let i = 0; i <= divisions; i++) {
        const l = new THREE.Vector3()
        poseAt(i / divisions, p, l)
        out.push(l)
      }
      return out
    },
  }
}

const ROUTE_CACHE = new Map<string, Route>()

/** The direct route from one destination to another: out of the first
 *  viewpoint, round the short way on the exterior arc, into the second.
 *
 *  The profile is sampled evenly in bearing and interpolated between the two
 *  viewpoints' own radius and height, with the terrain lifted in on top where
 *  the world requires it. That ordering is the point. The previous version
 *  strung the clearance table's entries together as waypoints, which meant a
 *  route inherited the table's shape whether or not the terrain at that bearing
 *  had anything to do with where it was going -- Home to Donate swung out to
 *  r37 for the moon island and back in to r28 over the last 20 degrees, a 25.7
 *  degree turn per 0.75 units of travel. Built this way the same trip turns
 *  6.8 degrees, and still clears the island.
 *
 *  Deterministic and cached -- every route is the same curve every time it is
 *  asked for, which is what lets the clearance check verify them all once. */
export function routeBetween(from: JourneyStopId, to: JourneyStopId): Route | null {
  if (from === to) return null
  const key = `${from}>${to}`
  const cached = ROUTE_CACHE.get(key)
  if (cached) return cached

  const a = STOP_VIEWPOINTS[from]
  const b = STOP_VIEWPOINTS[to]
  const start = bearingOf(a.position)
  const sweep = shortestSweep(start, bearingOf(b.position))
  const span = Math.abs(sweep)
  const direction = Math.sign(sweep) || 1

  const steps = Math.max(8, Math.ceil(span / ROUTE_SAMPLE_DEG))
  const radiusFrom = Math.hypot(a.position.x, a.position.z)
  const radiusTo = Math.hypot(b.position.x, b.position.z)
  const lookFrom = lookOf({ stop: from })
  const lookTo = lookOf({ stop: to })

  const bearings: number[] = []
  const baseRadius: number[] = []
  const baseHeight: number[] = []
  const lift: number[] = []

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const bearing = start + direction * span * t
    // smoothstep rather than a plain lerp so the radius and height ease out of
    // one viewpoint and into the other instead of changing at a constant rate
    // and stopping dead.
    const k = smoothstep(t)
    const r = THREE.MathUtils.lerp(radiusFrom, radiusTo, k)
    const taper = smoothstep(Math.min(1, Math.min(t, 1 - t) / ROUTE_LIFT_TAPER))

    bearings.push(bearing)
    baseRadius.push(r)
    // Height is purely the interpolation between the two viewpoints -- nothing
    // lifts it. See the note on ROUTE_ARC: the radius requirement is measured
    // across the whole flight band, so clearing it horizontally clears it at
    // every height, and a height bump would only be a bump.
    baseHeight.push(THREE.MathUtils.lerp(a.position.y, b.position.y, k))
    lift.push(taper * Math.max(0, arcRequirement(bearing) - r))
  }

  const smoothLift = smoothSeries(lift, ROUTE_LIFT_SMOOTHING)

  const positions: THREE.Vector3[] = []
  const looks: THREE.Vector3[] = []

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const theta = THREE.MathUtils.degToRad(bearings[i])
    const radius = baseRadius[i] + smoothLift[i]
    const height = baseHeight[i]

    // The ends are the authored viewpoints exactly, not the profile's idea of
    // them -- a jump has to arrive framed the way a scroll arrival is.
    positions.push(
      i === 0
        ? a.position.clone()
        : i === steps
          ? b.position.clone()
          : new THREE.Vector3(radius * Math.sin(theta), height, radius * Math.cos(theta)),
    )

    const lookRadius = radius * ROUTE_LOOK_RADIUS
    const target = new THREE.Vector3(
      lookRadius * Math.sin(theta),
      height * ROUTE_LOOK_DROP,
      lookRadius * Math.cos(theta),
    )
    const towardFrom = 1 - smoothstep(Math.min(1, t / ROUTE_LOOK_BLEND))
    const towardTo = 1 - smoothstep(Math.min(1, (1 - t) / ROUTE_LOOK_BLEND))
    if (towardFrom > 0) target.lerp(lookFrom, towardFrom)
    if (towardTo > 0) target.lerp(lookTo, towardTo)

    looks.push(i === 0 ? lookFrom.clone() : i === steps ? lookTo.clone() : target)
  }

  const route = buildRoute(positions, looks)
  ROUTE_CACHE.set(key, route)
  return route
}

/** Every ordered pair of destinations, for the clearance check to enumerate. */
export const JOURNEY_STOP_IDS: JourneyStopId[] = JOURNEY_STOPS.map((s) => s.id)

/** Sampled polyline, for the ?path debug overlay. */
export function journeyPolyline(divisions = 400) {
  return JOURNEY_PATH.getSpacedPoints(divisions)
}

export const JOURNEY_CONTROL_POINTS = POSITIONS
export const JOURNEY_LOOK_POINTS = LOOKS
