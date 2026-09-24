/** The sky journey: one scroll axis, 0 to 600, that both the avatar and the
 *  camera read.
 *
 *  This table used to be three separate copies of the same axis. The stop
 *  tables and their interpolation lived privately inside AvatarController;
 *  `SKY_JOURNEY_DISTANCE = 600` was hardcoded again in app/page.tsx; and the
 *  caption thresholds (75 / 225 / 375 / 525) were a third statement of it. A
 *  caption could therefore be retimed to a moment the choreography no longer
 *  passed through, and nothing would say so.
 *
 *  Same role as config/journey.ts for the island journey, and the same reason:
 *  one table, so the pieces cannot drift apart.
 *
 *  The important thing about this sequence, and the reason the camera path
 *  exists at all: THE AVATAR BARELY MOVES. Over the whole 600 units it drifts
 *  about 5 units of x, 2.5 of z and rises 3 right at the end -- it is a held
 *  hover, not a flight. Every bit of travel the viewer feels is the camera's,
 *  which is exactly why the sequence read as inert while
 *  CameraController.beginSkyJourney and setSkyOffset were empty functions.
 */

import {
  CAMERA_ABOVE,
  CAMERA_BEHIND,
  CAMERA_LOOK_ABOVE,
  flightBasis,
  flightHeading,
  makeFlightBasis,
} from "@/config/flightFrame"

/** How far the scroll can carry the sequence. The caption cues and every stop
 *  table below are keyed to this same axis. Defined in config/skyAxis.ts and
 *  re-exported here, so the many existing importers are undisturbed -- see that
 *  file for why it cannot live in this one. */
export { SKY_JOURNEY_DISTANCE } from "@/config/skyAxis"

/** How long the displayed offset takes to catch up to the scrolled-to target.
 *  Shared by the avatar and the camera deliberately -- two different smoothing
 *  constants would let them slide apart while the wheel is moving, and the
 *  whole sequence is the camera holding the avatar in frame. */
export const SKY_SCROLL_SMOOTH_TIME = 0.25

/** Where the avatar rests on the island, and how far both it and the camera
 *  rise on the way up.
 *
 *  Both fly-ups DO tween by SKY_RISE now. They used to hardcode `+= 100` while
 *  this comment claimed otherwise, and the camera driver read this constant --
 *  so changing it moved the camera's idea of the avatar's altitude without
 *  moving the avatar, framing empty sky and snapping on the first frame. All
 *  three read it now, so raising the journey is this one number. */
export const AVATAR_BASE_POSITION: [number, number, number] = [-1.3, -1.9, 1]
export const SKY_RISE = 160
/** The camera's flyUp also drifts sideways by this much. */
export const SKY_CAMERA_RISE_X = 1

// --- interpolation ---------------------------------------------------------

export function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function catmullRomTangents(values: number[], times: number[]) {
  return values.map((v, i) => {
    if (i === 0 || i === values.length - 1) return 0
    // A keyframe sharing its value with a neighbor marks a deliberate hold --
    // zero its tangent instead of the usual wide-neighbor Catmull-Rom slope,
    // or the hold "leaks" motion from its OTHER neighbor and produces a
    // visible dip/wobble mid-hold.
    if (values[i - 1] === v || values[i + 1] === v) return 0
    return (values[i + 1] - values[i - 1]) / (times[i + 1] - times[i - 1])
  })
}

function hermite(p0: number, m0: number, p1: number, m1: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1
}

/** Sample a table of `{ at, ... }` stops with smoothstep between them. */
function sampleStops<K extends string>(
  stops: ({ at: number } & Record<K, number>)[],
  key: K,
  offset: number,
  ease: (t: number) => number = smoothstep,
) {
  const last = stops[stops.length - 1]
  const clamped = Math.min(Math.max(offset, 0), last.at)
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (clamped <= b.at) {
      const t = (clamped - a.at) / (b.at - a.at)
      return a[key] + (b[key] - a[key]) * ease(t)
    }
  }
  return last[key]
}

// --- the avatar's choreography ---------------------------------------------

/** x and facing, as a Catmull-Rom through authored keyframes. The two middle
 *  entries share a value on purpose: that is the hold, and it is timed to the
 *  third and fourth captions. */
const KEYFRAMES = [
  { at: 0, x: AVATAR_BASE_POSITION[0], rotY: 0 },
  { at: 150, x: 1, rotY: 0.18 },
  { at: 375, x: -2.07, rotY: -0.14 }, // "Certified Scuba Diver"
  { at: 525, x: -2.07, rotY: -0.14 }, // hold -- "Let's Connect"
  { at: 600, x: 4, rotY: 0.3 },
]
const KEYFRAME_TIMES = KEYFRAMES.map((k) => k.at)
const X_TANGENTS = catmullRomTangents(KEYFRAMES.map((k) => k.x), KEYFRAME_TIMES)
const ROT_TANGENTS = catmullRomTangents(KEYFRAMES.map((k) => k.rotY), KEYFRAME_TIMES)

const Z_STOPS = [
  { at: 0, z: AVATAR_BASE_POSITION[2] },
  { at: 150, z: AVATAR_BASE_POSITION[2] - 1.5 },
  { at: 525, z: AVATAR_BASE_POSITION[2] - 1.5 },
  { at: 600, z: AVATAR_BASE_POSITION[2] + 1 },
]

/** Stays flat until the very end, then lifts as the avatar turns away. */
const Y_STOPS = [
  { at: 0, yOffset: 0 },
  { at: 525, yOffset: 0 },
  { at: 600, yOffset: 3 },
]

/** Where the sky journey is anchored: the avatar's ACTUAL position when the
 *  sequence begins, not where the table assumes it was.
 *
 *  This is the jump at the top of the climb, and it was the avatar rather than
 *  the camera. The table below is absolute -- KEYFRAMES[0].x and Z_STOPS[0].z
 *  are AVATAR_BASE_POSITION -- while the avatar is wherever it has actually got
 *  to when the Poke Ball is clicked. Measured: the avatar sat at (0, -2.76,
 *  5.80) and the first sky frame wrote (-1.30, ., 1.00), a 4.8-unit teleport
 *  directly away from a camera that had not moved. The subject's distance went
 *  2.87 -> 5.81, so it halved on screen between two frames.
 *
 *  Note the asymmetry that hid this: AvatarController already captured the
 *  avatar's real HEIGHT into skyBaseY and applied yOffset relative to it, for
 *  exactly this reason. Only x and z were absolute. They are all relative now,
 *  and the capture lives here rather than in the controller so that the camera
 *  and the corridor -- which both derive their own positions from this function
 *  -- move with it instead of having to be told separately. */
const skyOrigin = {
  x: AVATAR_BASE_POSITION[0],
  y: AVATAR_BASE_POSITION[1],
  z: AVATAR_BASE_POSITION[2],
}

/** Called once, before the climb, with the avatar's live island position. */
export function setSkyOrigin(x: number, y: number, z: number) {
  skyOrigin.x = x
  skyOrigin.y = y
  skyOrigin.z = z
}

export function avatarSkyPose(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), KEYFRAMES[KEYFRAMES.length - 1].at)
  let x = KEYFRAMES[KEYFRAMES.length - 1].x
  let rotY = KEYFRAMES[KEYFRAMES.length - 1].rotY
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i]
    const b = KEYFRAMES[i + 1]
    if (clamped <= b.at) {
      const dt = b.at - a.at
      const t = (clamped - a.at) / dt
      x = hermite(a.x, X_TANGENTS[i] * dt, b.x, X_TANGENTS[i + 1] * dt, t)
      rotY = hermite(a.rotY, ROT_TANGENTS[i] * dt, b.rotY, ROT_TANGENTS[i + 1] * dt, t)
      break
    }
  }
  return {
    // Authored as a displacement from the table's own start, then applied to
    // wherever the avatar actually was. At offset 0 this is exactly the
    // captured position, so nothing moves when the sky takes over.
    x: skyOrigin.x + (x - KEYFRAMES[0].x),
    // Facing: the flight's heading, turned to face the CAMERA, plus a small
    // authored lean.
    //
    // The +PI is the hero shot. Props spawn on the far side of the avatar and
    // travel toward the camera, so the order down the lens is camera, avatar,
    // oncoming field -- and for the avatar to be seen rather than followed it
    // has to face back down that lens. Every frame of this sequence so far has
    // shown its face, which is the framing this preserves.
    //
    // The authored part used to swing 0 -> PI/4 -> PI/2 -> PI. That was
    // choreography for the old orbit, where the camera swung round to meet the
    // turn; against a camera that holds station it just spins the subject on
    // the spot. It is a lean now -- under 20 degrees -- so the character has
    // life without ever turning its back.
    rotY: rotY + flightHeading(offset) + Math.PI,
    z: skyOrigin.z + (sampleStops(Z_STOPS, "z", offset) - Z_STOPS[0].z),
    // Relative to wherever flyUp left it, which is what the controller adds it
    // to -- the absolute height depends on where the avatar started.
    yOffset: sampleStops(Y_STOPS, "yOffset", offset, (t) => t * t * t),
    /** The absolute sky height, so the camera and the corridor stop each doing
     *  `AVATAR_BASE_POSITION[1] + SKY_RISE + yOffset` on their own -- three
     *  copies of one fact, and the copies assumed a base the avatar may not
     *  have been standing on. */
    y: skyOrigin.y + SKY_RISE + sampleStops(Y_STOPS, "yOffset", offset, (t) => t * t * t),
  }
}

// --- the camera ------------------------------------------------------------

/** The camera rides the FLIGHT FRAME: a constant offset behind and above the
 *  avatar, always looking at it.
 *
 *  What this replaces, and why. The old path was authored as an orbit -- a
 *  bearing, a distance and a height, each keyframed independently -- and it
 *  swept 129 degrees around an avatar that barely moved, with the distance
 *  accordioning 5.70 -> 11.5 -> 9.8 -> 8.6 -> 10.2 -> 12.4. Every bit of motion
 *  the viewer felt was the camera circling the subject, and because the props
 *  travelled along world -Z regardless, they crossed the frame sideways as soon
 *  as the bearing had wound round far enough.
 *
 *  Now there is no bearing to author. The camera's offset is constant in frame
 *  coordinates, so it cannot orbit; turning is expressed by turning the FRAME,
 *  which takes the avatar and the corridor with it. See config/flightFrame.ts.
 *
 *  `setSkyEntryStop` / `resetSkyEntryStop` are kept as no-ops-with-a-reason:
 *  the entry pose used to have to be measured and patched into stop 0 because
 *  the climb left the camera somewhere the table did not predict. The climb now
 *  ends on this very pose by construction, so there is nothing to pin. */

/** Retained so callers do not have to change; the entry pose is no longer a
 *  keyframe that can disagree with where the climb actually ends. */
export function setSkyEntryStop(_entry?: { angle: number; distance: number; height: number }) {
  void _entry
  // Intentionally empty. See the note above.
}

export function resetSkyEntryStop() {
  // Intentionally empty. See the note above.
}

/** Camera position and look-target at a given offset, given where the avatar
 *  currently is. Writes into the vectors provided rather than allocating: this
 *  runs every frame. */
export function cameraSkyPose(
  offset: number,
  avatar: { x: number; y: number; z: number },
  position: { set: (x: number, y: number, z: number) => void },
  look: { set: (x: number, y: number, z: number) => void },
) {
  const basis = flightBasis(offset, cameraBasisScratch)
  // Behind: against the heading, i.e. on the side the props have already
  // passed. The avatar is therefore between the camera and the oncoming field.
  position.set(
    avatar.x - basis.fx * CAMERA_BEHIND,
    avatar.y + CAMERA_ABOVE,
    avatar.z - basis.fz * CAMERA_BEHIND,
  )
  look.set(avatar.x, avatar.y + CAMERA_LOOK_ABOVE, avatar.z)
}

const cameraBasisScratch = makeFlightBasis()

/** Where the paper corridor is centred: the avatar's LIVE position.
 *
 *  Writes into a caller-supplied object rather than a module-level scratch,
 *  because the callers are per-frame component callbacks and a mutable binding
 *  at module scope in their own file is exactly what react-hooks/immutability
 *  objects to. Here it is simply a function of the offset.
 *
 *  Centring on the live avatar rather than on its offset-0 position matters:
 *  the avatar drifts six units of x over the journey, so a world pinned to
 *  where it started leaves the subject walking out of the middle of its own
 *  sky -- which is how a caption slot and the avatar ended up in the same
 *  place at the end of the run. */
export function corridorOrigin(offset: number, out: { x: number; y: number; z: number }) {
  const pose = avatarSkyPose(offset)
  out.x = pose.x
  out.y = pose.y
  out.z = pose.z
  return out
}

// --- the captions ----------------------------------------------------------

/** Timed to the choreography above: the third and fourth land on the hold's
 *  start and end, which is why those two keyframes share a value. */
export const SKY_TEXT_CUES: { threshold: number; text: string; align: "left" | "right" | "center" }[] = [
  { threshold: 75, text: "Digital Nomad", align: "left" },
  { threshold: 225, text: "Pokémon Trainer at Heart", align: "right" },
  { threshold: 375, text: "Certified Scuba Diver", align: "left" },
  { threshold: 525, text: "Let's Connect — Contact Me", align: "center" },
]
