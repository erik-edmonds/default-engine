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
    // Just above the horizon crossing (~13.6deg, where ARC_CENTER_Y +
    // ARC_RADIUS*sin(angle) = 0 -- see Environment.tsx) -- the sun has
    // barely risen, well below day's higher 35deg.
    sunAngle: 10,
    sunZ: -20,
    // Moon has already set by dawn -- same hard-0 convention evening uses
    // for "not yet risen."
    moonOpacity: 0,
    // Continues sweeping forward from night's 39deg, on its way toward
    // day's 340deg (see nextAngle in Environment.tsx).
    moonAngle: 300,
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
    sunAngle: 54,
    sunZ: -20,
    moonOpacity: 0,
    moonAngle: 340,
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
    sunAngle: 165,
    sunZ: -22,
    // No moon during evening -- it's still below the horizon, rising, at
    // this point in the cycle (see moonAngle: just past the horizon).
    moonOpacity: 0,
    moonAngle: 10,
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
    sunAngle: 195,
    sunZ: -20,
    moonOpacity: 1,
    // 39 (the original) read as too low; 62 (a later attempt) read as too
    // high and, as a side effect of moving along the shared arc, too far
    // left (see ARC_CENTER_X in Environment.tsx). 54 matches day's
    // sunAngle -- settled middle, both bodies sit at the same height.
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
export const AUTO_TRANSITION_SECONDS = 120

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
