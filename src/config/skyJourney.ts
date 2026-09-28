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
import { SKY_JOURNEY_DISTANCE } from "@/config/skyAxis"
export { SKY_JOURNEY_DISTANCE }

/** How long the displayed offset takes to catch up to the scrolled-to target.
 *  Shared by the avatar and the camera deliberately -- two different smoothing
 *  constants would let them slide apart while the wheel is moving, and the
 *  whole sequence is the camera holding the avatar in frame. */
export const SKY_SCROLL_SMOOTH_TIME = 0.12

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
/** The stop tables below were authored against a 600-unit axis and their times
 *  are still written that way, because that is the shape somebody drew. This
 *  maps them onto whatever the axis actually is.
 *
 *  Without it the avatar's whole drift -- and its hold, which is timed to the
 *  third and fourth blocks of text -- finishes inside the first fifth of the
 *  journey and it simply hovers for the rest. The axis has been lengthened
 *  three times now (600 -> 1500 -> 3000) and the cue thresholds were made
 *  fractions of it for exactly this reason; these were the last tables still
 *  quoting the old number. */
const CHOREO_SPAN = 600
const at = (t: number) => (t / CHOREO_SPAN) * SKY_JOURNEY_DISTANCE

const KEYFRAMES = [
  { at: at(0), x: AVATAR_BASE_POSITION[0], rotY: 0 },
  { at: at(150), x: 1, rotY: 0.18 },
  { at: at(375), x: -2.07, rotY: -0.14 }, // "Certified Scuba Diver"
  { at: at(525), x: -2.07, rotY: -0.14 }, // hold -- "Let's Connect"
  { at: at(600), x: 4, rotY: 0.3 },
]
const KEYFRAME_TIMES = KEYFRAMES.map((k) => k.at)
const X_TANGENTS = catmullRomTangents(KEYFRAMES.map((k) => k.x), KEYFRAME_TIMES)
const ROT_TANGENTS = catmullRomTangents(KEYFRAMES.map((k) => k.rotY), KEYFRAME_TIMES)

const Z_STOPS = [
  { at: at(0), z: AVATAR_BASE_POSITION[2] },
  { at: at(150), z: AVATAR_BASE_POSITION[2] - 1.5 },
  { at: at(525), z: AVATAR_BASE_POSITION[2] - 1.5 },
  { at: at(600), z: AVATAR_BASE_POSITION[2] + 1 },
]

/** Stays flat until the very end, then lifts as the avatar turns away. */
const Y_STOPS = [
  { at: at(0), yOffset: 0 },
  { at: at(525), yOffset: 0 },
  { at: at(600), yOffset: 3 },
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
/** How far the aim slides toward the text, in world units at the subject's own
 *  distance. BROUGHT DOWN FROM 1.5, which was thirteen degrees and carried the
 *  subject a third of the way across the frame.
 *
 *  The composition is now described as two half-screens "split exactly down
 *  the middle where the dragonite is" -- so he has to STAY near the middle,
 *  with the words filling one half and the clouds the other. Thirteen degrees
 *  put him well inside the clouds' half and left the text's half empty but for
 *  the text. 0.55 is five degrees: still a camera that drifts and does not
 *  quite settle on its subject, which is what the reference does, without
 *  moving him off the line the layout is built around. */
const SKY_LOOK_TILT = 0.55
/** And how far the camera itself eases the other way. Deliberately small: this
 *  is the parallax that makes the lean read as a move, not a second pan. */
const SKY_CAMERA_SLIDE = 0.2
/** A little rise over the same ramp, so the lean is not purely lateral.
 *
 *  APPLIED TO THE CAMERA AND THE AIM EQUALLY, which is the whole subtlety. The
 *  first version raised the camera and dropped the aim -- two changes that both
 *  pitch the lens up, by (0.22 + 0.18) / 6.3 = 3.6 degrees between them. The
 *  corridor places its props against viewAxisUp, which is derived from the
 *  camera's RESTING pitch, so the whole cloud field rode 0.19 ndc high the
 *  moment the camera leaned -- measured at 0.257, and "the clouds are placed
 *  too high" is a note this scene has already had twice.
 *
 *  Lifting both by the same amount is a pure translation: the pitch is
 *  untouched, viewAxisUp stays true, and the band stays centred. */
const SKY_CAMERA_LIFT = 0.12

export function cameraSkyPose(
  offset: number,
  avatar: { x: number; y: number; z: number },
  position: { set: (x: number, y: number, z: number) => void },
  look: { set: (x: number, y: number, z: number) => void },
) {
  const basis = flightBasis(offset, cameraBasisScratch)

  // IT LOOKS AT THE WRITING, NOT AT THE SUBJECT.
  //
  // The reference is a camera that never quite settles on the character: it
  // drifts, and its aim sits off toward whatever is being said, so the subject
  // is held at the edge of the frame with the words in the space it leaves.
  // Aimed dead at the avatar, as this was, the subject is pinned to the middle
  // for the whole journey and any text has to be painted over the top of it --
  // which is exactly what the paper signs were working around.
  //
  // The aim goes TOWARD the text's side, which pushes the subject to the other
  // one; the camera itself eases the opposite way, so the move has parallax in
  // it and reads as a camera rather than a pan. Both are scaled by the block's
  // own weight, so the lean arrives and leaves with the words.
  const focus = skyTextFocus(offset)
  const lean = focus.lean
  // The rise is unsigned: it happens whenever the camera is off the subject at
  // all, whichever way it has gone.
  const leaning = Math.abs(lean)
  position.set(
    avatar.x - basis.fx * CAMERA_BEHIND - basis.rx * lean * SKY_CAMERA_SLIDE,
    avatar.y + CAMERA_ABOVE + leaning * SKY_CAMERA_LIFT,
    avatar.z - basis.fz * CAMERA_BEHIND - basis.rz * lean * SKY_CAMERA_SLIDE,
  )
  look.set(
    avatar.x + basis.rx * lean * SKY_LOOK_TILT,
    avatar.y + CAMERA_LOOK_ABOVE + leaning * SKY_CAMERA_LIFT,
    avatar.z + basis.rz * lean * SKY_LOOK_TILT,
  )
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
 *  start and end, which is why those two keyframes share a value.
 *
 *  Each is now a small editorial block -- a numbered eyebrow, a headline and a
 *  paragraph -- rather than the single line a paper card could hold. The cards
 *  are gone: they were signs hanging in the scene, three or four words wide
 *  because that is all that stays legible at CAPTION_DEPTH, and a sign is not
 *  what the reference does. The text is DOM now, set opposite the subject, so
 *  it can be as long as it needs to be and is read by a screen reader for free.
 *
 *  SIDE alternates, and the camera leans with it -- see skyTextFocus. */
const CUE_CONTENT = [
  {
    text: "Digital Nomad",
    body: "Work happens wherever the wifi holds. Five countries in the last two years, most of the good ideas arriving somewhere between a departure lounge and a borrowed kitchen table.",
  },
  {
    text: "Pokémon Trainer at Heart",
    body: "The first thing I ever built was a type-matchup calculator, written badly, for a schoolyard argument I was losing. The habit of turning an argument into a model never really went away.",
  },
  {
    text: "Certified Scuba Diver",
    body: "Open water since 2019. Thirty metres down there is no signal, no backlog and nothing to optimise -- which turns out to be the only reliable way I have found to think about a hard problem.",
  },
  {
    text: "Let's Connect — Contact Me",
    body: "Always glad to talk about data, models, or the least sensible place you have ever opened a laptop. The contact portal is at the end of this flight.",
  },
]

/** Where each caption becomes current, as a FRACTION of the scroll axis.
 *
 *  Fractions rather than four magic numbers, so lengthening the axis spreads
 *  the captions with it instead of crowding them all into the first third. The
 *  thresholds used to be 75/225/375/525 against a 600-unit axis.
 *
 *  EVEN QUARTERS now, where they used to be 0.125/0.375/0.625/0.875. That set
 *  gave the last block half the room of the others, and the corridor is timed
 *  against these spans -- one cloud crosses per block (see SKY_SECTION_START)
 *  -- so an odd-length span meant one cloud crossing at twice the speed of
 *  the rest. The first block simply starts at the lead instead of a fraction
 *  past it. */
const CUE_FRACTIONS = [0, 0.25, 0.5, 0.75]

/** A PAGE OF SCROLL BEFORE ANYTHING IS SAID.
 *
 *  The sky used to arrive with the first block already up. Asked for the other
 *  way round: you land, you look at where you are, and the words begin once
 *  you have started moving. A tenth of the axis is roughly two screens of
 *  wheel at the current sensitivity.
 *
 *  The fractions above are mapped into what is LEFT of the axis rather than
 *  simply shifted, so the four blocks still divide the rest of the journey in
 *  the proportions they were authored in. */
export const SKY_TEXT_LEAD = Math.round(SKY_JOURNEY_DISTANCE * 0.1)

export const SKY_TEXT_CUES: {
  threshold: number
  text: string
  /** The numbered label above the headline, in the reference's own idiom. */
  eyebrow: string
  body: string
  /** Which half of the frame the block is set in: -1 left, +1 right. */
  side: -1 | 1
}[] = CUE_CONTENT.map((cue, i) => ({
  threshold: SKY_TEXT_LEAD + Math.round(CUE_FRACTIONS[i] * (SKY_JOURNEY_DISTANCE - SKY_TEXT_LEAD)),
  text: cue.text,
  body: cue.body,
  eyebrow: `Fact #${String(i + 1).padStart(2, "0")}`,
  side: i % 2 === 0 ? -1 : 1,
}))

/** Which block owns this point on the axis, which side it is set on, and how
 *  far the camera is leaning toward it.
 *
 *  One function for two consumers that must not disagree: the DOM block is
 *  chosen by the index, and the camera leans by the lean. Blocks own the axis
 *  the way the paper cards did -- each from its own cue to the next, the first
 *  owning everything before its cue so the sky is never wordless on arrival,
 *  the last running to the end.
 *
 *  THE LEAN NEVER RESTS AT ZERO, and that is the point of its shape. A
 *  trapezoid per block -- rise, hold, fall -- puts the camera back dead on the
 *  subject between every pair of blocks, so the subject snaps to the middle of
 *  the frame four times over the journey and the text has nowhere to be.
 *  Measured with one: nine of twenty-five samples had the subject within two
 *  percent of centre. The lean instead HOLDS at one side for the body of a
 *  block and crosses to the other during a window centred on the threshold --
 *  the same instant the DOM block switches sides. It passes through zero, but
 *  as a crossing rather than a plateau.
 *
 *  The one exception is the start: it eases in from zero over the first part of
 *  the opening block, because the climb hands over at offset 0 with the camera
 *  aimed dead at the avatar, and a lean already at full strength would be a
 *  thirteen-degree snap on the first frame of the sky. */
const SPAN_START = SKY_TEXT_CUES.map((cue, i) => (i === 0 ? SKY_TEXT_LEAD : cue.threshold))
const SPAN_END = SKY_TEXT_CUES.map((_, i) => SKY_TEXT_CUES[i + 1]?.threshold ?? SKY_JOURNEY_DISTANCE)

/** Half the cross-over window, as a share of the SHORTER of the two spans it
 *  joins. At or below a quarter, the windows at either end of a span cannot
 *  overlap -- which is what lets the two branches below be written apart. */
const HANDOVER_SHARE = 0.24
/** How much of the opening block is spent easing in from dead-on. */
const ENTRY_SHARE = 0.35

/** Where the journey settles: the middle of each block's span.
 *
 *  The scroll is helped into these and holds there for a beat before the next
 *  gesture breaks it loose -- see advanceSkyScroll. The middle rather than the
 *  threshold, because the middle is where the lean is at full strength and the
 *  composition is what it was designed to be; the threshold is the hand-over,
 *  which is the one place you do not want to stop. */
export const SKY_TEXT_HOLDS: readonly number[] = SKY_TEXT_CUES.map(
  (_, i) => (SPAN_START[i] + SPAN_END[i]) / 2,
)

/** Where the block that owns this point on the axis BEGAN, as far as the
 *  corridor is concerned.
 *
 *  The wordless lead is a section in its own right -- it has to be. Folding it
 *  into the first block's would make that block's section 975 units long
 *  against a 667-unit crossing, so its cloud would finish early and leave the
 *  sky empty for the rest of it. As its own section the lead gets the cloud
 *  that is already in view when you arrive (CORRIDOR_START_AXIAL) and that
 *  cloud has just about left as the first words appear.
 *
 *  The corridor uses this to time exactly one crossing per block -- a cloud
 *  is seeded at the far end as a section begins and has left by the time the
 *  next does, which is what lets "one cloud per text group, never on the same
 *  side as the words" hold by construction instead of by prediction. */
/** Which section the corridor is in: -1 for the wordless opening, then one
 *  per block. A small ordinal, which is what the corridor keys its scatter on
 *  -- the section's START offset was serving as that and made a poor index
 *  (it is a number in the thousands, and parity off it is meaningless). */
export function skySectionIndex(offset: number) {
  return skyTextFocus(offset).index
}

export function skySectionStart(offset: number) {
  const focus = skyTextFocus(offset)
  return focus.index < 0 ? 0 : SPAN_START[focus.index]
}

/** Which half the corridor should put its cloud in, at any point on the axis
 *  -- including before the first block, where it takes the opening block's. */
export function skyCorridorSide(offset: number): -1 | 1 {
  const focus = skyTextFocus(offset)
  return (focus.index < 0 ? SKY_TEXT_CUES[0].side : SKY_TEXT_CUES[focus.index].side) === 1 ? -1 : 1
}

export function skyTextFocus(offset: number) {
  // Before the lead there is no block, so there is nothing for the camera to
  // lean toward either -- it holds the subject square until the words start.
  if (offset < SKY_TEXT_LEAD) return { index: -1, side: -1 as -1 | 1, lean: 0 }
  let index = SKY_TEXT_CUES.length - 1
  for (let i = 0; i < SKY_TEXT_CUES.length; i++) {
    if (offset < SPAN_END[i]) {
      index = i
      break
    }
  }
  const side = SKY_TEXT_CUES[index].side
  const start = SPAN_START[index]
  const end = SPAN_END[index]
  const span = Math.max(1, end - start)
  let lean: number = side

  const next = SKY_TEXT_CUES[index + 1]
  if (next) {
    const w = HANDOVER_SHARE * Math.min(span, SPAN_END[index + 1] - end)
    if (offset > end - w) lean = side + (next.side - side) * smoothstep((offset - (end - w)) / (2 * w))
  }

  const prev = SKY_TEXT_CUES[index - 1]
  if (prev) {
    const w = HANDOVER_SHARE * Math.min(span, start - SPAN_START[index - 1])
    if (offset < start + w) lean = prev.side + (side - prev.side) * smoothstep((offset - (start - w)) / (2 * w))
  } else {
    // FROM THE BLOCK'S OWN START, not from zero on the axis.
    //
    // This read the raw offset, which was the same thing while the opening
    // block began at 0. It does not any more: SKY_TEXT_LEAD holds the words
    // back for the first tenth of the journey, and the lean is zero over that
    // stretch because there is nothing to lean toward -- so measuring the ramp
    // from zero meant it was already 93% run by the time the block appeared,
    // and the camera would have snapped almost the whole way into its lean on
    // the frame the first words arrived.
    const w = span * ENTRY_SHARE
    const into = offset - start
    if (into < w) lean = side * smoothstep(Math.max(0, into) / w)
  }

  return { index, side, lean }
}
