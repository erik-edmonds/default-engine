import * as THREE from "three"

/** OPTICS -- the beacon wakes, tours the island, and surveys it.
 *
 *  NAMED `optics` BECAUSE THE TWO OBVIOUS NAMES ARE TAKEN, and both are
 *  load-bearing. "lens" is the cursor's hexagonal gem (helpers/cursor.ts,
 *  layout/SceneCursor.tsx, helpers/useCursorHover.ts) and ALSO the camera's
 *  field of view in Scene.tsx's own comments. "scan" is the COPC point-cloud
 *  viewer -- lib/scan/, components/scan/, helpers/scanStats.ts. A third
 *  meaning for either would make both ungreppable.
 *
 *  This file is the timing, the path and the framing. The shader numbers live
 *  with the material that uses them; the target list is config/opticsTargets.ts. */

// ------------------------------------------------------------------ timing

/** The tour. The beacon lifts off its base and flies a circuit of the island
 *  -- out over the beach, behind the palms, and back -- before it knows where
 *  it is going to end up. */
export const OPTICS_WAKE_SECONDS = 2.8

/** How long the beacon gets to close on its anchored screen position, with
 *  the camera deliberately HELD STILL throughout.
 *
 *  This phase exists because the first cut did not have it: the camera began
 *  pulling back the instant the tour ended, while the beacon was still
 *  travelling to its anchor, and the two motions read as one muddled move.
 *  Nothing may take the camera until the beacon has arrived. */
export const OPTICS_SETTLE_SECONDS = 1.0

/** How fast the beacon closes on that anchor. A MathUtils.damp lambda, not a
 *  duration -- the anchor is only a fixed point once the camera stops, and a
 *  damp costs nothing to leave running afterwards. */
export const OPTICS_SETTLE_LAMBDA = 6

/** How long the pull-back takes. The flight HOME reuses it.
 *
 *  This has been round the houses: 1.5 read as a jump, 2.6 as dawdling, 1.3
 *  was right while the camera waited its turn. It is 1.8 now because the
 *  camera no longer waits -- it leaves at OPTICS_CAMERA_AT, halfway through
 *  the tour, and most of that extra time is spent barely moving at all. The
 *  ease (see OpticsCamera) is a smoothstep over a warped input, so the first
 *  third of these 1.8 seconds covers almost no distance.
 *
 *  The perceived speed is therefore faster than 1.3 was, not slower. */
export const OPTICS_CAMERA_SECONDS = 1.8

/** The sweep. Half the speed it ran at first: the front crossed the island in
 *  under a second, which is long enough to see but not long enough to read. */
export const OPTICS_SWEEP_SECONDS = 4.8

/** How long the detection boxes stay up after the front has run out of island.
 *
 *  Without this they were only ever visible between their own trigger and the
 *  end of the sweep, so the last thing found flashed for a moment and went.
 *  The hold is also when the scene is at its darkest and the overlay is the
 *  whole picture -- it is the beat the effect exists for. */
export const OPTICS_HOLD_SECONDS = 2.5

/** Then everything clears together: wash, boxes, labels and the darkness. */
export const OPTICS_FADE_SECONDS = 1.0

/** How far the front travels, in world units from the beacon.
 *
 *  Measured against the survey pose rather than guessed. By the time the sweep
 *  fires the beacon sits 3.4 units in front of a camera at (-5, 12, 32), and
 *  the furthest thing it has to reach is the back corner of the floating-island
 *  cluster at roughly (-26.5, 17.8, -34) -- about 70 units out. 78 clears it
 *  with margin, and anything beyond the island costs nothing because there is
 *  no geometry there to shade. */
export const OPTICS_SCAN_REACH = 78

/** Phase boundaries, in seconds from the click. DERIVED, never written out,
 *  so changing one duration above cannot leave a boundary stranded behind it. */
/** When the camera STARTS backing away -- halfway through the tour, not after
 *  it.
 *
 *  A timestamp rather than a phase boundary, deliberately. The two motions are
 *  meant to OVERLAP now: the camera drifts off while the beacon is still
 *  flying, so the pull-back is already under way by the time the eye is free
 *  to notice it. Expressing that as a phase would mean phases that overlap,
 *  and `opticsPhaseAt` is a linear partition for good reason -- chrome and
 *  input suppression want exactly one answer per instant.
 *
 *  Paired with the ease in OpticsCamera, which puts peak speed at 2.76s --
 *  within a rounding error of the tour ending at 2.8. */
export const OPTICS_CAMERA_AT = 1.4

/** The sweep begins once the beacon has settled. It no longer waits for the
 *  camera: the flight starts at OPTICS_CAMERA_AT and has arrived by 3.2,
 *  comfortably before this. That also unpicks a coupling that was easy to trip
 *  over -- OPTICS_CAMERA_SECONDS used to be a term in this sum, so the flight
 *  duration WAS the scan schedule and retiming the camera silently moved the
 *  sweep, the hold and the fade. */
export const OPTICS_SCAN_AT = OPTICS_WAKE_SECONDS + OPTICS_SETTLE_SECONDS
/** When the front has finished travelling and the hold begins. */
export const OPTICS_SWEEP_END_AT = OPTICS_SCAN_AT + OPTICS_SWEEP_SECONDS
/** When the hold ends and everything starts clearing. */
export const OPTICS_FADE_AT = OPTICS_SWEEP_END_AT + OPTICS_HOLD_SECONDS
export const OPTICS_DONE_AT = OPTICS_FADE_AT + OPTICS_FADE_SECONDS

/** How far the world is taken down while the survey runs, as a share of its
 *  normal brightness. 0 would be black; this keeps enough that the island
 *  still reads as a shape rather than a hole, which is what the reference
 *  image does too -- its buildings are dark, not absent.
 *
 *  THIS IS A LINEAR FACTOR AND AgX DOES NOT PASS IT THROUGH. The first value
 *  tried here was 0.16, which is a 6x cut in linear light and looked like it
 *  ought to be plenty. On screen it read as dusk. The tone mapper is the
 *  reason: AgX has a deliberate shadow lift, so a sixfold drop in scene light
 *  comes out as roughly a halving of display brightness.
 *
 *  Measured against a control session that ran the same script WITHOUT
 *  clicking, so the time-of-day cycle could not confound it: at 0.06 the whole
 *  frame came out at 0.58x the control, and the dawn sky read as mid-brown
 *  rather than dark -- linear 0.06 encodes to about 0.29x through sRGB before
 *  AgX lifts it further. 0.025 is what it takes for the world to actually
 *  recede, and the island is still a visible shape at it.
 *
 *  NOT AN EXPOSURE AND NOT A SCRIM, both ruled out by measurement rather than
 *  taste -- see the long note at the islandLight multiplier in
 *  Environment.tsx. */
export const OPTICS_DIM = 0.025

// ------------------------------------------------------------------ the tour

/** Where the beacon flies while it wakes.
 *
 *  A CIRCUIT, NOT A HOP. The first version rose 1.4 units and looped 0.75
 *  across, which is a fidget rather than a flight. This leaves the pier, climbs
 *  over the beach, drops to canopy height to pass BEHIND each of the three
 *  palms in turn, crosses the back of the island and returns to the front.
 *
 *  WHAT THE HEIGHTS ARE UP AGAINST, measured rather than guessed. The island's
 *  top surface is y -1.51 and the Shack tops out at y -0.53. The palms are at
 *  [-2,-6,5.5], [-7,-3.5,-4.5] and [7,-6,0] with scales 0.65/0.55/0.72, and
 *  their canopies reach y -0.41, 1.23 and 0.19 respectively. So the path holds
 *  y >= 0.4 over the island's interior for clearance, and drops below that
 *  only at the three waypoints whose whole job is to be occluded by a canopy.
 *
 *  "Behind" is from the home camera at z 14.57, so behind a palm means a
 *  SMALLER z than the palm's own -- which is why each duck waypoint sits a
 *  unit or two further in than the trunk it hides behind. */
export const OPTICS_WAKE_POINTS: [number, number, number][] = [
  [-0.38, -1.35, 8.18],   // rest, on the pier
  [1.09, 0.8, 5.99],      // lift away, drifting inland
  [-0.52, 1.6, 1.93],      // over the beach, well clear of the Shack
  [-3.26, -0.5, 3.27],    // duck behind the near palm's canopy (top y -0.41)
  [-5.54, 0.6, -2.52],    // swing left
  [-6.0, 0.4, -6.58],    // behind the left palm (canopy to y 1.23)
  [-1.47, 2.2, -6.09],    // climb, cross the back
  [3.67, 1.8, -2.12],     // cross to the right
  [7.16, 0.0, 1.09],     // behind the right palm (canopy to y 0.19)
  // THE TAIL DOES NOT GO NEAR THE PIER, and it took three attempts to get
  // that right, so the arithmetic is written down.
  //
  // The beacon flying a lap and then returning over its own pedestal before
  // leaving for the screen reads as the animation changing its mind. The
  // original tail ended at [3.0, 1.0, 6.8] then [1.75, 0.2, 8.0] -- directly
  // above the base. The second attempt moved the FINAL waypoint out to
  // [-1.0, 0.2, 10.5] and left the one before it at [2.0, 0.8, 7.5], which is
  // 0.56 units in XZ from the base at [1.75, *, 8.0]: still a pass straight
  // over it, and it still looked wrong.
  //
  // The real fix is to go round the LEFT. The screen anchor the beacon is
  // heading for sits at roughly (-4.4, -2.0, 11.1) -- bottom centre of frame
  // -- while the pedestal is bottom right, so the path has no business near
  // the pier at all. Closest approach in XZ is now 4.04 units, and nothing
  // here crosses the dock's footprint of x 0.55..2.96, z 5.15..9.26.
  //
  // AND IT DESCENDS. The version before this one climbed on the way out:
  // [4.0, 1.6, 2.5] projects to 85% of the way to the right edge of frame and
  // 52% up, so the beacon shot into the top-right corner and then swept back
  // across the whole picture to reach an anchor that is at the BOTTOM. Two
  // thirds of the screen crossed for no reason.
  //
  // These three fall the whole way instead -- y -0.2, -1.0, -1.7 against an
  // anchor at about -2.0 -- and stay inside the middle of the frame. The last
  // one is roughly a unit from where the damp takes over, so the handover is
  // a continuation rather than a change of direction.
  //
  // AND IT HANDS OVER FROM UP-AND-RIGHT OF THE ANCHOR. The version before
  // this one ended at [-4.5, -1.7, 10.8], which projects to screen (833, 937)
  // against an anchor at (1190, 1330) -- so the beacon overshot LEFT past the
  // anchor and the damp then dragged it back right and down. A dogleg, and a
  // visible one.
  //
  // These three stay to the right of the anchor on screen the whole way
  // (ndc +0.54 then +0.13) and above it, so the damp carries the beacon down
  // and left in one continuous motion instead of reversing.
  [1.51, 0.4, 4.03],      // forward over the beach, already dropping
  [-3.04, -0.4, 7.47],    // still right of the anchor on screen
  [-5.65, -0.9, 8.73],    // hand over up-and-right of it
]

/** The flown curve. Centripetal, the same construction config/journey.ts uses
 *  for JOURNEY_PATH -- uniform Catmull-Rom cusps and self-intersects on a path
 *  with waypoints this unevenly spaced. */
export const OPTICS_WAKE_PATH = new THREE.CatmullRomCurve3(
  OPTICS_WAKE_POINTS.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false,
  "centripetal",
)

// ------------------------------------------------------------------ framing

/** Where the camera goes to watch the sweep, and what it looks at.
 *
 *  A POSITION AND A LOOK TARGET, not a recorded Euler, unlike every pose in
 *  config/positions.ts. Those were captured off a live camera and pasted back;
 *  this one is authored, and "stand here, look there" is the form you can
 *  actually edit. The Euler is derived at call time with a PerspectiveCamera's
 *  lookAt -- see OpticsCamera.tsx for why the camera class matters.
 *
 *  OBLIQUE, NOT OVERHEAD. The previous pose (0, 34, 26) looked down at 45.7
 *  degrees and read as a map rather than a viewpoint. This one is 17.5 degrees
 *  below horizontal: the camera has stepped back and up a little and is still
 *  looking ACROSS the island, not down onto it.
 *
 *  Distance to the look target is 39.8 units, which at ISLAND_FOV_Y gives 37
 *  units of visible height and 59 of width -- enough to hold the main island
 *  and all three portals (x -28.3 to 8.8) in one frame.
 *
 *  THIS POSE SITS INSIDE THE CLOUD TORUS, DELIBERATELY. Measured from
 *  config/store.ts and Sky.tsx's per-instance scale, cloud bodies occupy radius
 *  12.70 to 40.62 at height 2.34 to 27.66 -- a ring with only three clear
 *  volumes: inside it, below it, or above it. Inside is too close to see
 *  anything, below is a flat side-on view, and above is the 45-degree map that
 *  was rejected. At radius 32.4 and height 12 this pose is squarely in the
 *  ring, and the clouds move instead: see OPTICS_CLOUD_DUCK_RADIUS. */
export const OPTICS_CAMERA_POSITION = new THREE.Vector3(-13.11, 12, 29.62)
export const OPTICS_CAMERA_LOOK = new THREE.Vector3(-3.28, 0, -7.09)

/** Clouds within this many world units of the camera shrink out of the way
 *  while a run is live, and come back afterwards.
 *
 *  WHY THE CLOUDS MOVE AND NOT THE CAMERA. 42 clouds are scattered through a
 *  torus around the island and the camera has to be inside it to get an
 *  oblique view at a useful distance. Re-rolling placement 4,000 times through
 *  the real clearOfTerrain puts the odds of the lens STARTING INSIDE a cloud
 *  body at about one session in ten at this kind of pose, with one within eight
 *  units nearly always. The authored sky journey flies through the same bands
 *  on over half its path and gets away with it because it is moving; a held
 *  survey pose is a different problem, and the first attempt at one had a
 *  single cloud draped across a third of the frame for the whole sweep.
 *
 *  26, NOT THE 12 THIS STARTED AT. 12 clears the lens and nothing else, which
 *  turned out to solve only half the problem: the survey camera stands 34.7
 *  units from the island, so a cloud 20 units out is nowhere near the lens and
 *  still squarely between it and the thing being surveyed. Probed with a dawn
 *  cycle and random placement, two clouds were draped across the middle of the
 *  frame with the island behind them.
 *
 *  26 clears roughly the near three-quarters of that sight line. Clouds beyond
 *  it -- on the far side of the island -- stay put and read as the backdrop
 *  they are. And this only ever applies while the camera is out at the survey
 *  pose: the duck factor is zero for the whole rest of the session. */
export const OPTICS_CLOUD_DUCK_RADIUS = 26

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
 *  half-height of 1.585 is about a tenth of the screen's height, the same
 *  order as the 56px home button. Its resting scale on the pier is 0.5, so
 *  this is a real shrink and reads as the thing coming toward you. */
export const OPTICS_COMPANION_SCALE = 0.16

// ------------------------------------------------------------------ colour

/** The sweep is the colour of the thing that emitted it.
 *
 *  #1fb2f5 is the beacon's own idle blue -- models/Beacon.tsx, plus the four
 *  emissive panels on its pedestal in models/Base.tsx.
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
 *  one colour would collapse them into a single effect. */
export const OPTICS_BRACKET_COLOR = "#d25a1a"
