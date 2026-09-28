/** The paper world you fly through at the top of the sky journey.
 *
 *  This used to be a tableau: a fixed table of props at fixed offsets, lowered
 *  in once on a timer and then static in world space for the rest of the
 *  journey. It is now a CORRIDOR -- a stream of props that approach, pass, and
 *  are recycled ahead of you as you scroll, each one dropping in on its string
 *  as it comes into view.
 *
 *  Everything the world is made of lives here for the same reason
 *  config/skyJourney.ts exists: the backdrop's palette, the corridor's shape
 *  and the props' mix are one look, and they must not be able to drift apart.
 *
 *  The reference is a sheet of striped blue construction paper with white paper
 *  cutouts standing a few millimetres off it, each throwing a soft shadow down
 *  and to the right. */

import { AVATAR_BASE_POSITION, SKY_JOURNEY_DISTANCE, SKY_RISE } from "@/config/skyJourney"
import { CAMERA_BEHIND } from "@/config/flightFrame"

/** The backdrop. Fed straight into the sky dome's paper branch. */
export const PAPER_SKY = {
  // Saturated well past the reference on purpose. The scene ends in an AgX
  // tone-mapping pass (page.tsx's <ToneMapping>), which is a whole-framebuffer
  // effect -- `toneMapped: false` on a material does not opt out of it -- and
  // AgX desaturates as it rolls off. Authored at the reference's own values the
  // backdrop came out grey; these are the values that LAND on the reference
  // after the curve.
  base: "#6f9ec9",
  stripe: "#93bde0",
  /** Stripes around the FULL TURN, and it must be an EVEN INTEGER.
   *
   *  That is not a style choice: atan gives (-PI, PI], so the two sides of the
   *  wrap are the same direction in space but opposite in the formula, and only
   *  a whole even number of stripes puts them on the same phase. The old value
   *  was 16 stripes per RADIAN = 100.53 per turn, which put 0.265 on one side
   *  of the seam and 0.735 on the other -- the vertical line in the backdrop.
   *
   *  100 keeps almost exactly the old stripe width (100.53 -> 100). */
  stripeFreq: 100,
} as const

/** Where the corridor is centred, in world units.
 *
 *  Derived from the avatar's sky position rather than the origin: the journey
 *  holds the avatar in frame for its whole 600 units, so that point -- not the
 *  island below -- is what the camera is actually looking at. */
export const PAPER_ORIGIN: [number, number, number] = [
  AVATAR_BASE_POSITION[0],
  AVATAR_BASE_POSITION[1] + SKY_RISE,
  AVATAR_BASE_POSITION[2],
]

// --- the corridor ----------------------------------------------------------

// THE CORRIDOR IS DERIVED FROM THE FRUSTUM, NOT CHOSEN.
//
// Every complaint about the clouds is geometric -- "shouldn't start too close
// to the camera", "shouldn't be so high or low that the total cloud can't be
// seen when it enters", "shouldn't cross the path of the avatar" -- and the
// previous constants were world-space numbers picked by eye with no relation
// to what the camera can actually see. So they were all violated at once, and
// tuning any one of them broke another.
//
// Below, each of those three sentences is one derived constant.

/** Vertical field of view, degrees.
 *
 *  The sky is NARROWER than the island. A tighter lens puts more of the frame
 *  on the subject and less on empty backdrop, and it is the difference between
 *  a wide establishing shot and the portrait this sequence wants. The corridor
 *  below is derived from the SKY value, because that is the frame the props
 *  have to fit inside. */
export const ISLAND_FOV_Y = 50
// Two successive 15% reductions, both asked for after seeing the scene.
// Widened from 0.64. Two successive 15% cuts plus your own edit had taken the
// sky to a 32-degree lens, which is a long telephoto -- it flattens the depth
// the corridor exists to show.
export const SKY_FOV_SHRINK = 0.78
export const SKY_FOV_Y = ISLAND_FOV_Y * SKY_FOV_SHRINK
/** The aspect the corridor is designed against -- a desktop 16:10. The
 *  horizontal field of view depends on it, and every lateral number here is
 *  derived from that. */
export const DESIGN_ASPECT = 1.6

const DEG = Math.PI / 180

/** NO PENDULUM.
 *
 *  Props used to swing on their strings: two floats each, driven by how fast
 *  the anchor was being dragged sideways. It was rebuilt several times -- as
 *  rapier bodies, then as a procedural spring -- and never read as paper on a
 *  string; the note after the last attempt was that it never turned out right,
 *  so it is gone rather than tuned again. The cutouts hang straight.
 *
 *  Worth knowing if it is ever revisited: the string was drawn in the prop's
 *  own local space, straight up world-Y, so it never bent with the swing. The
 *  cutout tilted under a rigid vertical line, which is part of why it did not
 *  convince. */
/** Half-angles of the frame. Everything below is trigonometry on these two. */
export const HALF_FOV_V = (SKY_FOV_Y / 2) * DEG
export const HALF_FOV_H = Math.atan(Math.tan(HALF_FOV_V) * DESIGN_ASPECT)

/** Axial distance from the CAMERA at which a prop appears, and at which it is
 *  recycled. Measured from the camera rather than from the avatar, because
 *  every constraint here is about what the camera sees.
 *
 *  LONG, because the corridor's length is what sets how often a new prop
 *  appears. At 80 down to 24 a prop crossed in 112 units of scroll, and with
 *  five of them one arrived every 22 units -- about a quarter of a second at
 *  the rate the journey is actually scrolled, which is the "a new one every
 *  few frames". At 135 down to 14 the crossing is 121 units of world travel
 *  and, at the rate below, 448 units of scroll: one new prop roughly every
 *  1.4 seconds instead of every 0.3.
 *
 *  FAR is also "not too close to start": at 135 units a cloud 27 across
 *  subtends about 11 degrees on a 37-degree half-frame -- a legible shape with
 *  a long approach in front of it. NEAR is where the innermost prop has
 *  completely left the frame sideways, so props are retired at the edge rather
 *  than sweeping through the lens. */
/** BROUGHT IN FROM 170, AND THIS IS THE CLOUD-DISTANCE LEVER.
 *
 *  "The clouds are still much too far" is now the fifth round of that note, so
 *  it is worth writing down why moving them in is not simply a smaller number
 *  somewhere. A prop's lateral offset is bounded below by CORRIDOR_CLEAR_RADIUS
 *  -- the subject's angular half-width swept out to the distance props appear
 *  at -- because the standing rule is that a cloud may not START behind the
 *  Dragonite. That clearance is a CONSTANT world offset, so shrinking it
 *  directly is the one thing that breaks the rule.
 *
 *  Shrinking the DISTANCE shrinks the clearance with it, at the same angle:
 *  at 170 the rule demanded 22.4 units of offset, at 135 it demands 17.8. The
 *  band comes in by a fifth and the guarantee is untouched.
 *
 *  THERE IS A FLOOR ON THIS, and it is worth writing down because the first
 *  attempt went straight through it. A prop travels a straight line at a fixed
 *  offset s with a fixed half-width w, so BOTH its angular offset and its
 *  angular size grow as 1/d -- the ratio s/w is the same at every distance,
 *  and it alone decides whether the prop leaves through the SIDE of the frame
 *  or swells across the middle of it. At s/w below 1 the inner edge crosses
 *  the axis and the cloud ends up engulfing the camera; measured at 100, where
 *  s/w was 0.88, a cloud filled the bottom-right quarter of the frame and the
 *  paragraph was printed over it. At 135 the ratio is 1.18: the inner edge
 *  stays clear of the axis and the prop exits the way it should, while still
 *  passing a good deal nearer the subject than the 1.49 it had at 170.
 *
 *  What it costs is approach: a cloud is born at 135 units instead of 170, so
 *  it arrives larger and has less run-up. That is paid for by the pool below,
 *  which is raised so the shorter corridor still holds as many props. */
export const CORRIDOR_FAR_AXIAL = 135
/** BEHIND THE LENS, and that is the whole point of the number.
 *
 *  This used to be +10 -- ten units in FRONT of the camera -- on the reasoning
 *  that by then a prop has left the frame sideways and can be retired unseen.
 *  It has not: a prop's lateral offset is scaled for the far end of the
 *  corridor, and the ones that pass closest to the axis are still on screen at
 *  ten units. What the reader saw was a cloud vanishing in open sky, which is
 *  the "randomly disappearing" in the report. There is no offset that makes the
 *  claim true for every prop, so the corridor simply runs past the camera: a
 *  prop is recycled once it is well behind the reader's head, where nothing can
 *  be seen to happen to it. */
export const CORRIDOR_NEAR_AXIAL = -25

/** Where a prop has finished fading in, as an axial distance.
 *
 *  It fades up from nothing at CORRIDOR_FAR_AXIAL to solid here, so the gap
 *  between the two is the length of the fade -- 65 units, which at the rate
 *  below is a little over four seconds of scrolling. Long enough to read as
 *  coming out of the haze; short enough that it is solid while still small,
 *  rather than arriving half-transparent.
 *
 *  It replaces the drop as the entrance for a recycled prop. The drop is still
 *  what happens on arrival at the sky, where the reader is looking at the whole
 *  frame at once; mid-journey it happens above the top of the frame, which is
 *  a prop appearing from nowhere.
 *
 *  LENGTHENED to nearly two thirds of the approach, for a reason that is about
 *  the text rather than the entrance. A prop's side is chosen for the block
 *  that will be up when it is at its biggest, which can be the block AFTER the
 *  one up as it is born -- so the first part of its life can be spent in the
 *  words' half. Making that first part the faint part is what keeps it from
 *  showing: by the time a prop is solid it is close, and close is when its
 *  side is right. */
export const PROP_FADE_IN_AXIAL = 70

/** Where the FIRST cloud stands when the sky is dressed, as an axial distance.
 *
 *  The pool is laid out from the far end inward, so with one cloud in it the
 *  cloud begins at CORRIDOR_FAR_AXIAL -- which is exactly where the fade has
 *  it at nothing. The reader arrived to an empty sky and had to scroll before
 *  anything came: "there should be clouds at the start when the cardboard
 *  dragonite appears."
 *
 *  Started here instead, well inside the fade, so it is solid and closing as
 *  the cutout rises into the shot. */
export const CORRIDOR_START_AXIAL = 62

/** How long after arrival a prop may still be staging its drop, in seconds.
 *
 *  Every prop of the arrival wave is seeded at journey time zero plus its own
 *  DROP_STAGGER, so the whole wave is seeded inside a fifth of a second. Any
 *  prop seeded after this was seeded by a RECYCLE, and recycles do not drop. */
export const ARRIVAL_DROP_WINDOW = 1

/** How far down the approach a prop must still be WHOLLY inside the frame.
 *
 *  This is "the total cloud can be seen when it enters". Full visibility can
 *  only be a promise down to some distance -- a prop that flies past the camera
 *  must leave the frame eventually, and leaving sideways is the whole point --
 *  so the promise is: from first appearance until it is this close, no part of
 *  a prop is off any edge. After that it exits through the SIDE, which is
 *  motion, not clipping.
 *
 *  BROUGHT IN FROM 110 SO THAT THE SIDE IS REALLY WHERE IT EXITS. This number
 *  sets the vertical band (see CORRIDOR_HALF_HEIGHT), and at 110 the band was
 *  +/-30.6 units -- so a prop at the top of it left through the TOP edge at
 *  around 110, while the lateral band does not carry one past the side edge
 *  until about 50. The prop that was meant to sweep past you disappeared
 *  upwards two thirds of the way in. Now at 55, against a corridor that only
 *  runs to 100: the band is +/-11, which also answers the second half of
 *  "the clouds are too far" -- they were too far ABOVE and BELOW him as well
 *  as too far to the side. */
export const FULL_FRAME_AXIAL = 55

/** How near the flight axis a prop's nearest edge may come, and from what
 *  distance inward that must hold.
 *
 *  This used to be a band of ANGLES measured at the spawn distance, which tied
 *  the corridor's width to its length: push the spawn from 135 out to 240 and
 *  every prop moved from 28.7 units off-axis to 53.2, so the innermost one left
 *  the frame 66 units away instead of 19 and the clouds would have started far
 *  off and then never come near. Width and length are independent now.
 *
 *  The width is tied instead to the thing it exists for. A prop's angular
 *  offset only ever GROWS as it approaches, so the binding case for "it must
 *  not cross the avatar" is the farthest point at which we still care -- and
 *  inside that distance it is clear by construction. */
export const AVATAR_SAFE_AXIAL = 50
export const AVATAR_CLEAR_ANGLE = 11.5 * DEG
/** How much wider than the inner bound the band is. Narrow on purpose: the
 *  clouds are meant to pass close to the subject, not fan out to the edges. */
export const CORRIDOR_WIDTH_RATIO = 1.5

/** The cloud model's native size, in its own file's units. The scales below are
 *  hundredths because of the first number. */
const CLOUD_NATIVE_WIDTH = 232
const CLOUD_NATIVE_HEIGHT = 128
/** The star's own box, for hanging its string off the top of it. */
export const STAR_NATIVE_HEIGHT = 1.787
export const CLOUD_TOP_NATIVE = CLOUD_NATIVE_HEIGHT / 2

/** Scale range for the clouds. Bigger and narrower than before -- the brief is
 *  a few large masses, so the small end is raised rather than the large end
 *  pushed further. */
export const CLOUD_SCALE: readonly [number, number] = [0.1, 0.13]

/** The largest half-extent any prop presents.
 *
 *  Simply the model's own box now. It used to be the box rotated by SWING_MAX,
 *  because a swinging cutout turns width into height and the frame has to find
 *  room for the rotated envelope; with the pendulum gone there is nothing to
 *  rotate. */
export const PROP_HALF_W = (CLOUD_NATIVE_WIDTH * CLOUD_SCALE[1]) / 2
export const PROP_HALF_H = (CLOUD_NATIVE_HEIGHT * CLOUD_SCALE[1]) / 2

/** Where a prop first appears and is retired, expressed the way the corridor
 *  arithmetic wants it: distance ahead of the AVATAR, which sits CAMERA_BEHIND
 *  in front of the camera. */
export const CORRIDOR_DEPTH = CORRIDOR_FAR_AXIAL - CAMERA_BEHIND
/** How far the corridor extends BEHIND the avatar. Positive, now that the near
 *  end sits behind the camera as well -- see CORRIDOR_NEAR_AXIAL. Props are
 *  meant to reach the lens and pass it; retiring them short of it is what made
 *  them look like they were disappearing. */
export const CORRIDOR_BEHIND = -(CORRIDOR_NEAR_AXIAL - CAMERA_BEHIND)

/** World units of travel per unit of scroll offset.
 *
 *  The scroll axis is 0..600 (SKY_JOURNEY_DISTANCE) and is shared with the
 *  camera choreography, which uses it as an abstract progress value. Here it
 *  has to become a distance. At 0.5 the full journey carries you 300 units --
 *  a little over five corridor-lengths. Lowered from 1.6 because the corridor
 *  is now less than half as long: holding the old rate would have turned props
 *  over three times faster, and the brief is that they pass more SLOWLY. A prop
 *  now takes about 112 units of scroll to cross, against 86 before. */
/** RAISED WITH THE PASSAGE, and this is what makes "clouds and text never on
 *  the same side" possible at all.
 *
 *  The rule needs a cloud's whole visible life to fit inside one section of
 *  text, and that comparison is in WORLD units, where renumbering the scroll
 *  axis changes nothing. A cloud is in shot from about 135 units out to about
 *  5, so it is visible across roughly 105 units of flying. At 0.1 the whole
 *  journey covered 3000 * 0.1 = 300 units, a quarter of it 75 -- so every
 *  cloud outlived its section and there was no side it could be given that
 *  stayed right for its whole pass. Measured: every single reading had a
 *  cloud in the words' half.
 *
 *  MATCHED TO THE SECTION, now that the corridor is timed by it. A crossing
 *  is CORRIDOR_FAR_AXIAL to CORRIDOR_NEAR_AXIAL, 160 world units, and a block
 *  of text owns 675 units of the scroll axis -- so 160/675 = 0.237 makes the
 *  two the same length, and a cloud is exactly born and gone within one
 *  block. Under it a cloud would still be on screen when the next block
 *  arrived; over it, there is dead sky at the end of every section. It costs nothing in effort: the scroll axis was doubled
 *  at the same time as the sensitivity, so the number of gestures the trip
 *  takes is unchanged -- what changes is how much sky goes past while you make
 *  them, which is the "the scroll looks like it's going further" half of the
 *  note. */
export const CORRIDOR_TRAVEL_PER_OFFSET = 0.24

/** NO DRIFT. The corridor moves only when the reader scrolls.
 *
 *  A slow constant drift was added so the sky would not freeze when you stopped
 *  scrolling. Seen in motion it reads as the world having its own agenda:
 *  clouds sail past a camera that is standing still. The instruction after
 *  watching it was "they should not move by themselves -- the user scroll
 *  should move the clouds by the camera only", so travel is once again a pure
 *  function of scroll position and nothing else. Kept as a note rather than a
 *  constant so it is not quietly reintroduced. */

/** Total travel available, for anything that needs to reason about the end. */
export const CORRIDOR_TRAVEL = SKY_JOURNEY_DISTANCE * CORRIDOR_TRAVEL_PER_OFFSET

/** How many props exist at once.
 *
 *  FIVE, down from seven and from fourteen before that. The reference is a handful of large cloud masses,
 *  not a field of small ones -- and at the previous count and scale the sky
 *  read as confetti. Halving the count and roughly tripling the size puts the
 *  same amount of paper on screen in far fewer, far more legible pieces, and it
 *  halves the number of 330k-triangle stars that can be live at once.
 *
 *  A fixed pool, not a spawner: props are recycled rather than created and
 *  destroyed, so the scene graph and the draw count are constant for the whole
 *  journey and nothing allocates mid-flight. This is also what bounds the cost
 *  of the star -- see STAR_SHARE. */
/** ONE CLOUD PER BLOCK OF TEXT.
 *
 *  Two slots: a cloud and the star that rides on it. The pool has been four
 *  and then six, tuned against "the sky empties out" -- and the note now is
 *  the other way: "there are still too many clouds while scrolling, there
 *  should only be one cloud per text group."
 *
 *  Two is exactly that, and the arithmetic is the corridor's own. The props
 *  are spread evenly over the span, which is 160 world units, and a section of
 *  text is 150 -- so one cloud per span is one cloud per section, arriving as
 *  the block does and gone by the time the next one is up. Sparser than it has
 *  been by a factor of four, which is what the reference looks like. */
export const CORRIDOR_POOL = 2


/** How many of the pool are stars rather than clouds.
 *
 *  Deliberately low, and the reason is measured: cardboard_star.glb is 330,894
 *  triangles and 196,860 vertices, against 1,228 for the cloud. The model is
 *  used as supplied, so the only lever left is how many are on screen at once,
 *  and at 2 of 14 the stars still cost more than every cloud put together. */
export const STAR_COUNT = 1

/** How far in FRONT of its cloud a paired star rides, in world units.
 *  Enough to read as two separate cutouts at different depths; not so much
 *  that they stop looking like one arrangement. */
export const STAR_LEAD = -7

/** Where a star sits on its cloud, as a share of the cloud's own half-extents.
 *
 *  From the reference: the star tucks into the cloud's lower right, about half
 *  a half-width across and most of a half-height down, so it overlaps the body
 *  of the cloud and breaks its outline at the corner. Centred on the cloud --
 *  which is what "same side and height" gave -- it read as a badge stuck on
 *  the middle of it. */
export const STAR_OFFSET_SIDE = 0.46
export const STAR_OFFSET_UP = -0.8

/** How far above the corridor's centre every string is anchored, DERIVED.
 *
 *  It has to be above the top of the frame AT THE DISTANCE PROPS APPEAR, or
 *  the anchor is on screen and the string visibly starts in mid-air instead of
 *  running off the top like a puppeteer's. A fixed 42 was above the frame when
 *  props appeared 80 units away; at 135 the frame is 63 units tall there, so 42
 *  sat two-thirds of the way up the picture. Derived from the frustum it
 *  cannot fall behind a change to the corridor's length again.
 *
 *  A PROPORTION of the frame's height, not a flat margin on top of it. At
 *  "+8 units" a prop re-seeded only a little above the edge, so instead of
 *  descending from off-screen it blinked into view near the top and fell a
 *  short way -- which is the "clouds randomly appearing". A third of a frame
 *  above the edge gives it somewhere to come from at any corridor length.
 *
 *  The previous model gave each prop a short individual rope of 4 to 9 units,
 *  which meant the strings started in mid-air at different heights and read as
 *  unattached. */
/** The strings, as rope. Radius in world units, and a jute colour.
 *
 *  STRING, not tubing. At 0.5 and 6 sides these read as paper-towel tubes --
 *  wide enough to see the facets and wide enough to look rigid. A third of
 *  that, with more sides, reads as thick thread at the distances involved.
 *
 *  Two radii, because the distances differ by twenty to one. PROP is for the
 *  corridor, where a cutout is tens of units across and 120 units away; NEAR is
 *  for the caption cards and the subject, a few units from the lens. Both land
 *  at roughly the same apparent thickness on screen. */
export const ROPE_RADIUS_PROP = 0.13
export const ROPE_RADIUS_NEAR = 0.035
export const ROPE_COLOR = "#c8a97a"

export const STRING_TOP = CORRIDOR_FAR_AXIAL * Math.tan(HALF_FOV_V) * 1.35

/** Lateral spread of the corridor, DERIVED.
 *
 *  Inner bound: the nearest a prop's edge may come to the flight axis without
 *  ever crossing the avatar -- the clearance angle, swept out to the distance
 *  props appear at, plus the prop's own half-width.
 *
 *  Outer bound: the furthest a prop may sit and still be wholly inside the
 *  frame when it appears. Past this it enters already clipped, which is the
 *  reported fault.
 *
 *  The window between them is about fourteen units. That is genuinely all the
 *  room there is: the two requirements press from opposite sides, and it is
 *  CORRIDOR_FAR_AXIAL that sets how much daylight is between them -- pulling
 *  the spawn closer narrows it to nothing. */
/** The angular half-width of the subject, seen from the camera.
 *
 *  The sky's Dragonite is the flying cutout: 0.668 units wide in its own file,
 *  drawn at scale 2.5, standing CAMERA_BEHIND away. That is 7.5 degrees. */
export const SUBJECT_HALF_ANGLE = Math.atan((0.668 * 2.5) / 2 / CAMERA_BEHIND)

/** A CLOUD MUST NOT START BEHIND THE SUBJECT.
 *
 *  Its inner edge has to clear the Dragonite's silhouette at the distance it
 *  appears -- and because a prop's angular offset only grows as it approaches,
 *  clearing there clears everywhere.
 *
 *  This is what fixes the cloud size. The three requirements -- big clouds,
 *  close to the subject, not starting behind it -- cannot all hold at once, and
 *  at CLOUD_SCALE 0.4 they were not merely tight but arithmetically impossible:
 *  a cloud 92.8 units across needs its centre 62.3 units off the axis to clear
 *  him, and the frame is only 55 units wide out there, so no placement exists.
 *  A cloud whose half-width is under about 19 units is what makes the
 *  composition possible at all. */
/** The widest a prop's centre may sit and still arrive inside the frame. */
const MAX_SIDE_IN_FRAME = CORRIDOR_FAR_AXIAL * Math.tan(HALF_FOV_H) - PROP_HALF_W
/** ...and the narrowest it may sit and still clear the subject.
 *
 *  THE PROP'S CENTRE, NOT ITS NEAR EDGE, and the difference is the whole
 *  composition. Requiring the near EDGE to clear the silhouette added
 *  PROP_HALF_W -- fifteen units -- to a clearance that only needed twenty-two,
 *  putting every cloud 37.6 units off the axis. Because that is a CONSTANT
 *  world offset while the frame narrows as a prop approaches, the band was
 *  outside the picture for almost all of a prop's life: sampled live, the four
 *  props sat at ndc x 3.06, -1.07, -1.25 and 2.66, which is to say the sky had
 *  no clouds in it at all. A cloud was only ever wholly in frame between about
 *  130 and 75 units, and it spent the fade coming in and then left sideways.
 *
 *  Letting the near edge overlap at long range costs nothing: out there the
 *  cloud is BEHIND the subject and occluded by him, which is depth rather than
 *  a collision, and the note was about clouds crossing his path -- which is a
 *  near-field event, and his angular size only shrinks relative to the prop's
 *  offset as the prop comes in. At 22.4 the centre grazes his silhouette edge
 *  at the farthest point of the corridor and is clear of it everywhere nearer. */
const MIN_SIDE_CLEAR = CORRIDOR_FAR_AXIAL * Math.tan(SUBJECT_HALF_ANGLE)

/** THE TWO BOUNDS CAN CONFLICT, AND AT THE CURRENT CLOUD SIZE THEY DO.
 *
 *  "Not behind the subject" pushes a cloud out; "wholly in frame on arrival"
 *  pulls it in; and both move with the cloud's own half-width, so past a
 *  certain size the window between them closes and then inverts. At
 *  CLOUD_SCALE 0.3 a cloud is 68 units across: it needs its centre 50 units off
 *  the axis to clear the Dragonite, and the frame is only 55 units wide out
 *  there, so anything that clears him is already half off the edge.
 *
 *  The size that makes both possible is a half-width under about 19 units,
 *  i.e. CLOUD_SCALE at or below roughly 0.165. Above that this falls back to
 *  the best available compromise -- as far off the axis as the frame allows --
 *  rather than inverting the band and placing props by accident. */
export const CORRIDOR_BOUNDS_CONFLICT = MIN_SIDE_CLEAR >= MAX_SIDE_IN_FRAME
export const CORRIDOR_CLEAR_RADIUS = CORRIDOR_BOUNDS_CONFLICT
  ? MAX_SIDE_IN_FRAME * 0.6
  : MIN_SIDE_CLEAR
export const CORRIDOR_HALF_WIDTH = CORRIDOR_BOUNDS_CONFLICT
  ? MAX_SIDE_IN_FRAME
  : Math.min(CORRIDOR_CLEAR_RADIUS * CORRIDOR_WIDTH_RATIO, MAX_SIDE_IN_FRAME)

/** Vertical spread, DERIVED: high enough to read as a field rather than a line,
 *  low enough that a prop is still wholly between the top and bottom edges at
 *  FULL_FRAME_AXIAL. This is the "so high or low that the total cloud can't be
 *  seen" number, and at the old 15 a swung prop ran off the top edge while it
 *  was still 40 units away. */
/** The thinnest vertical band worth having. A floor, and it is load-bearing.
 *
 *  The derivation below subtracts the prop's half-height from the frame's, and
 *  at the current cloud scale that went NEGATIVE: -13.05, because a prop is 51
 *  units tall and the frame is only 48.7 units tall at FULL_FRAME_AXIAL. It
 *  survived only because scatter multiplies it by a symmetric sign, so a
 *  negative half-extent produced a mirrored band of the same size rather than
 *  an empty one -- the constant was meaningless but the scene looked fine.
 *
 *  The promise "a prop is wholly in frame down to FULL_FRAME_AXIAL" is simply
 *  not satisfiable at this prop size. The floor makes that explicit instead of
 *  letting the arithmetic walk past zero unnoticed. */
export const MIN_CORRIDOR_HALF_HEIGHT = 6
export const CORRIDOR_HALF_HEIGHT = Math.max(
  MIN_CORRIDOR_HALF_HEIGHT,
  FULL_FRAME_AXIAL * Math.tan(HALF_FOV_V) - PROP_HALF_H,
)

/** For the stars, whose model is about 2.4 units wide natively. Smaller than
 *  the clouds, so the envelope above bounds them too. */
/** And the stars, which are a detail ON a cloud rather than a thing of their
 *  own: about 27% of a cloud's width, matching the reference. */
export const STAR_SCALE: readonly [number, number] = [3.2, 4.2]

// --- the strings -----------------------------------------------------------

/** How far above its prop each string's anchor sits, in world units. */
/** Retained only so the pendulum has a length to swing at; the string's
 *  VISIBLE length now runs from STRING_TOP, not from here. */
export const ROPE_LENGTH: readonly [number, number] = [8, 15]

/** How far a prop falls when it is dropped in, in world units. Its anchor
 *  descends by this much as the prop comes into view. */
export const DROP_HEIGHT = 22

/** How long a drop takes, in SECONDS.
 *
 *  Time, not distance -- and that is a reversal of the previous design, for a
 *  measured reason. Driving the drop off distance-ahead meant `droppedBy` was a
 *  pure function of a prop's authored phase at the moment the world appeared,
 *  so ten of fourteen props were ALREADY FULLY LANDED on the first frame the
 *  journey existed. The marionette drop was happening, correctly, to nobody:
 *  the camera was still climbing, and by the time it arrived the show was over.
 *
 *  On a clock, seeded when the camera actually arrives, the drop happens in
 *  front of the viewer. */
export const DROP_SECONDS = 0.7

/** How much later each successive prop is released, in seconds. Enough that
 *  the arrival reads as a sequence rather than a single clatter; short enough
 *  that the whole field is down before the first caption. */
export const DROP_STAGGER = 0.05



// --- the captions ----------------------------------------------------------

/* GONE, along with the paper signs they described.
 *
 * CAPTION_DEPTH, CAPTION_SLOTS, CAPTION_EASE and the card's own dimensions all
 * existed to place a physical card in the scene: how far in front to hold it,
 * which side to hang it, how wide the stock had to be for the longest line.
 * The text is DOM now, set opposite the subject with the camera leaning away
 * to make room, so none of that is a geometry problem any more -- see
 * SKY_TEXT_CUES and skyTextFocus in config/skyJourney.ts, and SkyCaption.
 *
 * Deleted rather than left in place: an exported constant nothing reads is a
 * claim about the scene that no longer has to be true, and the last three
 * rounds of this file have been spent on constants that had quietly stopped
 * meaning what they said. */

/** How long the world takes to arrive and to leave, in seconds. The backdrop
 *  crossfades over this, and so do the props -- which is what stops the
 *  hand-over from being the cut it used to be. */
/** The altitudes between which the paper world crossfades in.
 *
 *  THE PAPER SKY ARRIVES WITH THE CLIMB, NOT AT THE TOP OF IT.
 *
 *  It used to be switched on by the journey flag, which flips when the camera
 *  stops -- so the entire backdrop changed on the single most expensive frame
 *  of the sequence, and that is the jump reported at the top. Measured off the
 *  recording: the backdrop's stripe contrast sat at 0.034 through t=14.2 and
 *  was 0.233 at t=14.3, a seven-fold step in one 100ms sample, before ramping
 *  smoothly to 0.8 over the next two seconds. A 1.6-second fade would have been
 *  6% along at that point, not 28%.
 *
 *  Keyed to height, the fade happens across the middle of the rise instead:
 *  you ascend INTO the paper sky and it is already there when you arrive, so
 *  nothing has to change at the moment the camera settles. Descending on the
 *  way home runs it backwards for free. */
export const PAPER_FADE_START_Y = AVATAR_BASE_POSITION[1] + SKY_RISE * 0.15
/** The altitude at which the sky is DRESSED: the backdrop has finished fading
 *  in, so the props and the subject drop in against a finished stage rather
 *  than after one. It is the same height the crossfade completes at, which is
 *  the point -- the note was "right when the striped background is fully in
 *  view, the objects should drop in", and waiting for the camera to actually
 *  land left about a second of bare stripes. */
export const SKY_DRESSED_Y = AVATAR_BASE_POSITION[1] + SKY_RISE * 0.78
export const PAPER_FADE_FULL_Y = AVATAR_BASE_POSITION[1] + SKY_RISE * 0.78

/** How much of the sky world is showing, as a function of ALTITUDE.
 *
 *  One function, read by the backdrop crossfade and by the camera's field of
 *  view, so the two cannot narrow and fade at different rates -- and so that
 *  neither of them changes state on the frame the climb ends. */
export function skyAltitudeShare(cameraY: number) {
  const span = PAPER_FADE_FULL_Y - PAPER_FADE_START_Y
  const t = Math.min(1, Math.max(0, (cameraY - PAPER_FADE_START_Y) / span))
  return t * t * (3 - 2 * t)
}

/** The longest frame the crossfade will integrate.
 *
 *  THREE.MathUtils.damp takes `1 - exp(-lambda*dt)` of the remaining distance,
 *  so a single 300ms frame moves it 17% in one step no matter how long the
 *  fade is nominally set to -- and the hand-over frame is exactly where the
 *  long frames are. Clamping trades a fractionally longer fade on a slow
 *  machine for never showing the step. */
export const PAPER_FADE_MAX_DELTA = 1 / 30

/** The crossfade's time constant.
 *
 *  Short, because the TARGET is now smooth on its own -- it is a smoothstep of
 *  altitude across the middle of the climb, not a boolean. The damp used to be
 *  the only thing standing between a switch and a fade, so it had to be slow;
 *  now it only has to take the corner off, and a long constant merely lags the
 *  climb so that some of the fade still arrives after the camera has stopped,
 *  which is the thing being fixed. It still smooths the one genuinely abrupt
 *  case: the sequence flag dropping to zero on the way home. */
export const PAPER_FADE_IN = 0.5
export const PAPER_FADE_OUT = 0.9

// --- the velocity lines ----------------------------------------------------

/** How many streaks. One InstancedMesh, so this is instances, not draw calls. */
export const STREAK_COUNT = 220
/** The cylinder they live in, around the corridor axis. */
/** How far across the frame the streaks are spread, in normalised screen
 *  units, and the hole kept clear in the middle of it.
 *
 *  A RECTANGLE, not a ring. They used to be laid out on a cylinder around the
 *  flight axis -- an angle and a radius -- and a cylinder seen end-on is a
 *  circle: the note was "the velocity lines appear to be a circle". Scattered
 *  across the frame instead, what you see is what speed lines are supposed to
 *  be, a field of streaks converging on the point you are flying at.
 *
 *  The hole is the subject's own berth. Streaks drawn over the Dragonite read
 *  as scratches on him rather than as air going past. */
export const STREAK_SPREAD = 1.15
export const STREAK_CLEAR: readonly [number, number] = [0.22, 0.3]
/** Nearest and furthest a streak is drawn, in units along the view axis. */
export const STREAK_DEPTH: readonly [number, number] = [4, 70]
export const STREAK_SPAN = 150
/** Scroll speed (offset units per second) at which the streaks reach full
 *  length and opacity. Below a tenth of this they are not drawn at all. */
export const STREAK_FULL_SPEED = 90
/** World units, at full speed. */
export const STREAK_MAX_LENGTH = 16
