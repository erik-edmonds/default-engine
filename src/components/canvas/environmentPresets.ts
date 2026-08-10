// Single source of truth for every time-of-day-dependent value in the
// scene. Day/Evening/Night used to be three independent, hand-duplicated
// components that got unmounted/remounted on toggle (a hard cut). Now
// there's one persistent Environment (see Environment.tsx) that tweens a
// single flattened blend object between these presets with gsap, so every
// field here must exist in all three presets -- interpolating between any
// pair has to be well-defined. Colors are hex strings (gsap's core has
// built-in color-string interpolation for plain object properties, same as
// it does for DOM styles).
//
// Sun/moon position is an angle (degrees) along a shared arc, not raw x/y --
// see ARC_CENTER/ARC_RADIUS in Environment.tsx. Real sun/moon motion traces
// a curved path across the sky, not a straight line through 3D space
// between two points, so tweening an angle (then computing x/y = center +
// radius*cos/sin(angle) every frame) is what makes that curve happen.
// Angles increase left-to-right through the day (sunrise -> zenith ->
// sunset -> below horizon) so cycling day->evening->night keeps sweeping
// forward in one direction instead of ever reversing.
export interface EnvironmentBlend {
  skyTop: string
  skyHorizon: string
  ambientColor: string
  ambientIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  dirColor: string
  dirIntensity: number
  dirX: number
  dirY: number
  dirZ: number
  fogColor: string
  fogNear: number
  fogFar: number
  campfireColor: string
  campfireIntensity: number
  sunOpacity: number
  sunAngle: number
  sunZ: number
  moonOpacity: number
  moonAngle: number
  moonZ: number
  starsOpacity: number
  auroraOpacity: number
  rimColor: string
  rimIntensity: number
}

export type TimeOfDay = "dawn" | "day" | "evening" | "night"

export const PRESETS: Record<TimeOfDay, EnvironmentBlend> = {
  dawn: {
    // Cool lavender-blue zenith easing into a warm, hazy pink/peach
    // horizon -- the sun is barely up (see sunAngle below), so the sky's
    // own gradient carries most of "sunrise," unlike day's more uniform
    // blue.
    skyTop: "#4a6fa5",
    skyHorizon: "#ffc9a8",
    ambientColor: "#f0d3d9",
    // Between night's 0.6 and day's 0.28 -- the low sun is still soft/hazy
    // rather than fully overhead, but the sky is already doing most of the
    // fill work, same as day.
    ambientIntensity: 0.34,
    hemiSky: "#ffd9c2",
    hemiGround: "#3a2a2a",
    hemiIntensity: 0.34,
    dirColor: "#ffcba4",
    dirIntensity: 2.1,
    // Low and grazing like evening's key light, but from the opposite
    // horizontal side -- sunrise, not sunset.
    dirX: 22,
    dirY: 18,
    dirZ: -12,
    fogColor: "#f5d5c8",
    fogNear: 24,
    fogFar: 95,
    campfireColor: "#ff7a30",
    // Still lit (above CAMPFIRE_LIT_THRESHOLD in Environment.tsx) but low --
    // embers carrying over from night, on their way out by full day.
    campfireIntensity: 1,
    sunOpacity: 0.8,
    // sunAngle/moonAngle across all four presets are exactly 90deg apart
    // (see the shared comment on night's sunAngle below for why) -- sun and
    // moon each get their OWN independent 90deg-apart cycle (not each
    // other's mirror) specifically so sun's day angle and moon's night
    // angle -- the two moments each body is fully opaque and most
    // prominent -- can both be individually restored to their original,
    // well-tuned positions; dawn/evening (partial opacity, less critical)
    // absorb the resulting compromise instead.
    sunAngle: 324,
    sunZ: -20,
    // Moon has already set by dawn -- same hard-0 convention evening uses
    // for "not yet risen."
    moonOpacity: 0,
    moonAngle: 144,
    moonZ: -20,
    starsOpacity: 0,
    auroraOpacity: 0,
    rimColor: "#ffcf9e",
    rimIntensity: 1.2,
  },
  day: {
    skyTop: "#1a6bab",
    skyHorizon: "#eaf7ff",
    ambientColor: "#dff2ff",
    ambientIntensity: 0.28,
    hemiSky: "#bfe9ff",
    hemiGround: "#3a2a20",
    hemiIntensity: 0.22,
    dirColor: "#fff6e2",
    dirIntensity: 2.6,
    dirX: 25,
    dirY: 40,
    dirZ: -15,
    fogColor: "#dff8fc",
    fogNear: 28,
    fogFar: 120,
    campfireColor: "#ff7a30",
    campfireIntensity: 0,
    sunOpacity: 1,
    // Original, hand-tuned value -- see the shared comment on night's
    // sunAngle below. Day is the sun's fully-opaque moment, so it's the one
    // preserved exactly.
    sunAngle: 54,
    sunZ: -20,
    moonOpacity: 0,
    moonAngle: 234,
    moonZ: -20,
    starsOpacity: 0,
    auroraOpacity: 0,
    rimColor: "#bcdfff",
    rimIntensity: 0.9,
  },
  evening: {
    skyTop: "#1c2f52",
    skyHorizon: "#ff9d6b",
    ambientColor: "#ffcf9a",
    ambientIntensity: 0.2,
    hemiSky: "#ffb37a",
    hemiGround: "#3a2a3a",
    hemiIntensity: 0.5,
    dirColor: "#ff9d5c",
    dirIntensity: 2.3,
    dirX: -22,
    dirY: 20,
    dirZ: -10,
    fogColor: "#eba57e",
    fogNear: 22,
    fogFar: 88,
    campfireColor: "#ff7a30",
    campfireIntensity: 3,
    sunOpacity: 0.35,
    sunAngle: 144,
    sunZ: -22,
    // No moon during evening -- it's still below the horizon, rising, at
    // this point in the cycle.
    moonOpacity: 0,
    moonAngle: 324,
    moonZ: -20,
    starsOpacity: 0.3,
    // No aurora during evening -- it's a night-only effect.
    auroraOpacity: 0,
    rimColor: "#ff8a4c",
    rimIntensity: 1.7,
  },
  night: {
    skyTop: "#03060f",
    // A faint atmospheric brightening near the horizon even at night,
    // instead of a flat black straight up to the zenith.
    skyHorizon: "#1c3358",
    // "Night" here means moonlit-blue-hour, not literal darkness -- the
    // scene should still read clearly (subject, chair, trees all legible),
    // with the cool color palette doing the work of signaling "night," not
    // low intensity. Previous values (0.14/0.4/1.05) left the avatar
    // barely visible.
    ambientColor: "#3a5c94",
    ambientIntensity: 0.6,
    hemiSky: "#2c5490",
    hemiGround: "#0a0d18",
    hemiIntensity: 0.72,
    dirColor: "#cfe0ff",
    dirIntensity: 2.2,
    dirX: 20,
    dirY: 25,
    dirZ: -20,
    fogColor: "#16294a",
    fogNear: 16,
    fogFar: 70,
    campfireColor: "#ff7a30",
    campfireIntensity: 3.5,
    sunOpacity: 0,
    // sunAngle/moonAngle used to be individually hand-tuned per preset
    // (sun: 10/54/165/195, moon: 300/340/10/54) to sit each body at a
    // specific "ideal" height per phase. That produced wildly uneven
    // angular deltas segment-to-segment once the environment auto-cycles
    // continuously instead of hard-cutting between static presets (sun:
    // dawn->day 44deg, day->evening 111deg, evening->night 30deg,
    // night->dawn 175deg -- moonAngle was worse still, one single segment
    // covering 246 of the moon's 360 total degrees). Since every segment
    // now takes the same real time (AUTO_TRANSITION_SECONDS), an uneven
    // split reads as the sun and moon moving at wildly different,
    // inconsistent speeds -- most obviously the moon, which visibly raced
    // across the sky in whichever segment absorbed most of its 360deg.
    //
    // Fix: lock each body's own four presets exactly 90deg apart, so every
    // segment covers exactly a quarter turn -- genuinely constant angular
    // speed at all times, not just on average. Sun and moon get their OWN
    // independent 90deg cycle (not a fixed 180deg mirror of each other) --
    // a first attempt tried a shared mirrored cycle (day's sunAngle at the
    // arc's exact top, 90deg), which fixed the speed but pushed day's sun
    // (and, being the mirror, night's moon) to the arc's horizontal center
    // (cos(90deg)=0), reading as stuck at the top-center of the screen
    // instead of its original upper-right corner. Decoupling the two
    // cycles means sun's day angle and moon's night angle -- the one moment
    // each body is fully opaque and actually matters most -- can each be
    // restored to their exact original, well-tuned position (this file's
    // day.sunAngle=54 and this preset's moonAngle=54 are both literally the
    // old hand-tuned values). dawn/evening (both bodies, partial or zero
    // opacity) absorb the resulting compromise instead, each landing
    // somewhat below the geometric horizon at various points in their own
    // cycle -- acceptable since they're either already partially
    // transparent or, for the invisible body in that phase, not rendered
    // at all.
    sunAngle: 234,
    sunZ: -20,
    moonOpacity: 1,
    // Original, hand-tuned value -- see the comment above. Night is the
    // moon's fully-opaque moment, so it's the one preserved exactly.
    moonAngle: 54,
    moonZ: -20,
    starsOpacity: 1,
    auroraOpacity: 1,
    rimColor: "#4d7fff",
    rimIntensity: 1.6,
  },
}

// The fast, manual duration: how long a *click* on the phase cube takes to
// skip ahead. Deliberately short -- a click is a "get me there now" gesture.
export const TRANSITION_SECONDS = 3
export const TRANSITION_EASE_CSS = "cubic-bezier(0.65, 0, 0.35, 1)"

// The slow, ambient duration: how long one unattended phase-to-phase segment
// takes. The whole 4-phase cycle is 4x this. Also doubles as the
// auto-progression interval -- transitions are back-to-back with no dwell,
// so the scene is always mid-transition (see helpers/useTimeOfDayCycle.ts).
export const AUTO_TRANSITION_SECONDS = 90

// How long a clicked-to phase is actually held, fully settled, before
// auto-progression resumes pulling toward the phase after it. Without this,
// the auto-cycle's own "resume" timer (see useTimeOfDayCycle.ts) was armed
// for exactly TRANSITION_SECONDS -- the same duration the click's OWN tween
// takes -- so the instant the click finished arriving at its target, the
// next auto-advance fired in the same frame, immediately pulling away
// again. The clicked-to phase was never actually visible at rest: dawn and
// evening in particular read as skippable, since a click from day landed on
// evening for zero perceptible time before continuing straight on to night.
export const CLICK_DWELL_SECONDS = 8

// Cycle order for the time-of-day control (Dial.tsx).
export const TIME_OF_DAY_ORDER: TimeOfDay[] = ["dawn", "day", "evening", "night"]

export function phaseIndex(phase: TimeOfDay) {
  return TIME_OF_DAY_ORDER.indexOf(phase)
}

// Always forward around the cycle, wrapping night -> dawn. Matches the
// forward-only sun/moon arc in Environment.tsx (nextAngle) -- a backward
// step would rewind the cube while the sky kept sweeping forward.
export function nextPhase(phase: TimeOfDay): TimeOfDay {
  return TIME_OF_DAY_ORDER[(phaseIndex(phase) + 1) % TIME_OF_DAY_ORDER.length]
}

// Quarter-turns to rotate forward to land on `to` from `from`. Always in
// [0, 3]; a "backward" request takes the long way round rather than reversing.
export function forwardSteps(from: TimeOfDay, to: TimeOfDay) {
  return (((phaseIndex(to) - phaseIndex(from)) % 4) + 4) % 4
}
