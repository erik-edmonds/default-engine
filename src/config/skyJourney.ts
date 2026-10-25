/** ====================================================================
 *  PARKED. Nothing on the live site can reach the sky journey.
 *
 *  It was a bonus rather than part of the site's job, so its entry point was
 *  removed: the Poke Ball that launched it is scenery now (no click handler,
 *  no magnetic target, no hover), and `handleUpClick` in app/page.tsx -- the
 *  launch sequence -- is kept but has no caller. With no launch,
 *  `inSkyJourney` never turns true, so PaperSky never renders, useSkyLenis
 *  never builds a Lenis, the twenty-four-screen spacer never mounts and
 *  SkyContact never appears.
 *
 *  NOTHING HERE WAS DELETED. This file, skyCards.ts, PaperSky, SkyCard,
 *  SkyPage, SkyText, CardScene, useSkyLenis and skyScroll are all intact and
 *  still type-check, because the work in them is real and the journey is
 *  meant to come back.
 *
 *  TO RE-ENABLE, in order:
 *    1. app/page.tsx -- have something call `handleUpClick()` again (it was
 *       `handleDragoniteRelease`, fired by the Poke Ball's `onRelease`).
 *    2. models/Pokeball.tsx -- restore the onClick, the magnetic target and
 *       the hover; `close()` on the imperative handle still works.
 *    3. canvas/Scene.tsx -- pass `onRelease` back to <Pokeball>.
 *    4. models/FlyingDragonite.tsx -- uncomment the module-scope preload, or
 *       accept a lazy fetch on first render.
 *    5. config/achievements.ts -- restore "ascent" and "voyager", and the
 *       `unlock("voyager")` call in page.tsx's journey rAF.
 *
 *  Known outstanding work on it, from the last round: the parallax section
 *  after the three facts, and the contact beat that follows it.
 *  ==================================================================== */

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
import { skyFrame } from "@/helpers/skyFrame"
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
  // NO LEAN IN PORTRAIT.
  //
  // The lean exists to open up one half of a wide frame for a block of text
  // and push the subject into the other half. A phone has no second half --
  // the words are stacked on the flight axis above the subject there (see
  // SkyCaptionBillboard) -- so there is nothing to make room for, and leaning
  // only drags the one thing worth looking at off centre. Measured before
  // this: an on-axis block reading ndc 0.41 and 0.81 purely from the camera
  // turning toward where it would have been on a desktop.
  //
  // Read from the live frame rather than passed in, because every caller of
  // this is a frame callback and the alternative is threading a viewport
  // through the whole choreography. skyFrame imports nothing, so there is no
  // cycle back into this file.
  const lean = skyFrame.portrait ? 0 : focus.lean
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
/** THE FIVE BLOCKS, AND WHY THERE ARE STILL FIVE.
 *
 *  These were all personal register -- nomad, Pokémon, scuba, side project --
 *  151 words that told you what Erik is like and nothing about what he does.
 *  The sky is also the hardest place on the site to reach, behind the Poké
 *  Ball, so it is the worst place to spend a visitor's attention on trivia
 *  alone. Each block now carries one professional fact and keeps its hook.
 *
 *  THE COUNT DID NOT CHANGE, deliberately. The corridor is timed against
 *  these sections -- one cloud crosses per block (SKY_SECTION_START) -- so
 *  adding blocks without lengthening SKY_JOURNEY_DISTANCE makes every cloud
 *  cross faster, and lengthening the axis changes a pace that took three
 *  rounds to settle and that has been signed off. Rewriting five blocks costs
 *  nothing geometric; adding a sixth re-opens all of it.
 *
 *  THE BODY CEILING IS ABOUT 36 WORDS. Not a guess: that is the longest of
 *  the blocks this replaces, which is the longest length known to fit, and
 *  portrait paints the same words into a 210px column (see paint() in
 *  SkyCaptionBillboard) where a longer block grows downward with nothing
 *  clamping it. Nothing below exceeds it. */
/** THE JOURNEY IS FOUR SECTIONS NOW, NOT ONE LONG CORRIDOR.
 *
 *  "I want to change the movement of the sky scene completely... Instead of
 *  it looking like it is moving forward in the clouds, I want it to just
 *  look like it is moving through a regular scroll. But this scene will be
 *  separated into 4 distinct sections."
 *
 *    1  ARRIVAL   the corridor as it is -- the subject on its string and the
 *                 cardboard clouds flying past. Short: one line, and then it
 *                 stops.
 *    2  DRIFT     the flying stops. The subject crosses the frame left to
 *                 right while the words alternate sides opposite it, each
 *                 appearing in place rather than flying in.
 *    3  SCENES    a clean cut. Text with a small card under it; the card
 *                 opens into a full-screen painted parallax that is scrolled
 *                 through for two screens or more, then shuts again.
 *    4  FAREWELL  a clean cut back to the corridor, briefly, and then the
 *                 subject is drawn up out of frame and the contact card
 *                 arrives.
 *
 *  Each beat declares the section it belongs to, how it is staged, and how
 *  much of the axis it is worth. WEIGHT IS THE IMPORTANT ONE: the spans used
 *  to be even fifths, which is fine when every block is a paragraph flying
 *  past and wrong the moment one of them is a parallax scene that has to
 *  last "at least two screens". A parallax beat is worth three of a line of
 *  text, and the axis is divided in those proportions. */
export type SkyBeatMode = "intro" | "side" | "parallax" | "outro"

const CUE_CONTENT: {
  section: 1 | 2 | 3 | 4
  mode: SkyBeatMode
  text: string
  body: string
  eyebrow: string
  /** How much of the axis this beat is worth, relative to the others. */
  weight: number
  /** parallax beats only: which folder under public/images/cards. */
  folder?: string
}[] = [
  // -- 1. ARRIVAL ----------------------------------------------------------
  {
    section: 1,
    mode: "intro",
    eyebrow: "",
    text: "Get to know me",
    body: "",
    weight: 1,
  },

  // -- 2. DRIFT ------------------------------------------------------------
  {
    section: 2,
    mode: "side",
    eyebrow: "Fact #01",
    text: "Data Scientist, Mostly Remote",
    body: "Models, computer vision, and the visualisation that makes them legible. Work happens wherever the wifi holds -- five countries in two years, most good ideas arriving between a departure lounge and a borrowed kitchen table.",
    weight: 1.15,
  },
  {
    section: 2,
    mode: "side",
    eyebrow: "Fact #02",
    text: "Photographs In, Scenes Out",
    body: "Gaussian splatting is the work I would lead with: a few million fitted gaussians turning ordinary photographs into a scene you can fly a camera through, in real time, in a browser.",
    weight: 1.15,
  },
  {
    section: 2,
    mode: "side",
    eyebrow: "Fact #03",
    text: "Pokémon Trainer at Heart",
    body: "The first thing I ever built was a type-matchup calculator, written badly, for a schoolyard argument I was losing. Turning an argument into a model is still the job -- lately on driving policies, in CARLA.",
    weight: 1.15,
  },

  // -- 3. SCENES -----------------------------------------------------------
  //
  // THREE WINDOWS, ON IMAGE FOLDERS 1, 2 AND 3.
  //
  // Each is one turn of the kprverse cycle: a flat page, a window that rises
  // from the bottom of the screen and grows as it rises, a full-screen
  // parallax scrolled down about a screen, and then the window shrinking
  // away again.
  //
  // THE COPY ON TWO OF THEM IS A PLACEHOLDER and is marked as one. Which
  // text pairs with which folder is still to be decided; the headings below
  // are there so the beat has something to draw while that is settled.
  {
    section: 3,
    mode: "parallax",
    folder: "1",
    eyebrow: "Fact #04",
    text: "Certified Scuba Diver",
    body: "Open water since 2019. Thirty metres down there is no signal, no backlog and nothing to optimise -- which turns out to be the only reliable way I have found to think about a hard problem.",
    weight: 3.4,
  },
  {
    section: 3,
    mode: "parallax",
    folder: "2",
    eyebrow: "Placeholder",
    text: "Second Scene",
    body: "Placeholder copy for the second parallax window. Replace this heading and body with the text that belongs on the plates in public/images/cards/2.",
    weight: 3.4,
  },
  {
    section: 3,
    mode: "parallax",
    folder: "3",
    eyebrow: "Placeholder",
    text: "Third Scene",
    body: "Placeholder copy for the third parallax window. Replace this heading and body with the text that belongs on the plates in public/images/cards/3.",
    weight: 3.4,
  },

  // -- 4. FAREWELL ---------------------------------------------------------
  {
    section: 4,
    mode: "outro",
    eyebrow: "Get in touch",
    text: "Let's Connect",
    body: "Available for freelance and contract work: modelling, computer vision, simulation, and making the results legible to whoever is paying for them. Glad to talk about any of it.",
    weight: 1.5,
  },
]

/** Where each beat starts, as a fraction of the axis after the lead.
 *
 *  Cumulative WEIGHT rather than even steps. A parallax beat needs three
 *  times the room of a line of text and would otherwise get the same fifth
 *  of the axis as everything else. */
const CUE_FRACTIONS = (() => {
  const total = CUE_CONTENT.reduce((n, c) => n + c.weight, 0)
  let run = 0
  return CUE_CONTENT.map((c) => {
    const at = run / total
    run += c.weight
    return at
  })
})()

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
  /** Read head-on rather than passed, so it sits on the flight axis instead
   *  of in one half of the frame. True for the intro and the contact card. */
  centred?: boolean
  /** The numbered label above the headline, in the reference's own idiom. */
  eyebrow: string
  body: string
  /** Which half of the frame the block is set in: -1 left, +1 right. */
  side: -1 | 1
  /** Which of the four sections this beat belongs to, and how it is staged. */
  section: 1 | 2 | 3 | 4
  mode: SkyBeatMode
  /** parallax beats only: which folder of plates it opens into. */
  folder?: string
}[] = CUE_CONTENT.map((cue, i) => ({
  threshold: SKY_TEXT_LEAD + Math.round(CUE_FRACTIONS[i] * (SKY_JOURNEY_DISTANCE - SKY_TEXT_LEAD)),
  text: cue.text,
  body: cue.body,
  eyebrow: cue.eyebrow,
  section: cue.section,
  mode: cue.mode,
  folder: cue.folder,
  // ALTERNATING, AND COUNTED WITHIN THE SECTION. The drift's whole
  // composition is the subject crossing one way while the words answer from
  // the other side, so what matters is the beat's place in ITS OWN run, not
  // its index in a table that also holds the intro and the contact card.
  side: (CUE_CONTENT.slice(0, i).filter((c) => c.section === cue.section).length % 2 === 0
    ? -1
    : 1) as -1 | 1,
  // Centred where there is no other half of the frame to balance against:
  // the intro arrives before the subject has moved off the axis, and by the
  // contact card he has been hauled out of shot entirely.
  centred: cue.mode === "intro" || cue.mode === "outro",
}))

/** The beat at a point on the axis, for anything that needs to know which
 *  section it is in without recomputing the focus. */
/** Which of the parallax beats a cue index is -- first, second or third.
 *
 *  Counted across the run rather than taken from the index itself, so a
 *  beat inserted earlier in the journey does not reshuffle the windows.
 *  SkyCard uses it to pick the window's style; SkyPage uses it to work out
 *  where that window will rest, so the page's copy can sit clear of it. */
export function skyParallaxOrdinal(index: number) {
  let n = 0
  for (let i = 0; i < index; i++) if (SKY_TEXT_CUES[i].mode === "parallax") n++
  return n
}

/** The current beat's index, or -1. */
export function skyBeatIndex(offset: number) {
  return skyTextFocus(offset).index
}

export function skyBeatAt(offset: number) {
  const i = skyTextFocus(offset).index
  return i < 0 ? null : SKY_TEXT_CUES[i]
}

/** Which of the four sections the journey is in. Section 1 before the first
 *  beat opens, since that is the arrival. */
export function skySection(offset: number): 1 | 2 | 3 | 4 {
  return skyBeatAt(offset)?.section ?? 1
}

/** Whether the corridor -- the cardboard clouds flying at the lens -- should
 *  be running.
 *
 *  Sections 1 and 4 only. The flying IS the arrival and the farewell; the
 *  two middle sections are "just moving through a regular scroll", and a
 *  cloud rushing past the camera is the single loudest contradiction of
 *  that. */
export function skyCorridorActive(offset: number) {
  const s = skySection(offset)
  return s === 1 || s === 4
}

/** HOW STRONGLY THE OUTER CLOUDS RUN, 0..1.
 *
 *  The corridor proper is a boolean: sections 1 and 4 only, because "the
 *  flying IS the arrival and the farewell" and a cloud rushing the lens
 *  contradicts the middle sections. That is right for the corridor's own
 *  cloud, which crosses the whole frame.
 *
 *  It is too blunt for the small outer ones. With the corridor gated off AND
 *  the velocity lines carrying the same gate, nothing in section 2's frame
 *  moves with the scroll at all -- the camera's heading is flat, the
 *  subject's authored excursion is a few units, and the sky dome is eight
 *  hundred units out. Four and a half screens of scrolling with no response
 *  to the scrolling is its own part of "laggy, floaty", and it is not
 *  something a scroll fix can reach.
 *
 *  So they keep running through the middle at a fraction of their strength:
 *  far enough back to be weather rather than traffic, present enough that
 *  the picture answers the wheel. Ramped across the two boundaries rather
 *  than stepped, because a field of seven clouds changing opacity on one
 *  frame is exactly the pop the fade distances exist to prevent. */
const EDGE_GAIN_QUIET = 0.3
/** How far either side of a section boundary the gain takes to change. */
const EDGE_GAIN_RAMP = 150

export function skyEdgeCloudGain(offset: number) {
  const s = skySection(offset)
  const loud = s === 1 || s === 4
  // Distance to the nearest boundary between a loud section and a quiet one.
  // Sections 2 and 3 are contiguous, so only the two outer seams matter.
  const opensAt = SKY_TEXT_CUES[1]?.threshold ?? 0
  const closesAt = SKY_TEXT_CUES[SKY_TEXT_CUES.length - 1]?.threshold ?? SKY_JOURNEY_DISTANCE
  const edge = Math.min(Math.abs(offset - opensAt), Math.abs(offset - closesAt))
  const t = smoothstep(Math.min(1, Math.max(0, edge / EDGE_GAIN_RAMP)))
  // At the seam itself both sides agree on the midpoint, which is what makes
  // this continuous across it.
  const near = (1 + EDGE_GAIN_QUIET) / 2
  return loud ? near + (1 - near) * t : near + (EDGE_GAIN_QUIET - near) * t
}

/** Which block owns this point on the axis, which side it is set on, how far
 *  through its turn it is, and how far the camera is leaning toward it.
 *
 *  A BLOCK DOES NOT FILL ITS SECTION. It has a turn in the middle of one, and
 *  there is empty sky either side of it -- "give more space in between texts".
 *  SKY_TEXT_ACTIVE is how much of the section the turn takes.
 *
 *  THE LEAN IS A PULSE THAT STARTS AND ENDS AT NOTHING, which is the other
 *  half of the same note. It used to hold at one side for the body of a block
 *  and cross straight to the other at the hand-over, so the camera swung from
 *  full left to full right in one movement with no rest between -- "it looks
 *  harshly and quickly to the text, then immediately to the other side... it
 *  should look at the text, and after it passes, return back to neutral before
 *  looking at the other text."
 *
 *  A raised cosine does exactly that, and it is chosen over the obvious
 *  half-sine because its SLOPE is zero at both ends as well as its value: the
 *  camera does not start or stop turning abruptly, it eases out of neutral and
 *  back into it. Between one block's turn and the next it is simply still. */
const SKY_TEXT_ACTIVE = 0.82


function pulse(u: number) {
  return 0.5 * (1 - Math.cos(2 * Math.PI * u))
}

// --- the cards -------------------------------------------------------------

/** A BLOCK IS A CARD, AND A CARD IS A SCENE WITH ITS OWN SCROLL.
 *
 *  "Each card that the text are in should be like a full screen scene, that
 *  starts out as a small card, but on scroll it expands to take up the full
 *  screen then the user scrolls through the content of this card scene, then
 *  the card retracts back to a small card, and the 'Overscene' of the main
 *  sky scene continues."
 *
 *  The five phases below are cut out of the block's OWN turn, so there is no
 *  second scroller and no state machine. The thing that makes a nested scroll
 *  hard -- deciding when the inner one takes the wheel and when it hands it
 *  back -- simply does not arise: there is one axis, the reader is always on
 *  it, and scrolling backwards retraces exactly.
 *
 *      turn 0 ──── .12 ──── .22 ─────────────── .84 ──── .93 ──── 1
 *           approach  expand       INSIDE        contract  depart
 *           flies in   grows to    its own       back to   sky
 *           small      fullscreen  scene scrolls  a card   resumes
 *
 *  Why these numbers. INSIDE is 62% because the card's scene is the content
 *  and everything else is transition -- "it should scroll for longer inside
 *  the card, right now it barely stays inside there". It was 52% of a shorter
 *  turn, which came to about sixteen wheel notches; it is now 62% of a longer
 *  one, nearer twenty-seven, and the axis grew to pay for it rather than the
 *  transitions being squeezed (see SKY_JOURNEY_DISTANCE).
 *
 *  Contract stays quicker than expand, and depart quicker than approach:
 *  arriving somewhere wants more ceremony than leaving it, which is what both
 *  reference clips show. */
/** RISING AND GROWING ARE TWO MOVES, NOT ONE.
 *
 *  They used to be the same number. `open` drove both the card's size and
 *  its height on the screen, and SkyCard refused to draw the node at all
 *  while `open` was 0 -- so the card did not exist for the whole of its
 *  approach and then appeared already growing, half off the bottom edge.
 *  "The card doesn't appear on the screen then expands, it starts expanding
 *  immediately from the bottom. It doesn't look like it was a hole that was
 *  passing through."
 *
 *  On the reference the card is simply part of the page: it sits there,
 *  whole and still, as one more element in a layout, and only then does it
 *  open. So there are two numbers and a dwell between them, and another
 *  dwell on the way out:
 *
 *      0 ── .07 ── .14 ──── .26 ─────────── .80 ── .90 ─ .94 ─ 1
 *        rise  REST  grow      INSIDE         close  REST  sink
 *        0→1        0→1      scene scrolls    1→0         1→0
 *
 *  The rest is 7% of the turn at each end, which at this axis is a couple
 *  of wheel notches -- enough to read as a card on a page rather than a
 *  pause. */
/** THE PARALLAX RUN: ONE PAGE, AND A PLATE THAT TURNS OVER.
 *
 *  Three scenes, one portal. The question the whole of this section
 *  answers is how you get from one scene to the next with a single hole to
 *  draw them through, and it has now been wrong twice:
 *
 *    Per-beat windows that appeared and vanished inside each beat's active
 *    middle. Measured: 1552 units -- 24% of the run -- with a page up and
 *    no hole on it. "The page is missing the hole."
 *
 *    Holes as positions on a scrolling page, travelling up and handing
 *    over at the seam. With one portal that hand-over is a teleport from
 *    the top of the frame to the bottom, and measured, 9-14% of the hole
 *    was still on screen when it happened: "it does a weird jump." Drawing
 *    the mask a second time at the other edge hid the jump and introduced
 *    a phantom card above the page on the way in.
 *
 *  THE PLATE TURNS OVER INSTEAD. It stays dead centre and rotates about a
 *  vertical axis: one face is the scene you were in, the other the scene
 *  you are going to. Halfway through it is edge-on -- no width at all --
 *  and that is where the dressed scene changes. There is nothing to see at
 *  the moment of the swap, so there is nothing to jump, nothing to
 *  duplicate, and no stretch of page without a hole.
 *
 *  It also pays for something that was being worked around: switching the
 *  scene costs a React render and lands a frame late, which used to be
 *  covered by deliberately drawing one frame of the previous art. Edge-on,
 *  that frame is invisible for free. */

/** How far the page travels, in journey units, coming in and going out.
 *
 *  INSIDE SECTION 3'S OWN SPAN, not either side of it. The slide used to
 *  start 420 units BEFORE the run, which is 420 units of the previous
 *  beat -- and that beat is only 737 long with its words up for 605 of
 *  them, so the page began covering Fact #03 less than a fifth of the way
 *  through it: "fact #3 is on the screen for only a split second then it
 *  turns immediately into fact #4". The same at the far end, where the
 *  slide-out sat on top of the contact beat's opening. */
const PAGE_SLIDE = 420

/** One scene's turn on the page, 0..1.
 *
 *      0 ──── .10 ──── .22 ──── .34 ─────────────── .80 ────── 1
 *       arrive   REST    grow        INSIDE          flip away
 *      (first   small                              shrink AND turn
 *       scene   card,                              right over, both
 *       only)   tilting                            finishing together
 *
 *  THE SHRINK AND THE HALF-TURN ARE ONE MOVE and they end on the same
 *  frame: "the parallax first screen shrinking and flipping at the same
 *  time to a small square which is the other parallax scene." So the whole
 *  180 degrees lives in the last fifth of a slot, and the next slot opens
 *  already resting as a small card of its own scene -- rather than the flip
 *  straddling the seam, which would have the plate still turning while it
 *  is meant to be sitting still being tilted by the cursor.
 *
 *  Edge-on falls in the middle of that fifth, which is where the dressed
 *  scene changes. There is no width at all at that moment, so the swap --
 *  which costs a React render and lands a frame late -- cannot be seen. */
const SLOT_ARRIVE_TO = 0.1
const SLOT_REST_TO = 0.22
const SLOT_INSIDE_FROM = 0.34
const SLOT_FLIP_FROM = 0.8

export type SkyCardPhase = "away" | "arrive" | "rest" | "expand" | "inside" | "flip"

/** The parallax beats, and the offsets section 3 spans. Derived from the cue
 *  table so that re-weighting a beat moves the page with it. */
const PARALLAX_INDICES = SKY_TEXT_CUES.map((c, i) => (c.mode === "parallax" ? i : -1)).filter((i) => i >= 0)
/** The same rule SPAN_START/SPAN_END use further down, restated here only
 *  because those are declared after this and a const cannot be hoisted. */
const spanStart = (i: number) => (i === 0 ? SKY_TEXT_LEAD : SKY_TEXT_CUES[i].threshold)
const spanEnd = (i: number) => SKY_TEXT_CUES[i + 1]?.threshold ?? SKY_JOURNEY_DISTANCE
const PARALLAX_FROM = spanStart(PARALLAX_INDICES[0])
const PARALLAX_TO = spanEnd(PARALLAX_INDICES[PARALLAX_INDICES.length - 1])
const PARALLAX_SPAN = Math.max(1, PARALLAX_TO - PARALLAX_FROM)
const SCENES = PARALLAX_INDICES.length

/** The first parallax beat's cue index.
 *
 *  SkyCard is born dressed as this rather than as beat zero, and that one
 *  line is what lets the hand-over stop hiding anything. The portal's scene
 *  is React, so re-dressing it lands a frame late; the old code covered that
 *  by hiding the card for a frame, and a sweep found the resulting blanks as
 *  samples with no hole on screen. Starting it correct means the only swap
 *  left is scene-to-scene, and that one happens edge-on, where a frame of
 *  the previous art has no width to be seen through. */
export const SKY_PARALLAX_FIRST = PARALLAX_INDICES[0]

/** Where the page has finished arriving and begins to leave. The slide
 *  owns these two stretches; the scenes run THROUGH them rather than
 *  waiting for them, so the page arrives already carrying its first plate
 *  mid-flip rather than arriving empty. */
const HOLES_FROM = PARALLAX_FROM + PAGE_SLIDE
const HOLES_TO = PARALLAX_TO - PAGE_SLIDE

/** How far through the run, in scenes: 0 at the first scene's start, 3 at
 *  the end of the last. */
function slotAt(offset: number) {
  return ((offset - PARALLAX_FROM) / PARALLAX_SPAN) * SCENES
}

/** The plate's rotation, counted in HALF-TURNS, and how far through its
 *  own slot the scroll is.
 *
 *  Half-turns rather than radians because the count is also the answer to
 *  "which face is showing": round it and you have the scene index. Tying
 *  the two together is deliberate -- they were separate numbers in the
 *  travelling version and the hand-over was exactly where they disagreed.
 *
 *  Scene k rests at k half-turns and the flip runs k -> k + 1 over the last
 *  fifth of its slot, so scene k+1 opens already resting. Halfway through
 *  that, at k + 0.5, the plate is edge-on and `Math.round` tips to the new
 *  scene -- the rotation and the swap are one number, not two that can
 *  disagree, which is exactly where the travelling version went wrong. */
function plateAt(offset: number) {
  const s = Math.max(0, Math.min(SCENES - 0.0001, slotAt(offset)))
  const k = Math.floor(s)
  const u = s - k
  let half: number
  // THE FIRST SCENE FLIPS IN, from edge-on, as the page arrives carrying it.
  // Nothing precedes it, so it owns only the second half of a turn.
  if (k === 0 && u < SLOT_ARRIVE_TO) half = -0.5 + (u / SLOT_ARRIVE_TO) * 0.5
  else if (u < SLOT_FLIP_FROM) half = k
  // THE LAST SCENE DOES NOT FLIP OUT. There is nothing to turn over to --
  // it shrinks back to a card and the page slides away carrying it.
  else if (k >= SCENES - 1) half = k
  else half = k + (u - SLOT_FLIP_FROM) / (1 - SLOT_FLIP_FROM)
  return { k, u, half }
}

/** How far through the turn the plate has to get before it starts losing
 *  height, as a share of the turn.
 *
 *  PAST HALFWAY, BY DESIGN. The shrink and the half-turn finish together --
 *  "shrinking and flipping at the same time to a small square which is the
 *  other parallax scene" -- but they are not evenly paced, and the
 *  reference is unambiguous about which way: pulled apart at 8fps, the
 *  plate is still the full height of the frame when it reaches the edge-on
 *  sliver, and does nearly all of its shrinking afterwards, as the NEW
 *  scene widens back out. A symmetric ramp has it half-sized at the
 *  turn-over, which reads as the scene receding rather than a plate being
 *  turned over. */
const SHRINK_FROM = 0.35

/** How open the plate is at a point in its slot: 0 a resting card, 1 the
 *  whole screen. Shared by skyCardState and skyCardOpen so the two cannot
 *  drift. */
function openAt(u: number) {
  if (u < SLOT_REST_TO) return 0
  if (u < SLOT_INSIDE_FROM) return smoothstep((u - SLOT_REST_TO) / (SLOT_INSIDE_FROM - SLOT_REST_TO))
  if (u < SLOT_FLIP_FROM) return 1
  const turned = (u - SLOT_FLIP_FROM) / (1 - SLOT_FLIP_FROM)
  // CLAMPED, because this smoothstep is the raw cubic and does not do it
  // itself: t*t*(3-2t) at t = -0.54 is 1.18, which would hand back an
  // `open` of -0.18 and scale the plate through zero and inside out for
  // the first third of every turn.
  const shrink = Math.min(1, Math.max(0, (turned - SHRINK_FROM) / (1 - SHRINK_FROM)))
  return 1 - smoothstep(shrink)
}

/** Everything the plate needs to draw itself at a point on the axis.
 *
 *  `open` is the size: 0 a card resting on the page, 1 filling the frame.
 *  `spin` is its rotation in half-turns, continuous across the whole run.
 *  `inside` is the progress THROUGH the scene it is showing, 0 until it has
 *  finished opening and 1 from the moment it starts to close, so the inner
 *  parallax neither starts early nor carries on while the plate is turning.
 *
 *  Smoothstepped on the size ramps rather than linear: the plate's size is
 *  the most visible thing on screen while it is changing, and a linear
 *  scale starts and stops abruptly however well the rest is tuned. */
export function skyCardState(offset: number) {
  const focus = skyTextFocus(offset)
  if (offset < PARALLAX_FROM || offset > PARALLAX_TO) {
    return {
      index: -1,
      side: focus.side,
      turn: focus.turn,
      centred: focus.centred === true,
      phase: "away" as SkyCardPhase,
      u: 0,
      spin: 0,
      open: 0,
      inside: 0,
    }
  }

  const { u, half } = plateAt(offset)
  // WHICH FACE IS TOWARD THE CAMERA, which is the same question as how far
  // it has turned. At a half-turn exactly, this tips to the next scene --
  // and a half-turn is edge-on.
  const nth = Math.min(SCENES - 1, Math.max(0, Math.round(half)))
  const index = PARALLAX_INDICES[nth]
  const cue = SKY_TEXT_CUES[index]

  const open = openAt(u)
  let phase: SkyCardPhase
  if (u < SLOT_ARRIVE_TO) phase = "arrive"
  else if (u < SLOT_REST_TO) phase = "rest"
  else if (u < SLOT_INSIDE_FROM) phase = "expand"
  else if (u < SLOT_FLIP_FROM) phase = "inside"
  else phase = "flip"

  const inside = Math.min(
    1,
    Math.max(0, (u - SLOT_INSIDE_FROM) / (SLOT_FLIP_FROM - SLOT_INSIDE_FROM)),
  )
  return { index, side: cue.side ?? -1, turn: u, centred: false, phase, u, spin: half, open, inside }
}

/** How far through the turn the page's words are faded out: 1 fully there,
 *  0 gone.
 *
 *  "The transitions between the slides are abrupt, the text just appears,
 *  instead of transitioning in smoothly."
 *
 *  The words belong to the scene the window is showing, so they have to
 *  change when it does -- and it changes at a half-turn, in one frame,
 *  because that is where `Math.round` tips. The plate gets away with that
 *  because it is edge-on there and has nothing on screen to cut; the type
 *  is on the page beside it, at full size, and a hard cut from one string
 *  to another is exactly what the recording shows.
 *
 *  So the type dips to nothing across the turn and comes back on the other
 *  side, with the swap buried at the bottom of the dip. It is the same
 *  gesture as the plate's own -- both vanish and return around the
 *  half-turn -- which is why it reads as one move rather than a caption
 *  animating on its own schedule.
 *
 *  THE DIP IS THE SECOND HALF OF THE TURN, not the whole of it. Fading from
 *  the moment the plate starts to rotate would have the words gone for the
 *  entire flip, which is most of the time the page is readable at all. */
export function skyPageTypeFade(offset: number) {
  if (offset < PARALLAX_FROM || offset > PARALLAX_TO) return 1
  const { half } = plateAt(offset)
  // 0 at rest, 0.5 edge-on.
  const off = Math.abs(half - Math.round(half))
  return smoothstep(Math.min(1, Math.max(0, (0.5 - off) / 0.25)))
}

/** How open the plate is at a point on the axis, and nothing else.
 *
 *  The whole of skyCardState allocates an object, and the callers that want
 *  only this number are the per-frame ones: the subject's lift, and every
 *  corridor prop deciding whether it is behind a plate that has become the
 *  screen. */
export function skyCardOpen(offset: number) {
  if (offset < PARALLAX_FROM || offset > PARALLAX_TO) return 0
  return openAt(plateAt(offset).u)
}

/** HOW FAR THE PARALLAX PAGE HAS SLID, in frame heights.
 *
 *  SIGNED LIKE EVERY OTHER `up` IN THIS STACK: positive is UP the screen.
 *  So -1 is wholly below the frame, 0 is covering it, +1 is gone over the
 *  top. The first draft of this read "+1 is below" because that is the
 *  order the reader meets them in, and then handed the number straight to
 *  placeScreenPlane, whose `up` argument means the opposite -- the page
 *  slid the wrong way at both ends.
 *  "Consider the dragonite and parallax as two separate pages... put the
 *  parallax on a layer in front of it, so when the parallax appears on the
 *  screen it should come in front of it, sliding up like a separate page."
 *
 *  A SHARE OF THE FRAME, not world units, and that is load-bearing. The page
 *  hangs at CARD_PAGE_DISTANCE 46 and the hole at CARD_MASK_DISTANCE 12, so
 *  the same world lift subtends nearly four times the screen angle on the
 *  hole that it does on the page -- slide them by a common world Δy and the
 *  hole races the page off the top. A share is distance-invariant, and it is
 *  the currency everything in this stack already speaks.
 *
 *  This replaces `skyFlatPage`, which was an OPACITY: the page faded in as
 *  the beat index crossed, which is why the arrival read as a hard cut. It
 *  also returned 1 for every stretch where `turn < 0`, including before its
 *  own fade-in had run -- a 1 -> 0 -> 1 flash on entry and a pop back to
 *  full on the way out, both of which its comments claimed could not
 *  happen. */
export function skyPageLift(offset: number) {
  if (offset <= PARALLAX_FROM) return -1
  if (offset < HOLES_FROM) return smoothstep((offset - PARALLAX_FROM) / PAGE_SLIDE) - 1
  if (offset <= HOLES_TO) return 0
  if (offset < PARALLAX_TO) return smoothstep((offset - HOLES_TO) / PAGE_SLIDE)
  return 1
}

/** How much of the frame the parallax page covers, 0..1. Derived from the
 *  slide so the two cannot disagree: a page half off the top covers half. */
export function skyPageCover(offset: number) {
  return 1 - Math.min(1, Math.abs(skyPageLift(offset)))
}

/** How far the SUBJECT is lifted out of frame while a card is open.
 *
 *  The Dragonite hangs 6.3 units from the lens and the card stands about
 *  fifty units further out, so at full expansion he is in front of a card
 *  that is supposed to BE the screen -- he would float over the middle of it.
 *
 *  He goes up on his string, which is the exit this scene has already
 *  promised and the reader has already approved for the end of the journey
 *  ("like a marionette pulling up a puppet"). Driven by `open`, so it is the
 *  same gesture in both directions: the card opens and he is drawn up out of
 *  the picture, it closes and he comes back down. Nothing is faded, no
 *  material is touched, and scrolling backwards plays it in reverse for free.
 *
 *  Squared, like skyExitLift, so the slack goes out of the string before he
 *  moves and he is still travelling when he leaves the top of the frame. */
const CARD_SUBJECT_LIFT = 26

/** HOW FULLY THE FLAT PAGE IS UP, 0..1.
 *
 *  Section 3 is not the paper sky with windows over it -- on the reference
 *  the windows rise over a FLAT COLOUR PAGE with no scene behind them at
 *  all. This is that page's opacity: up for the whole of the parallax run,
 *  ramped at each end so the cut into and out of it is clean rather than a
 *  pop.
 *
 *  Driven by the beat rather than by a raw offset so it cannot drift out of
 *  step with the windows it stands behind: it is up from the moment the
 *  first parallax beat begins to the moment the last one ends. */
/** How far into a beat the camera's lean toward the words is fully spent. */
const LEAN_SPENT_BY = 0.26

/** HOW FAR OUT OF THE PICTURE THE SUBJECT IS, 0..1.
 *
 *  The page, not the card. This used to be `skyCardOpen` alone, and the
 *  difference between the two is exactly where the bug lived: the page is
 *  up for the WHOLE parallax run -- across every approach, every depart and
 *  every gap between the three windows -- while `open` is 0 in all of those.
 *  So in the gaps the subject was lowered back into his pose in front of a
 *  page that is meant to have nothing behind it.
 *
 *  He himself did not show, because his material is opaque and the page is
 *  transparent at renderOrder -50, which puts the page's whole pass after
 *  his. His twine cord IS transparent, at renderOrder 0, so it drew over the
 *  page -- a bare beige string hanging down the middle of an empty screen,
 *  with nothing attached to it. That is the "I don't even know what's going
 *  on there" in the round-40 screenshot. */
export function skySubjectAway(offset: number) {
  // Coverage, not an opacity. The page slides now, so "is he hidden" is
  // "how much of the frame does it cover" -- a page half off the top hides
  // half of him, and he comes back down as it leaves.
  return Math.max(skyCardOpen(offset), skyPageCover(offset))
}

export function skyCardSubjectLift(offset: number) {
  const away = skySubjectAway(offset)
  return CARD_SUBJECT_LIFT * away * away
}

const SPAN_START = SKY_TEXT_CUES.map((cue, i) => (i === 0 ? SKY_TEXT_LEAD : cue.threshold))
const SPAN_END = SKY_TEXT_CUES.map((_, i) => SKY_TEXT_CUES[i + 1]?.threshold ?? SKY_JOURNEY_DISTANCE)

/** A point inside block `i`, given a fraction of its TURN.
 *
 *  One statement of the arithmetic that turns a turn into a place on the
 *  axis, because four things below need it and they were drifting apart as
 *  separate copies. */
function turnOffset(i: number, turn: number) {
  const start = SPAN_START[i]
  const span = SPAN_END[i] - start
  const active = span * SKY_TEXT_ACTIVE
  return start + (span - active) / 2 + active * turn
}


/** SECTION 2: WHERE THE SUBJECT IS, ACROSS THE FRAME.
 *
 *  "I want the avatar to continue to move from left to right, around the
 *  text which alternates from left to right, opposite the avatar."
 *
 *  So his lateral place is the NEGATIVE of the beat's own side: words left,
 *  subject right, and the pair swap at every beat. Returned as a share of
 *  the frame's half-width AT HIS OWN DISTANCE -- and because the camera sits
 *  CAMERA_BEHIND back along the flight axis, that share IS his ndc x. 0.52
 *  means 0.52 of the way to the edge of the frame, on any monitor, and can
 *  be asserted as such.
 *
 *  AUTHORED AGAINST THE AXIS, NOT AGAINST A BEAT'S `turn`.
 *
 *  The version this replaces asked skyTextFocus where it was and got back a
 *  `turn` of -1 for TWO different situations: the quiet lead-in before a
 *  beat's words, and the quiet tail after them. It tested `t < 0` meaning
 *  only the first. So the sequence across a boundary ran: hold right, cross
 *  to the left over the last fifth of the beat, then -- in the tail, with
 *  the crossing already finished -- fall into the same branch as the lead-in
 *  and TELEPORT back to the right; then the cue index flipped and it
 *  teleported left again. Two one-frame jumps of most of a screen-half per
 *  boundary, landing on frames where SkyText hides the words for the same
 *  `turn < 0`, which is why they looked like they happened for no reason.
 *
 *  There is no sentinel here to misread. The value is a table of holds with
 *  a smoothstep across each gap, so it is continuous and has zero slope at
 *  every joint; the index can flip wherever it likes because the value eithe
 *  side of a boundary is the same number.
 *
 *  THE CROSSINGS HAPPEN WHERE THERE IS NOTHING TO READ. A hold occupies
 *  exactly the stretch its beat's words are up for (turn 0 to 1), so every
 *  crossing sits strictly inside the quiet between one beat's fade-out and
 *  the next's fade-in.
 *
 *  AND IT ENDS CENTRED BY ARRIVING THERE. The last fact eases to zero over
 *  the gap that ends at turn 0 of the first parallax beat -- so "centred as
 *  the parallax begins" is read off the cue table rather than written down,
 *  and it is a move rather than the teleport it used to be (the old code
 *  parked him hard right for the whole of the last beat, because its "where
 *  next" lookup found a parallax cue and gave up, then returned 0 the
 *  instant the index changed). */
const DRIFT_REACH = 0.52

/** Where he holds while each beat's words are up. Zero for every beat that
 *  is not a side beat, which is what puts him in the middle for the intro,
 *  the parallax run and the outro. */
const DRIFT_HOLD = SKY_TEXT_CUES.map((cue) => (cue.mode === "side" ? -cue.side * DRIFT_REACH : 0))
const DRIFT_FROM = SKY_TEXT_CUES.map((_, i) => turnOffset(i, 0))
const DRIFT_TO = SKY_TEXT_CUES.map((_, i) => turnOffset(i, 1))

export function skyDriftSide(offset: number) {
  if (offset <= DRIFT_TO[0]) return DRIFT_HOLD[0]
  for (let i = 0; i < DRIFT_HOLD.length - 1; i++) {
    if (offset <= DRIFT_TO[i]) return DRIFT_HOLD[i]
    if (offset < DRIFT_FROM[i + 1]) {
      const u = smoothstep((offset - DRIFT_TO[i]) / (DRIFT_FROM[i + 1] - DRIFT_TO[i]))
      return DRIFT_HOLD[i] + (DRIFT_HOLD[i + 1] - DRIFT_HOLD[i]) * u
    }
  }
  return DRIFT_HOLD[DRIFT_HOLD.length - 1]
}

const LAST_BLOCK = SKY_TEXT_CUES.length - 1
/** How far into the contact beat the journey comes to rest. Was
 *  `CARD_CONTRACT_FROM - 0.02`, borrowed from the card state machine that
 *  no longer exists -- and the contact beat has never had a card anyway. */
const CONTACT_PARK_AT = 0.78
/** How far into the contact beat the links go live. Was CARD_INSIDE_FROM,
 *  borrowed from the card state machine; the contact beat has no card. */
const CONTACT_REVEAL_AT = 0.26

/* THE HOLDS, THE SETTLE AND THEIR REACH ALL LIVED HERE.
 *
 *  They were the scroll magnet's tables: a hold at the end of each of a
 *  card's two ramps, a reach for how far a spent gesture could be carried
 *  onto one, and the shape the integrator took them in. The magnet is gone
 *  -- "the scroll is painful. It's hard to move through" -- and Lenis
 *  coasts to wherever it is left, so none of them has a reader.
 *
 *  Worth recording on the way out, because it explains some of the feel:
 *  SKY_SETTLE_REACH was computed from beat 0's span with the comment "every
 *  section is the same length, so one is all of them". That stopped being
 *  true when the beats were weighted. It came out at 74 units against the
 *  214 a parallax beat actually needed, so by the end the magnet could not
 *  pull a reader out of a half-opened window even when it wanted to. */

/** WHERE THE JOURNEY ENDS, and it is not the end of the axis.
 *
 *  "For the contact the camera shouldn't move forward, it should stay there
 *  with the text, because that's the contact part, the user needs to be able
 *  to interact with it."
 *
 *  Every other card is flown past. This one is arrived at and never left:
 *  the wall is the END of the last card's INSIDE, so the journey comes to
 *  rest with the contact card still filling the screen and simply stays
 *  there however hard the wheel is pushed. Stopping one tick before its
 *  contract begins is what guarantees it never starts to shrink -- the one
 *  card the reader has to be able to USE is the one card that must not close
 *  itself while they are reaching for a link.
 *
 *  The axis itself is unchanged. The avatar's keyframes, the corridor and the
 *  cards are all still written against SKY_JOURNEY_DISTANCE; this is a limit
 *  on where the reader may take the scroll, not a shortening of the world. */
/** A SHADE BEFORE THE CONTRACT, NOT EXACTLY ON IT.
 *
 *  Parking on the boundary itself put the journey at rest reporting phase
 *  "contract" with u exactly 0 -- open was still 1 and it looked right, but
 *  the one card a visitor has to be able to USE was balanced on the precise
 *  frame where it begins to close, with nothing but a floating-point
 *  comparison keeping it open. Two hundredths of a turn back is about
 *  twenty-four units of margin and reads identically. */
export const SKY_SCROLL_LIMIT = turnOffset(LAST_BLOCK, CONTACT_PARK_AT)

/** When the contact panel's links become live.
 *
 *  The moment the last card is fully open, rather than a fixed distance
 *  short of the wall. The card holds open for the whole of its INSIDE and
 *  the links belong to it, so they arrive with it and stay for as long as it
 *  is on screen -- a reader who stops two thirds of the way through the last
 *  card's scene should not find the one actionable thing in the sky still
 *  switched off. */
export const SKY_CONTACT_REVEAL = turnOffset(LAST_BLOCK, CONTACT_REVEAL_AT)

/** How far the subject is hauled up out of the frame as the contact card
 *  arrives, and over what stretch of the axis.
 *
 *  "Have the dragonite get pulled up off the screen like a marionette pulling
 *  up a puppet." He is on a string for the whole journey, so this is the one
 *  exit the scene has already promised. It is driven by the SCROLL, like
 *  everything else here -- stop half way and he hangs half way up, which is
 *  what makes it read as the reader pulling him rather than as an animation
 *  that happened to play.
 *
 *  Applied to the SUBJECT ALONE. The camera's own height is derived from the
 *  avatar's (see skyCameraPose), so lifting him through the shared pose would
 *  lift the camera with him and he would never leave the frame at all --
 *  which is why this is a separate function rather than a term in
 *  avatarSkyPose. */
const EXIT_LIFT_FROM = SKY_SCROLL_LIMIT - 220
const EXIT_LIFT_HEIGHT = 34

export function skyExitLift(offset: number) {
  const t = (offset - EXIT_LIFT_FROM) / Math.max(1, SKY_SCROLL_LIMIT - EXIT_LIFT_FROM)
  if (t <= 0) return 0
  const u = Math.min(1, t)
  // Eased in only. A puppet being drawn up starts slowly as the slack goes
  // out of the string and is still travelling when it leaves the top of the
  // frame; easing the far end too would have him decelerate into the ceiling.
  return EXIT_LIFT_HEIGHT * u * u
}

/** The middle of a block's turn, on the scroll axis.
 *
 *  The corridor centres its cloud's crossing on this, so the cloud and the
 *  words share a stretch of sky rather than the cloud running ahead -- "the
 *  clouds should more or less be around the same position as the text. It can
 *  come in a little sooner or a little later, but it shouldn't be too much
 *  ahead." */
export function skyTurnCentre(offset: number) {
  const focus = skyTextFocus(offset)
  if (focus.index < 0) return 0
  const start = SPAN_START[focus.index]
  return start + (SPAN_END[focus.index] - start) * 0.5
}

/** The stretch of the axis a block owns, ends included.
 *
 *  The corridor times its cloud against this rather than against the block's
 *  TURN: the cloud is lowered in before the words are readable and lifted out
 *  after, so it needs the whole section, not the middle of it. The wordless
 *  opening is a span in its own right -- see skySectionStart for why it has
 *  to be -- and gets the cloud that is already in the sky on arrival. */
export function skySectionSpan(offset: number) {
  const focus = skyTextFocus(offset)
  if (focus.index < 0) return { start: 0, end: SKY_TEXT_LEAD }
  return { start: SPAN_START[focus.index], end: SPAN_END[focus.index] }
}

/** Which section the corridor is in: -1 for the wordless opening, then one
 *  per block. A small ordinal, which is what the corridor keys its scatter on. */
export function skySectionIndex(offset: number) {
  return skyTextFocus(offset).index
}

/** Where the block that owns this point on the axis BEGAN.
 *
 *  The wordless lead is a section in its own right -- it has to be. Folding it
 *  into the first block's would make that section 975 units long against a
 *  667-unit crossing, so its cloud would finish early and leave the sky empty
 *  for the rest of it. As its own section the lead gets the cloud that is
 *  already in view when you arrive (CORRIDOR_START_AXIAL). */
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
  if (offset < SKY_TEXT_LEAD) return { index: -1, side: -1 as -1 | 1, lean: 0, turn: -1 }
  let index = SKY_TEXT_CUES.length - 1
  for (let i = 0; i < SKY_TEXT_CUES.length; i++) {
    if (offset < SPAN_END[i]) {
      index = i
      break
    }
  }
  const side = SKY_TEXT_CUES[index].side
  // A CENTRED BLOCK GETS NO LEAN. The lean exists to open a half of the frame
  // for the words and push the subject into the other one; with the block on
  // the axis there is nothing to make room for, and a camera that turned away
  // from it would be turning away from the one thing you are meant to use.
  const centred = SKY_TEXT_CUES[index].centred === true
  const start = SPAN_START[index]
  const span = Math.max(1, SPAN_END[index] - start)
  // The turn sits in the middle of the section, with the rest of it quiet.
  const active = span * SKY_TEXT_ACTIVE
  const from = start + (span - active) / 2
  const u = (offset - from) / active
  // -1 means "no block right now": between one turn and the next.
  const turn = u >= 0 && u <= 1 ? u : -1
  // THE LEAN BELONGS TO THE APPROACH, AND NOWHERE ELSE.
  //
  // It used to be fitted to the LAST half of the turn (LEAN_FROM 0.5), back
  // when a block was a plane that got closest and most readable near the end
  // of its pass. A card is the opposite shape: it is off to one side only
  // while it is small, and by halfway through its turn it IS the screen.
  // Leaning then does not open up a half of the frame for the words, it
  // shoves a card that is supposed to cover the picture off the edge of it --
  // measured as 12 of 42 readings where the fully open card no longer
  // reached all four corners.
  //
  // So the pulse runs over the approach and the expand, and is spent exactly
  // when the card finishes opening. A raised cosine is still the right curve
  // and for the original reason: its SLOPE is zero at both ends as well as
  // its value, so the camera eases out of square and back into it rather
  // than starting or stopping a turn abruptly. It now also agrees with the
  // card -- both reach centre on the same frame.
  // LEAN_SPENT_BY, not the card's old CARD_INSIDE_FROM. The lean belongs to
  // the text beats, which have no card; it shared the constant only because
  // both wanted "a quarter of the way in", and the card's state machine has
  // since been replaced.
  const leanPhase = turn < 0 ? -1 : turn / LEAN_SPENT_BY
  const lean = centred || leanPhase < 0 || leanPhase > 1 ? 0 : side * pulse(leanPhase)
  return { index, side, lean, turn, centred }
}
