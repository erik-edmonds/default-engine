import * as THREE from "three"

/** OPTICS -- the beacon wakes, flies, and surveys the island.
 *
 *  NAMED `optics` BECAUSE THE TWO OBVIOUS NAMES ARE TAKEN, and both are
 *  load-bearing. "lens" is the cursor's hexagonal gem (helpers/cursor.ts,
 *  layout/SceneCursor.tsx, helpers/useCursorHover.ts) and ALSO the camera's
 *  field of view in Scene.tsx's own comments. "scan" is the COPC point-cloud
 *  viewer -- lib/scan/, components/scan/, helpers/scanStats.ts. A third
 *  meaning for either would make both ungreppable.
 *
 *  This file is the timing and the framing. The shader numbers live with the
 *  material that uses them; the target list lives in config/opticsTargets.ts. */

// ------------------------------------------------------------------ timing

/** The beacon lifts off its base and loops, before it knows where it is going. */
export const OPTICS_WAKE_SECONDS = 1.1

/** How fast the beacon closes on its anchored screen position once it has one.
 *  A MathUtils.damp lambda, not a duration -- the anchor is a moving target
 *  while the camera is still flying, and a tween toward a moving point either
 *  overshoots or arrives early. Higher is snappier; 6 lands it in roughly
 *  three quarters of a second without a visible stop. */
export const OPTICS_SETTLE_LAMBDA = 6

/** The pull-back, and the flight home afterwards. Both the same, so the
 *  sequence is symmetric. */
export const OPTICS_CAMERA_SECONDS = 1.5

/** The sweep itself, and how long the wash takes to clear after the front has
 *  run out of island. */
export const OPTICS_SWEEP_SECONDS = 2.4
export const OPTICS_FADE_SECONDS = 0.8

/** Phase boundaries, as seconds from the click. Derived rather than written
 *  out, so changing one duration above cannot leave a boundary behind.
 *
 *  The beacon anchors well before the camera arrives -- SETTLE is a damp, not
 *  a duration -- so `settling` is bounded by the CAMERA flight, which is the
 *  thing the scan actually has to wait for. Sweeping while the camera is still
 *  moving would hide the front behind its own motion blur. */
export const OPTICS_SCAN_AT = OPTICS_WAKE_SECONDS + OPTICS_CAMERA_SECONDS
export const OPTICS_DONE_AT = OPTICS_SCAN_AT + OPTICS_SWEEP_SECONDS + OPTICS_FADE_SECONDS

// ------------------------------------------------------------------ framing

/** Where the camera goes to watch the sweep, and what it looks at.
 *
 *  A POSITION AND A LOOK TARGET, not a recorded Euler, unlike every pose in
 *  config/positions.ts. Those were captured off a live camera and pasted back;
 *  this one is authored, and "stand here, look there" is the form you can
 *  actually edit. The Euler is derived at call time with Object3D.lookAt --
 *  see OpticsCamera.tsx -- which is the same arithmetic three would do anyway.
 *
 *  THE NUMBERS. The island's own mesh spans x[-8.5, 8.4] z[-8.1, 8.3], and the
 *  four floating islands push that out to x[-26.5, 10.8] z[-34.1, -2.0] with a
 *  top at y 17.8 (measured through the full scale-3 / rotate-100deg chain --
 *  see config/positions.ts for why that chain exists). Standing at z 34 and
 *  y 22 puts the whole of it in front of the camera and above nothing: the
 *  camera is 4 units clear of the tallest geometry and 26 units outside the
 *  terrain's furthest reach, so config/terrain.ts's clearance table has
 *  nothing to say about it.
 *
 *  Distance to the look target is 48 units. At ISLAND_FOV_Y (50 degrees) that
 *  is 44.8 world units of visible height, against the 45 the island spans --
 *  so it fills the frame with no margin to spare, which is the point of
 *  pulling back at all. */
export const OPTICS_CAMERA_POSITION = new THREE.Vector3(0, 22, 34)
export const OPTICS_CAMERA_LOOK = new THREE.Vector3(-4, -1, -8)

/** How far in front of the camera the beacon parks once it is a companion.
 *
 *  Near enough to read as held rather than as scenery, far enough to clear the
 *  pier: from the home camera the closest island geometry is about six units
 *  out, so 3.4 never intersects anything. It is also well past CAMERA_NEAR
 *  (0.5), so no amount of head-turning clips it. */
export const OPTICS_COMPANION_DISTANCE = 3.4

/** Where on the screen, as a share of the frame's half-height, measured down
 *  from the middle. 0.72 puts the beacon's centre about 86% of the way down
 *  and leaves roughly a tenth of the screen's height below it -- clear of the
 *  journey rail and the chrome row, both of which sit at z-10. */
export const OPTICS_COMPANION_DROP = 0.72

/** The beacon's radius once anchored, in world units at the distance above.
 *
 *  Chosen as a share of the picture rather than by eye: 0.16 against a
 *  half-height of 1.585 is about 5% of the screen's height, which is a 45px
 *  object on a 900px viewport -- the same order as the 56px home button. Its
 *  resting scale on the pier is 0.5, so this is a real shrink and reads as the
 *  thing coming toward you. */
export const OPTICS_COMPANION_SCALE = 0.16

// ------------------------------------------------------------------ the arc

/** How high the beacon climbs off its base while waking, and how wide it
 *  loops on the way. Both in world units, both at the beacon's resting scale. */
export const OPTICS_WAKE_RISE = 1.4
export const OPTICS_WAKE_ORBIT = 0.75

/** Turns of that loop. One and a half, so it does not land facing the way it
 *  started -- a whole number of turns reads as a glitch rather than a flourish. */
export const OPTICS_WAKE_TURNS = 1.5

// ------------------------------------------------------------------ colour

/** The sweep is the colour of the thing that emitted it.
 *
 *  #1fb2f5 is the beacon's own idle blue -- models/Beacon.tsx, plus the four
 *  emissive panels on its pedestal in models/Base.tsx. Making the wave any
 *  other colour breaks the only cue that says where it came from.
 *
 *  LINEAR LUMINANCE 0.387, which is the number the edge gain is built on. Blue
 *  carries 7.2% of luminance and red 21%, so a mostly-blue colour is dark to
 *  the bloom pass however bright it looks. See lib/optics/scanMaterial.ts. */
export const OPTICS_WAVE_COLOR = "#1fb2f5"

/** The brackets, in the site's primary accent -- the same #d25a1a as the
 *  hotspot hover, the scene hints, the sound toggle and the name stamp.
 *
 *  Deliberately NOT the wave's blue. Wave and detection are two different
 *  claims about the world ("I am looking at this" versus "I found this"), and
 *  giving them one colour would collapse them into a single effect. */
export const OPTICS_BRACKET_COLOR = "#d25a1a"
