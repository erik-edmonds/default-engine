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
  nameTextColor: string
}

export type TimeOfDay = "day" | "evening" | "night"

export const PRESETS: Record<TimeOfDay, EnvironmentBlend> = {
  day: {
    // A single monotonic gradient, horizon (skyHorizon, lightest) to
    // zenith (skyTop, darkest) -- see Environment.tsx's sky shader.
    skyTop: "#1a6bab",
    skyHorizon: "#eaf7ff",
    ambientColor: "#dff2ff",
    // Was 0.7 -- at that level the omnidirectional ambient fill nearly
    // matched the directional key light, washing shadow areas back out to
    // flat even though the light *rig* itself was already correct. Cut
    // hard here (and boosted dirIntensity below) so the sun's direction is
    // what actually sculpts the scene.
    ambientIntensity: 0.28,
    hemiSky: "#bfe9ff",
    hemiGround: "#3a2a20",
    hemiIntensity: 0.22,
    dirColor: "#fff6e2",
    dirIntensity: 2.6,
    dirX: 25,
    dirY: 40,
    dirZ: -15,
    // Lightened + pushed back further -- was still reading a bit heavy up
    // close even after excluding the sun/moon from fog (fog={false} on
    // their materials, fixed earlier).
    fogColor: "#dff8fc",
    fogNear: 28,
    fogFar: 120,
    campfireColor: "#ff7a30",
    campfireIntensity: 0,
    sunOpacity: 1,
    sunAngle: 35,
    sunZ: -20,
    moonOpacity: 0,
    moonAngle: 340,
    moonZ: -20,
    starsOpacity: 0,
    auroraOpacity: 0,
    rimColor: "#bcdfff",
    rimIntensity: 0.9,
    nameTextColor: "#ffffff",
  },
  evening: {
    skyTop: "#1c2f52",
    skyHorizon: "#ff9d6b",
    ambientColor: "#ffcf9a",
    // Sunset should still read as backlit/moody (rim stays strong below),
    // but with fill cut this hard and the key light this low/grazing, the
    // avatar/chair/palm trees were going nearly unlit on their
    // camera-facing side -- raised fill and key intensity, and lifted the
    // key light's angle so it actually strikes the front of these subjects
    // instead of just grazing past them.
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
    nameTextColor: "#242424",
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
    moonAngle: 39,
    moonZ: -20,
    starsOpacity: 1,
    auroraOpacity: 1,
    rimColor: "#4d7fff",
    rimIntensity: 1.6,
    nameTextColor: "#000000",
  },
}

// Cycle order for the in-world time-of-day orb (TimeOfDayOrb.tsx).
export const TIME_OF_DAY_ORDER: TimeOfDay[] = ["day", "evening", "night"]
