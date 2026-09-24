/** The flight frame: one heading, and everything that moves with it.
 *
 *  The sky journey used to be a camera ORBITING a subject that barely moved --
 *  129 degrees of sweep around an avatar whose own excursion was six units --
 *  while the props it flew past travelled along world -Z regardless. Those two
 *  facts cannot both be right, and the visible result was the one reported:
 *  the camera turns, and the clouds cross the frame sideways instead of coming
 *  at you. Measured, the angle between "toward the camera" and a prop's
 *  velocity ran 5.7 degrees at the start, 72 by the third caption, 92 by the
 *  fourth, and 128 at the end -- by which point the props are receding.
 *
 *  So the orbit is gone, and in its place is a single heading that EVERYTHING
 *  reads: the camera, the avatar, the corridor of props, the speed streaks and
 *  the captions. Turn the heading and the whole assembly banks together, which
 *  is the brief exactly -- the camera turns, the Dragonite turns, and the
 *  clouds still come straight down the lens.
 *
 *  The two invariants are then properties of the FRAME rather than promises a
 *  keyframe table has to keep:
 *
 *    1. the camera's offset from the avatar is constant in frame coordinates,
 *       so it cannot orbit;
 *    2. the corridor runs along the frame's forward axis, so props always
 *       approach down the view axis.
 *
 *  Neither can drift as the choreography is retuned, because neither is
 *  authored -- they fall out of the basis. */

import { SKY_JOURNEY_DISTANCE } from "@/config/skyAxis"

/** The turns: NONE. The flight is dead straight.
 *
 *  A left-then-right bank was tried, at 31.5 and -25.8 degrees -- a 57-degree
 *  total sweep. Because the whole world banks together the composition never
 *  changed, but the BACKDROP swept past, and with a hundred stripes around the
 *  circle that reads as the camera swinging a long way round even though its
 *  position relative to the subject never moved a unit. The instruction after
 *  seeing it was unambiguous: no change in the camera path.
 *
 *  The table and the machinery stay, flat. Everything downstream reads the
 *  heading, so turns can be restored by editing these two numbers and nothing
 *  else -- and with a constant heading every one of those readers is simply
 *  evaluating a constant, which costs nothing. */
export const HEADING_STOPS = [
  { at: 0, heading: 0 },
  { at: SKY_JOURNEY_DISTANCE, heading: 0 },
]

/** The heading the whole frame is built around, captured from the camera at
 *  the moment the sky takes over.
 *
 *  This is the fix for "towards the end it's almost a 270 degree camera
 *  rotation", and the table above is why that reading was wrong the first
 *  time. Flattening HEADING_STOPS to zero does not mean "the camera does not
 *  turn" -- it means "the sky is built along world +Z". The camera arrives
 *  from the island aimed wherever the island had it, measured at yaw 171
 *  degrees, and the hand-over then has to spin it to yaw 0 to match a sky
 *  nailed to an axis it was never pointed down. The trace is unambiguous: yaw
 *  holds within 2.5 degrees for the entire climb, from y -1.3 all the way to
 *  y 158.7, and then moves 171 degrees in the three samples AFTER the camera
 *  has stopped. All of the turn, at the end, exactly as reported.
 *
 *  So the sky is no longer nailed to an axis. It is built along whatever
 *  heading the camera already has, which makes the hand-over yaw-free by
 *  construction -- including when the viewer has orbited the island first, a
 *  case no constant could have covered. */
let baseHeading = 0

/** Called once as the sky takes over, with the camera's own yaw. */
export function setFlightBaseHeading(heading: number) {
  baseHeading = heading
}

export function flightBaseHeading() {
  return baseHeading
}

/** Where the camera sits relative to the avatar, in frame coordinates.
 *
 *  BEHIND means "on the near side of the avatar", i.e. between the avatar and
 *  where the props have already gone. Constant for the whole journey: the
 *  5.70 -> 11.5 -> 9.8 -> 8.6 -> 10.2 -> 12.4 accordion the old table did was
 *  half of the speed spikes, and with a banking flight it buys nothing. */
export const CAMERA_BEHIND = 6.3
export const CAMERA_ABOVE = 0.95
/** How far above the avatar the camera aims. Positive drops the avatar lower in
 *  frame, which leaves sky above it -- the cheapest way to make altitude read.
 *
 *  Nearly zero now, and the standoff above is a little longer, because BOTH
 *  were chosen for a 50-degree lens and the sky's is now 36. Narrowing the lens
 *  twice magnified the subject by a third without moving the framing, and the
 *  figure ran off the bottom of the picture: measured at ndcY -1.32 to +0.47,
 *  cropped by a third and sitting well below centre. The asymmetry is the tell
 *  -- it was the AIM that was wrong for the lens, not just the distance, so
 *  most of this is fixing the aim rather than backing away and undoing the
 *  zoom that was asked for. */
export const CAMERA_LOOK_ABOVE = 0.05

/** How far the view axis drops per unit of depth.
 *
 *  The camera sits CAMERA_ABOVE the avatar and aims CAMERA_LOOK_ABOVE it, so it
 *  is pitched slightly down -- 3.5 degrees. Over the 5.7 units to the subject
 *  that is nothing, which is why it went unnoticed; over the 135 units the
 *  corridor now runs it is 8.3 units. */
const VIEW_PITCH_SLOPE = (CAMERA_ABOVE - CAMERA_LOOK_ABOVE) / CAMERA_BEHIND

/** The height of the VIEW AXIS at a given depth, relative to the corridor
 *  origin -- i.e. where the middle of the frame actually is out there.
 *
 *  Props are placed relative to this rather than to a horizontal plane through
 *  the avatar. A flat band at the avatar's height is only centred in frame at
 *  the avatar's own distance; at 135 units the frame's middle has dropped 7.3
 *  units below it, so the whole cloud field rode about an eighth of the screen
 *  high -- which is the "clouds are placed too high". Following the axis, the
 *  band is centred at every depth, and it stays centred if the camera's
 *  standoff or aim is ever retuned. */
export function viewAxisUp(ahead: number) {
  return CAMERA_ABOVE - VIEW_PITCH_SLOPE * (ahead + CAMERA_BEHIND)
}

// --- sampling ---------------------------------------------------------------

function catmullRomTangents(values: number[], times: number[]) {
  return values.map((v, i) => {
    if (i === 0 || i === values.length - 1) return 0
    // A keyframe sharing its value with a neighbour is a deliberate hold; zero
    // its tangent rather than letting the wide-neighbour slope leak motion
    // into it from the far side.
    if (values[i - 1] === v || values[i + 1] === v) return 0
    return (values[i + 1] - values[i - 1]) / (times[i + 1] - times[i - 1])
  })
}

function hermite(p0: number, m0: number, p1: number, m1: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1
}

const HEADING_TIMES = HEADING_STOPS.map((s) => s.at)
const HEADING_VALUES = HEADING_STOPS.map((s) => s.heading)
const HEADING_TANGENTS = catmullRomTangents(HEADING_VALUES, HEADING_TIMES)

/** The heading at a given scroll offset.
 *
 *  Hermite with real Catmull-Rom tangents, NOT the per-segment smoothstep the
 *  rest of the sky tables use. smoothstep has zero derivative at both ends, so
 *  a table of them comes to a dead stop and re-accelerates at every keyframe --
 *  measured on the old camera path as full stops at offsets 150, 375, 525 and
 *  560 and a thirtyfold acceleration spike between 525 and 540. That is the
 *  "harsh turns". A Hermite with continuous tangents simply does not have the
 *  failure mode. */
export function flightHeading(offset: number) {
  const last = HEADING_STOPS[HEADING_STOPS.length - 1]
  const clamped = Math.min(Math.max(offset, 0), last.at)
  for (let i = 0; i < HEADING_STOPS.length - 1; i++) {
    const a = HEADING_STOPS[i]
    const b = HEADING_STOPS[i + 1]
    if (clamped <= b.at) {
      const dt = b.at - a.at
      const t = (clamped - a.at) / dt
      return baseHeading + hermite(a.heading, HEADING_TANGENTS[i] * dt, b.heading, HEADING_TANGENTS[i + 1] * dt, t)
    }
  }
  return baseHeading + last.heading
}

// --- the basis --------------------------------------------------------------

export interface FlightBasis {
  /** Unit vector the flight is heading along. Props travel against it. */
  fx: number
  fz: number
  /** Unit vector to the flight's right. */
  rx: number
  rz: number
  heading: number
}

/** The basis at an offset. Written into a caller-supplied object: this is read
 *  several times a frame by several components. */
export function flightBasis(offset: number, out: FlightBasis): FlightBasis {
  const h = flightHeading(offset)
  const sin = Math.sin(h)
  const cos = Math.cos(h)
  out.heading = h
  out.fx = sin
  out.fz = cos
  // RIGHT, and the sign is measured rather than assumed.
  //
  // three's camera looks down its own -Z, so for a camera aimed along F with
  // world up, its right axis is F x Y = (-cos h, 0, sin h). The obvious
  // spelling -- (cos h, -sin h) -- is the negative of that, i.e. the frame's
  // LEFT, and everything placed with it lands on the wrong side. Measured
  // before the fix: a caption authored at side +3.9 rendered at ndc x -0.29
  // where the arithmetic said +0.28. Same magnitude, opposite sign.
  out.rx = -cos
  out.rz = sin
  return out
}

export function makeFlightBasis(): FlightBasis {
  return { fx: 0, fz: 1, rx: 1, rz: 0, heading: 0 }
}

/** Place something given in frame coordinates into world coordinates.
 *
 *  `ahead` is distance along the heading from the avatar, `side` is to the
 *  frame's right, `up` is world up (the flight does not roll). This is the one
 *  implementation -- the corridor, the streaks and the captions all go through
 *  it, so none of them can end up in a different space from the others, which
 *  is precisely how the props ended up crossing the frame sideways. */
export function placeInFlightFrame(
  basis: FlightBasis,
  origin: { x: number; y: number; z: number },
  ahead: number,
  side: number,
  up: number,
  out: { set: (x: number, y: number, z: number) => void },
) {
  out.set(
    origin.x + basis.fx * ahead + basis.rx * side,
    origin.y + up,
    origin.z + basis.fz * ahead + basis.rz * side,
  )
}
