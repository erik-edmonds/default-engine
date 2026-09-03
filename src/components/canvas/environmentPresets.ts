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
  // Rim position, previously a fixed RIM_LIGHT_POSITION constant in
  // Environment.tsx. See the rim comment on the evening preset for why it had
  // to become per-phase.
  rimX: number
  rimY: number
  rimZ: number
  // FILL -- the camera-side modelling light. Every preset's key (dirX/Y/Z) has
  // a negative Z while the camera sits at z = +14.57, which makes the key a
  // three-quarter BACK light in all four phases: nothing was lighting the side
  // of anything that faces the viewer except ambientLight, the one light in
  // three.js with no normal dependence at all. That's the definition of flat.
  // This is the sky/ground bounce that opens up the shadow side, and it's why
  // ambientIntensity could come down so far across the board.
  fillColor: string
  fillIntensity: number
  fillX: number
  fillY: number
  fillZ: number
  // KICK -- low, warm, front quarter, on the KEY's side of frame. Motivated as
  // sun bounce off the sand and water; cinematically it's what keeps the key
  // side from collapsing into pure silhouette under a backlit key. Runs at
  // roughly an eighth of the key: an accent, never a second key.
  kickColor: string
  kickIntensity: number
  kickX: number
  kickY: number
  kickZ: number
  // Apparent exposure, driven onto renderer.toneMappingExposure. Keep the
  // light intensities above as pure RATIOS and let this carry the stop level
  // -- that's what keeps the rig tunable. See Environment.tsx's useFrame.
  exposure: number
  // Sun glare strength, 0..1 (SunFlare.tsx). Evening only.
  flareOpacity: number
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
    // Cut hard (0.34 -> 0.10) across every preset now that there's a real
    // directional fill below. Ambient is the only light with zero normal
    // dependence, so every unit of it is a unit of flatness -- and, worse for
    // this scene, every unit of it lands inside cast shadows and lifts them
    // straight back out. Measured on the sand: cutting ambient and hemi and
    // dropping the rim/fill elevations (below) is what took the avatar's
    // shadow from a barely-there 15% darkening to a readable one.
    ambientIntensity: 0.1,
    hemiSky: "#ffd9c2",
    hemiGround: "#3a2a2a",
    hemiIntensity: 0.22,
    dirColor: "#ffcba4",
    dirIntensity: 2.25,
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
    rimIntensity: 1.4,
    // Opposite the key (which is screen-right at this phase) and behind, so
    // it draws an edge the sunrise can't reach. 111 degrees of azimuth
    // separation from the key.
    rimX: -24,
    rimY: 6,
    rimZ: -16,
    // Cool morning sky against the warm low sun -- the widest colour
    // separation of any phase except evening.
    fillColor: "#93b4e8",
    fillIntensity: 0.8,
    fillX: -22,
    fillY: 9,
    fillZ: 18,
    kickColor: "#ffd9b0",
    kickIntensity: 0.3,
    kickX: 14,
    kickY: 3,
    kickZ: 16,
    exposure: 0.92,
    flareOpacity: 0,
  },
  day: {
    skyTop: "#1a6bab",
    skyHorizon: "#eaf7ff",
    ambientColor: "#dff2ff",
    ambientIntensity: 0.08,
    hemiSky: "#bfe9ff",
    hemiGround: "#3a2a20",
    hemiIntensity: 0.18,
    dirColor: "#fff6e2",
    dirIntensity: 2.75,
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
    rimIntensity: 1.1,
    rimX: -26,
    rimY: 7,
    rimZ: -18,
    // Open sky blue. The key-to-fill ratio here works out to ~1.5 stops --
    // the classic 3:1 film ratio, and the most "normal" of the four phases.
    fillColor: "#a8d4ff",
    fillIntensity: 0.72,
    fillX: -25,
    fillY: 10,
    fillZ: 20,
    // Warmer than the key (#fff6e2): sand bounce is warmer than direct
    // midday sun, not cooler.
    kickColor: "#ffe6b8",
    kickIntensity: 0.35,
    kickX: 16,
    kickY: 4,
    kickZ: 18,
    // The brightest phase, and the one that was reading overexposed: the sand
    // and the sun disc were sitting up in AgX's shoulder where the curve has
    // almost no slope left, so they bleached out AND took the shadow contrast
    // with them. Pulling the stop down is the right lever for that rather than
    // touching any light -- it scales the whole image uniformly, so every
    // key/fill/rim/kick ratio above survives untouched, and landing lower on
    // the curve actually gives back contrast instead of costing it.
    exposure: 0.76,
    flareOpacity: 0,
  },
  evening: {
    skyTop: "#1c2f52",
    skyHorizon: "#ff9d6b",
    ambientColor: "#ffcf9a",
    ambientIntensity: 0.06,
    hemiSky: "#ffb37a",
    hemiGround: "#3a2a3a",
    hemiIntensity: 0.24,
    dirColor: "#ff9d5c",
    dirIntensity: 2.6,
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
    // Pushed back from -22 to bring the sun ON SCREEN at evening. sunAngle
    // puts the disc at world x = -21.5, which at z = -22 projected to NDC
    // x = -1.11 -- just outside the left edge, so evening had no visible sun
    // at all despite rendering one at 35% opacity, and the lens flare
    // (SunFlare.tsx) had nothing on screen to originate from; only the outer
    // tail of its glare crept in, and on a wider viewport not even that.
    //
    // Moving the disc further AWAY is what pulls it inward: angular offset
    // from the camera axis shrinks as depth grows. At -38 it lands around NDC
    // (-0.86, 0.32) -- comfortably inside the frame on the left, and still
    // inside it at wider aspect ratios. sunZ is a plain per-phase field with
    // no bearing on the 90-degrees-apart sunAngle invariant below, so this is
    // the safe knob to move for framing.
    sunZ: -38,
    // No moon during evening -- it's still below the horizon, rising, at
    // this point in the cycle.
    moonOpacity: 0,
    moonAngle: 324,
    moonZ: -20,
    starsOpacity: 0.3,
    // No aurora during evening -- it's a night-only effect.
    auroraOpacity: 0,
    // Was #ff8a4c, the same orange family as the key. That reads as two suns
    // now that the rim sits on the opposite side of frame (below): a warm
    // edge on BOTH sides of a subject has no physical reading. Coral-pink is
    // the Belt of Venus -- the anti-sunset sky opposite a setting sun -- so
    // it's hue-separated from the key while still unmistakably "sunset".
    rimColor: "#ff7a6b",
    rimIntensity: 1.9,
    // The reason the rim had to become per-phase at all. The old fixed
    // [-2, 7, -9] sits at camera azimuth -22 degrees, and evening's key is at
    // -71 degrees -- the SAME side of frame. It contributed no silhouette
    // separation whatsoever at exactly the phase where a rim matters most,
    // just extra brightness on an already-lit edge. Swinging it to
    // screen-right restores 113 degrees of separation.
    //
    // The elevation (6, vs the key's 37) is doing separate work: a rim high
    // enough to rake from above also lands a lot of light on the horizontal
    // sand, which fills every cast shadow back in -- the ground doesn't know
    // the light was meant for edges. Keeping every non-key light low means
    // they graze vertical faces (what fill and rim are actually for) and
    // barely touch the floor, so the key owns the ground and its shadows
    // stay dark. Same reasoning applies to fillY below.
    rimX: 24,
    rimY: 6,
    rimZ: -16,
    // Deep dusk sky. Against the #ff9d5c key this is a 5.4x red:blue
    // separation -- the widest of the four phases, which is correct: sunset
    // is when warm key and cool sky are furthest apart.
    fillColor: "#5c78b4",
    // The dimmest fill of the four, giving evening the most dramatic
    // key-to-fill ratio (~1.8 stops).
    fillIntensity: 0.46,
    fillX: 22,
    fillY: 9,
    fillZ: 20,
    // Cooler than the key (#ff9d5c) -- bounce desaturates, so sand kicking
    // sunset light back up is less saturated than the sunset itself.
    kickColor: "#ffb27a",
    kickIntensity: 0.5,
    kickX: -14,
    kickY: 3,
    kickZ: 16,
    // Down with day (see that preset's note). Evening had the worst of it --
    // a low warm key plus the lens flare's own additive glare stacked on top
    // of an already-hot stop, which is what turned the whole frame into a
    // pink haze. The flare's gain came down alongside this (SunFlare.tsx).
    exposure: 0.8,
    // The one phase with sun glare. Dawn is deliberately 0: its sun disc
    // actually sits at y = -28, below the horizon (see the sunAngle comment
    // on the night preset), so a flare there would bloom from a corner the
    // sun isn't in.
    flareOpacity: 1,
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
    //
    // That legibility now comes from a directional fill instead of raw
    // ambient: 0.60 -> 0.34 here, with the difference (and more) moved into
    // fillIntensity 0.92, the strongest fill of any phase. Night was the
    // worst offender for flatness precisely because it had the most ambient
    // -- a flat blue wash rather than moonlight. Same legibility, actual
    // shape.
    ambientColor: "#3a5c94",
    ambientIntensity: 0.18,
    hemiSky: "#2c5490",
    hemiGround: "#0a0d18",
    hemiIntensity: 0.4,
    dirColor: "#cfe0ff",
    dirIntensity: 2.25,
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
    rimIntensity: 1.7,
    rimX: -22,
    rimY: 7,
    rimZ: -18,
    // The strongest fill of the four -- moonlight is genuinely low-contrast
    // (~0.85 stops key-to-fill here, the softest of any phase), and this is
    // what replaces the ambient wash that used to make night legible.
    fillColor: "#4a6fa8",
    fillIntensity: 0.92,
    fillX: -20,
    fillY: 10,
    fillZ: 22,
    // Bluer than the moonlight key -- this one is a water glint, not sand.
    // Night is the only phase where key and fill are both cool, which is
    // what leaves the campfire's #ff7a30 as the only warm in frame.
    kickColor: "#7ab6ff",
    kickIntensity: 0.18,
    kickX: 13,
    kickY: 4,
    kickZ: 18,
    // Still the biggest of the four: night has the least headroom and has to
    // stay legible, so it comes down least in the overall stop reduction. If
    // it reads dark, raise fillIntensity BEFORE this -- exposure lifts the sky
    // dome too, and a lifted night sky undoes the phase.
    exposure: 1.12,
    flareOpacity: 0,
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
