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
  skyBottom: string
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
  rimColor: string
  rimIntensity: number
  nameTextColor: string
}

export type TimeOfDay = "day" | "evening" | "night"

export const PRESETS: Record<TimeOfDay, EnvironmentBlend> = {
  day: {
    skyTop: "#2f8fd0",
    skyBottom: "#bff3fb",
    ambientColor: "#dff2ff",
    ambientIntensity: 0.7,
    hemiSky: "#bfe9ff",
    hemiGround: "#3a2a20",
    hemiIntensity: 0.3,
    dirColor: "#fff6e2",
    dirIntensity: 2.2,
    dirX: 25,
    dirY: 40,
    dirZ: -15,
    fogColor: "#bff3fb",
    fogNear: 60,
    fogFar: 240,
    campfireColor: "#ff7a30",
    campfireIntensity: 0,
    sunOpacity: 1,
    sunAngle: 35,
    sunZ: -20,
    moonOpacity: 0,
    moonAngle: 340,
    moonZ: -20,
    starsOpacity: 0,
    rimColor: "#bcdfff",
    rimIntensity: 0.6,
    nameTextColor: "#ffffff",
  },
  evening: {
    skyTop: "#274472",
    skyBottom: "#ff9d6b",
    ambientColor: "#ffcf9a",
    ambientIntensity: 0.2,
    hemiSky: "#ffb37a",
    hemiGround: "#3a2a3a",
    hemiIntensity: 0.9,
    dirColor: "#ff9d5c",
    dirIntensity: 1.3,
    dirX: -30,
    dirY: 12,
    dirZ: -10,
    fogColor: "#e08a5c",
    fogNear: 35,
    fogFar: 190,
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
    rimColor: "#ff8a4c",
    rimIntensity: 1.0,
    nameTextColor: "#242424",
  },
  night: {
    skyTop: "#050b1c",
    skyBottom: "#132038",
    ambientColor: "#25436f",
    ambientIntensity: 0.32,
    hemiSky: "#2c5490",
    hemiGround: "#0a0d18",
    hemiIntensity: 0.75,
    dirColor: "#cfe0ff",
    dirIntensity: 0.9,
    dirX: 20,
    dirY: 25,
    dirZ: -20,
    fogColor: "#0a1428",
    fogNear: 25,
    fogFar: 150,
    campfireColor: "#ff7a30",
    campfireIntensity: 3.5,
    sunOpacity: 0,
    sunAngle: 195,
    sunZ: -20,
    moonOpacity: 1,
    moonAngle: 39,
    moonZ: -20,
    starsOpacity: 1,
    rimColor: "#4d7fff",
    rimIntensity: 0.8,
    nameTextColor: "#000000",
  },
}

// Cycle order for the in-world time-of-day orb (TimeOfDayOrb.tsx).
export const TIME_OF_DAY_ORDER: TimeOfDay[] = ["day", "evening", "night"]
