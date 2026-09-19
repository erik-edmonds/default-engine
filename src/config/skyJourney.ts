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

import { ISLAND_CAMERA_POSITION } from "@/config/positions"

/** How far the scroll can carry the sequence. The caption cues and every stop
 *  table below are keyed to this same axis. */
export const SKY_JOURNEY_DISTANCE = 600

/** How long the displayed offset takes to catch up to the scrolled-to target.
 *  Shared by the avatar and the camera deliberately -- two different smoothing
 *  constants would let them slide apart while the wheel is moving, and the
 *  whole sequence is the camera holding the avatar in frame. */
export const SKY_SCROLL_SMOOTH_TIME = 0.25

/** Where the avatar rests on the island, and how far both it and the camera
 *  rise on the way up. flyUp() in both controllers tweens by these. */
export const AVATAR_BASE_POSITION: [number, number, number] = [-1.3, -1.9, 1]
export const SKY_RISE = 100
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
  { at: 150, x: 1, rotY: Math.PI / 4 },
  { at: 375, x: -2.07, rotY: Math.PI / 2 }, // hold-start -- "Certified Scuba Diver"
  { at: 525, x: -2.07, rotY: Math.PI / 2 }, // hold-end -- "Let's Connect"
  { at: 600, x: 4, rotY: Math.PI },
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
    x,
    rotY,
    z: sampleStops(Z_STOPS, "z", offset),
    // Relative to wherever flyUp left it, which is what the controller adds it
    // to -- the absolute height depends on where the avatar started.
    yOffset: sampleStops(Y_STOPS, "yOffset", offset, (t) => t * t * t),
  }
}

// --- the camera ------------------------------------------------------------

/** The camera path, authored as an ORBIT AROUND THE AVATAR rather than as
 *  absolute world positions.
 *
 *  Framing is the whole job here, so it is expressed as the thing being
 *  guaranteed: a bearing, a horizontal distance and a height relative to the
 *  avatar. The avatar is then in shot by construction at every offset, and
 *  retuning the choreography cannot leave the camera pointing at empty sky --
 *  which is precisely what a table of absolute positions would allow.
 *
 *  `angle` is a bearing about the avatar, matching atan2(dx, dz): 0 puts the
 *  camera directly in front (+z), and it winds negative to orbit around as the
 *  avatar turns to face away.
 */
const CAMERA_STOPS = [
  // Stop 0 is DERIVED, not authored, so the camera cannot pop when the journey
  // takes over: it is exactly where flyUp leaves the camera relative to where
  // flyUp leaves the avatar. Change either fly-up and this follows.
  {
    at: 0,
    angle: Math.atan2(
      ISLAND_CAMERA_POSITION.x + SKY_CAMERA_RISE_X - AVATAR_BASE_POSITION[0],
      ISLAND_CAMERA_POSITION.z - AVATAR_BASE_POSITION[2],
    ),
    distance: Math.hypot(
      ISLAND_CAMERA_POSITION.x + SKY_CAMERA_RISE_X - AVATAR_BASE_POSITION[0],
      ISLAND_CAMERA_POSITION.z - AVATAR_BASE_POSITION[2],
    ),
    height: ISLAND_CAMERA_POSITION.y - AVATAR_BASE_POSITION[1],
  },
  // Swings round and closes in as the avatar turns to a quarter profile.
  { at: 150, angle: -0.55, distance: 11.5, height: 1.6 },
  // Profile, for the held beat the third caption lands on.
  { at: 375, angle: -1.25, distance: 9.8, height: 1.0 },
  // Closest approach -- "Let's Connect" is the most intimate moment in the
  // sequence, so the camera is nearest here.
  { at: 525, angle: -1.6, distance: 8.6, height: 0.8 },
  // The exit, spread over two stops rather than one.
  //
  // With a single stop at 600 the camera moved 12 units through the last leg
  // against about 2 for every leg before it -- a six-fold jump in rate, which
  // reads as a lurch rather than a departure. The avatar's own finale IS fast
  // (it breaks its hold and flies off), so the camera giving way gently is
  // what lets that read as the avatar leaving rather than the camera being
  // yanked after it.
  { at: 560, angle: -1.95, distance: 10.2, height: 1.9 },
  { at: 600, angle: -2.25, distance: 12.4, height: 3.4 },
]

/** How far above the avatar the camera aims. Positive drops the avatar a
 *  little low in frame, which leaves sky above it -- the cheapest way to make
 *  altitude read. */
const LOOK_HEIGHT = 0.6

/** Camera position and look-target at a given offset, given where the avatar
 *  currently is. Writes into the vectors provided rather than allocating: this
 *  runs every frame. */
export function cameraSkyPose(
  offset: number,
  avatar: { x: number; y: number; z: number },
  position: { set: (x: number, y: number, z: number) => void },
  look: { set: (x: number, y: number, z: number) => void },
) {
  const angle = sampleStops(CAMERA_STOPS, "angle", offset)
  const distance = sampleStops(CAMERA_STOPS, "distance", offset)
  const height = sampleStops(CAMERA_STOPS, "height", offset)
  position.set(
    avatar.x + Math.sin(angle) * distance,
    avatar.y + height,
    avatar.z + Math.cos(angle) * distance,
  )
  look.set(avatar.x, avatar.y + LOOK_HEIGHT, avatar.z)
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
