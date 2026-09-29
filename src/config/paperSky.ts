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
 *  prop is recycled once it is behind the reader, where nothing can be seen to
 *  happen to it.
 *
 *  Brought in from -25 so the whole crossing is short enough to FIT inside the
 *  stretch the words are up for -- "the clouds should more or less be around
 *  the same position as the text". It costs nothing: a cloud's inner edge
 *  leaves the side of the frame at about five units out, so it has swept
 *  entirely past long before it reaches the lens either way. */
export const CORRIDOR_NEAR_AXIAL = -4

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
/** Thick enough to SEE at the far end of the corridor.
 *
 *  0.13 is 2.7 pixels across at 130 units on a 1440-wide frame, and a
 *  two-pixel cord carrying a twine texture and an alpha channel is not
 *  visibly anything -- "they're supposed to be attached to rope", against a
 *  scene where every cloud did have one and none of them could be made out.
 *  0.26 reads at about five pixels out there and thickens naturally as the
 *  cloud comes in, which is the cord doing perspective rather than being
 *  drawn at a constant screen width. */
export const ROPE_RADIUS_PROP = 0.26
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
/** How far a prop is lowered as it enters, and over how much of its approach.
 *
 *  "The clouds should drop in from the back like puppets, then on scroll move
 *  forward, not come in from the side." The fade alone made them materialise
 *  in place; before that, an arrival-only drop from STRING_TOP happened above
 *  the top of the frame and could not be seen at all.
 *
 *  MEASURED IN SCREEN HEIGHTS, not in world units, and that is the whole
 *  difference. A fixed seventeen units is over a third of the frame at the far
 *  end of the corridor and a fraction of it near -- so the cloud never
 *  actually started above the picture, it just sagged a little on the way in,
 *  and what the eye read was a cloud arriving from the SIDE as it grew. The
 *  note was "the clouds are still coming in from the side, I was specific
 *  that I want it to come in from the top".
 *
 *  1.45 frame-halves up is clear of the top edge at any distance, so the prop
 *  begins every crossing out of shot above and is lowered down into it. The
 *  descent is spent over the first PROP_DROP_DISTANCE units of the approach
 *  and is driven by the scroll like everything else here: a reader who stops
 *  mid-descent stops the puppet halfway down. */
export const PROP_DROP_NDC = 1.45
export const PROP_DROP_DISTANCE = 58

export const DROP_SECONDS = 0.7

/** How much later each successive prop is released, in seconds. Enough that
 *  the arrival reads as a sequence rather than a single clatter; short enough
 *  that the whole field is down before the first caption. */
export const DROP_STAGGER = 0.05



// --- the captions ----------------------------------------------------------

/** WHERE THE WORDS ARE, as a place in the corridor.
 *
 *  The block travels like a prop: it is seeded far off as its section begins
 *  and closes on the camera as the section is scrolled, so it comes out of the
 *  background rather than switching on at the front. See skyCaptionAnchor.
 *
 *  It runs on its own depths rather than the props', because it is doing a
 *  different job: it starts nearer than a cloud does (the type has to be
 *  legible sooner) and is retired further out (a paragraph that sweeps the
 *  lens is a blur, where a cloud doing it is the point). */
export const CAPTION_FAR_AXIAL = 210
export const CAPTION_NEAR_AXIAL = 2
/** Why the near end is BEHIND THE CAMERA (the camera plane is at CAMERA_BEHIND
 *  = 6.3), and not the 26 it used to be.
 *
 *  At 26 the block still had 19.7 units of approach left when its turn ran
 *  out, and 19.7 is inside the distance at which it leaves the frame: its
 *  inner edge sits CAPTION_SIDE_OFFSET - width/2 = 8.1 off the axis, so it
 *  only clears the frame edge once ahead < 8.1 / tan(HALF_FOV_H) = 14.2.
 *  The block was therefore still on screen, centre-frame-ish and large, at
 *  the moment CAPTION_FADE_OUT took it -- which is precisely the report:
 *  "the text should never fade out, it should go behind the camera. Right
 *  now, when the camera gets close, it just fades away."
 *
 *  Ending at 2 puts the last of the turn behind the camera, so the words run
 *  out through the side of the frame under their own travel and the fade-out
 *  is not needed at all (there is none any more -- see CAPTION_FADE_IN).
/** Where it is read from: at this distance the type is at its design size,
 *  and the scale below and above is the simple ratio. */
export const CAPTION_READ_AXIAL = 62
/** How wide the block is in the world, at the distance it is read from. About
 *  A QUARTER of the frame at reading distance, down from two fifths. Both
 *  numbers came down together, which is what shortens the lines without
 *  changing how big the type is: the measure is the CSS width and the size on
 *  screen is the ratio of the two. "The lines are too long, there should be
 *  some padding on the edges of the screen for text -- it's better to have
 *  more shorter lines than a few really long ones." */
export const CAPTION_WORLD_WIDTH = 19
/** The CSS width the markup is authored at. Only the RATIO of these two
 *  matters -- it is what turns pixels into world units. */
export const CAPTION_CSS_WIDTH = 360
/** The largest it may get. Without a ceiling the last stretch of every
 *  approach is a headline several screens wide. */
export const CAPTION_MAX_SCALE = 1.8
/** How far off the flight axis it sits. Chosen so that at CAPTION_READ_AXIAL
 *  the block's centre lands about halfway out in its half of the frame, which
 *  is where the layout put it when it was pinned there. */
export const CAPTION_SIDE_OFFSET = CAPTION_READ_AXIAL * Math.tan(HALF_FOV_H) * 0.5
/** And how far above it, so a paragraph does not close on the subject's face.
 *  Measured from the VIEW AXIS at its own depth, like the props. */
export const CAPTION_UP_OFFSET = CAPTION_READ_AXIAL * Math.tan(HALF_FOV_V) * 0.18
/** Fades up over the first of these and out over the last, in world units of
 *  approach -- so it arrives out of the haze and is gone before it is close
 *  enough to be unreadable. */
/** How fast the block closes, as a fraction of the corridor's own rate.
 *
 *  Sized so one block covers CAPTION_FAR_AXIAL to CAPTION_NEAR_AXIAL over
 *  exactly one section of the scroll -- 102 units of approach against the
 *  corridor's 162 -- which is what keeps the words and the cloud they share a
 *  section with in step. Slower than the clouds on purpose: a paragraph wants
 *  longer at a readable size than a cloud wants anywhere. */
export const CAPTION_SPEED = 0.54

/** Fades as fractions of the turn rather than as distances.
 *
 *  A LONG, SMOOTH RAMP, because the note was that it "still feels like it's
 *  fading in and fading out, instead of approaching the scene and passing the
 *  camera -- the fade in should be much more gradual and natural, not a
 *  fade-in like it is coming from nowhere, a fade-in like it was too far to
 *  see before but now is closer and is therefore visible."
 *
 *  That is atmospheric perspective, and what sells it is that the ramp lasts
 *  most of the approach rather than being a cue at the start of it. Over
 *  half the turn is spent coming up out of the haze, on a smoothstep so it
 *  has no corners at either end; by the time it is legible it is also
 *  visibly nearer and bigger, which is the whole point. */
export const CAPTION_FADE_IN = 0.55

/* CAPTION_FADE_OUT is GONE, deliberately.
 *
 * A block now leaves the way anything in a scene leaves: it keeps coming
 * until it is past the camera. Nothing is faded on the way out, because a
 * fade out is the thing that was wrong -- the words are part of the scene,
 * and scenery does not dissolve in front of you. See CAPTION_NEAR_AXIAL for
 * the geometry that makes the exit happen on its own.
 *
 * The exit is through the SIDE of the frame, which is only true because
 * CAPTION_SIDE_OFFSET / (CAPTION_WORLD_WIDTH / 2) = 1.85 > 1. Below 1 the
 * block's inner edge would cross the flight axis on the way past and it
 * would swallow the camera instead of sweeping by it. */

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

/* THE CORRIDOR CLOUD IS PINNED TO A PLACE ON THE SCREEN.
 *
 * "The clouds should drop down from the top of the screen, they should NOT
 * enter the scene from the left or right. I don't know how many times I have
 * been clear about it." -- and the previous rounds kept answering the wrong
 * half of it. A drop WAS added, and measured, and it worked: the prop began
 * 78 units above its resting height and settled onto it. It was simply never
 * seen, for two reasons that compounded.
 *
 * The first is that it happened in the dark. The drop ran from
 * CORRIDOR_FAR_AXIAL 135 down to 77 while the fade ran from 135 to 70, so the
 * cloud finished descending at almost exactly the moment it became visible.
 * Everything the reader could actually see was what came after.
 *
 * The second is that what came after was lateral, and large. A prop was
 * placed at a fixed WORLD offset from the flight axis, so its angular offset
 * grew as it approached and it swept out through the side of the frame --
 * and on top of that the lane-clearing push (gone now, see below) was holding
 * it past the frame edge for most of every section. The visible life of a
 * cloud was therefore: appear at the edge, already cut off, and slide further
 * out. Which is entering from the side, whatever the vertical arithmetic says.
 *
 * So the lateral is removed outright rather than tuned again. A cloud now
 * holds a FIXED FRACTION OF THE FRAME, PROP_SIDE_NDC, at whatever distance it
 * is -- the offset is recomputed from its own depth every frame, which is
 * what "fixed on screen" means in a corridor. It cannot enter from the side
 * because it never moves sideways at all. It arrives from above the top edge,
 * holds beside the subject while its block of text is up, and is drawn back
 * up out of the top when the block is done: a puppet lowered in and lifted
 * out, which is the metaphor the rest of this scene is built on.
 */

/** How far off the flight axis a cloud hangs, IN WORLD UNITS.
 *
 *  BACK TO A WORLD OFFSET, and the reason is worth being exact about,
 *  because the previous round pinned it to a fraction of the frame instead
 *  and that was an over-correction.
 *
 *  Pinning it to the frame did fix the complaint -- a cloud that holds a
 *  fixed place on screen cannot come in from the side, because it does not
 *  move sideways at all. But it also cannot come TOWARD you: a thing at a
 *  fixed screen position only grows, and it grows slowly, because the only
 *  distance left in the shot was 132 down to 92. "They're supposed to move
 *  towards the camera with the words after they come out of the sky."
 *
 *  The two are not actually in conflict; the original fault was never the
 *  lateral travel itself. It was that a cloud ARRIVED at the frame's edge,
 *  already cut off, and slid further out -- the drop happened while it was
 *  still transparent and the lane-push held it past the edge for the rest.
 *  Fix the arrival and the fly-past is fine, and is what perspective does.
 *
 *  So: 20 units off the axis. It is lowered in at ndc 0.29 .. 0.79, grows
 *  1.84 times as it comes, and is still WHOLLY INSIDE THE FRAME at the
 *  moment the words beside it are at their readable distance -- 0.32 .. 0.97
 *  with the camera at the height of its lean. That last part is the
 *  constraint that sets every other number here, and it is a tight one: a
 *  cloud is thirty units across, so by sixty units out it is most of a
 *  half-frame wide and there is no offset that is both clear of the subject
 *  and inside the picture. Letting it run closer than that is what produced
 *  "the clouds aren't even fully in frame" -- measured at a centre of ndc
 *  1.007, half of it off the edge, at exactly the moment it was meant to be
 *  read alongside the text.
 *
 *  So it approaches, and then it is lifted out rather than flown past. See
 *  PROP_LIFT_FROM. */
export const PROP_SIDE_WORLD = 20

/** How much further out the cloud goes on the CONTACT card, and why it is
 *  forced into the lower half there.
 *
 *  Every other block is set in one half of the frame with the cloud in the
 *  other, and the camera's lean pushes the two further apart still. The
 *  contact card is centred on the axis and gets no lean (see `centred` in
 *  skyTextFocus), so both of those separations vanish at once -- and the
 *  cloud, sitting at its usual 20 units, landed across the middle of the
 *  words. Measured at the parked offset: cloud spanning ndc 0.11 .. 0.76
 *  against type occupying -0.30 .. 0.30.
 *
 *  1.5 times out puts it at 0.32 .. 0.97 -- clear of the type and still
 *  wholly inside the frame -- and forcing it below the axis clears the last
 *  of the overlap vertically. */
export const PROP_CENTRED_SIDE_SCALE = 1.5

/** Vertical scatter, also in world units so it opens out with the approach
 *  the way the lateral does. Measured against the frame it runs 0.22 of a
 *  frame-half at the far end and 0.44 by the time the cloud is leaving. */
export const PROP_RISE_WORLD = 10

/** The approach. The near end is past the point where the cloud has left the
 *  frame sideways (about 70), so nothing is ever retired in shot -- it is
 *  simply off the edge by the time its section hands over. */
export const PROP_FAR_AXIAL = 132
export const PROP_NEAR_AXIAL = 62

/** How much of a block's section is spent coming down out of the sky, and
 *  where it starts being drawn back up.
 *
 *  IT LEAVES THE WAY IT ARRIVED, and that is a consequence of the frame
 *  rather than a preference. A cloud cannot fly past the camera and stay
 *  wholly in shot -- see PROP_SIDE_WORLD -- so it comes down out of the sky,
 *  travels toward you for most of the section growing as it comes, and is
 *  hauled back up through the top before it is close enough to be cut off by
 *  the edge. Both ends of its life are off the top of the picture, which is
 *  also what makes the hand-over between sections invisible: there is
 *  nothing on screen at the moment it is put back to the far end. */
export const PROP_DROP_UNTIL = 0.26
export const PROP_LIFT_FROM = 0.82

// --- the small clouds at the edges -----------------------------------------

/** A second, much smaller band of clouds out past the corridor proper --
 *  "add small clouds on the outsides".
 *
 *  These are scenery, not furniture. The corridor carries ONE cloud per block
 *  of text, deliberately, after several rounds of "there shouldn't be so many
 *  clouds"; that cloud is staged against the words, hangs from a rope, drops
 *  in on arrival and keeps out of the reader's half of the frame. None of
 *  that applies here. These have no ropes and no relationship to the text.
 *  They run continuously on their own modulo so the periphery is never empty,
 *  and their whole job is to give the middle of the frame something to be
 *  measured against.
 *
 *  THE LATERAL BAND IS WHAT MAKES THEM "OUTSIDE", and it is chosen against the
 *  two things already out there rather than by eye:
 *
 *      the subject          cleared by       17.9  (MIN_SIDE_CLEAR)
 *      the corridor's own clouds, out to     ~26.9 (CORRIDOR_HALF_WIDTH)
 *      a block of text, centre 17.6, out to   27.1 (CAPTION_SIDE_OFFSET + half)
 *      these                                  42 .. 78
 *
 *  So they cannot collide with the words and cannot be confused with the
 *  cloud that belongs to them.
 *
 *  A CONSTANT WORLD OFFSET, not a constant screen position. Placing them at a
 *  fixed fraction of the frame width would pin them to the edge forever --
 *  the frame widens with distance at exactly the rate the offset would, so
 *  they would grow in place and never pass anything. Held at a fixed distance
 *  from the axis instead, they open outward as they approach and leave
 *  through the side, which is the only way they read as being flown past. */
export const EDGE_CLOUD_COUNT = 7
export const EDGE_CLOUD_SIDE: readonly [number, number] = [42, 78]
/** Small. The corridor's clouds run CLOUD_SCALE 0.1 .. 0.13; at a third of
 *  that these are 9 to 16 units across against the corridor's 30, which is
 *  about seven per cent of the frame's width at the distance they are read
 *  at -- present, and clearly further away than the cloud that matters. */
export const EDGE_CLOUD_SCALE: readonly [number, number] = [0.04, 0.07]
/** Deeper than the corridor at both ends: the far end so the widest of them
 *  still get a stretch on screen before their offset carries them out (at 78
 *  units off the axis a cloud has already left the frame by 133), the near
 *  end because they exit sideways long before they reach it. */
export const EDGE_CLOUD_DEPTH: readonly [number, number] = [20, 260]
/** Vertical spread, as a fraction of the frame's half-height at the cloud's
 *  own distance -- so the band tracks the frame instead of pinching shut at
 *  the far end the way a fixed world height would. */
export const EDGE_CLOUD_RISE = 0.78
/** Distance over which one comes up out of the haze. The same idea as
 *  PROP_FADE_IN_AXIAL and, like it, a function of distance alone -- never of
 *  a clock or of the recycle, or a cloud would be seen to pop. */
export const EDGE_CLOUD_FADE_AXIAL = 170
/** Held under the corridor's clouds so they sit back in the picture. */
export const EDGE_CLOUD_OPACITY = 0.72

// --- the film ---------------------------------------------------------------

/** How strong the grain is over the paper world, at full altitude.
 *
 *  "Add noise to the sky scene to make it look like an old time grainy
 *  texture of homemade films."
 *
 *  Overlay blend, so it darkens and lightens around the mid-tone rather than
 *  washing the whole picture toward grey the way a plain additive noise does.
 *  The paper sky is a narrow band of light blues and an additive veil over it
 *  reads as fog, not as film.
 *
 *  0.22 WAS TOO LOW, and the reasoning behind it was wrong in a way worth
 *  keeping: "visible in motion and nearly invisible in a still frame" is how
 *  film stock behaves at 24fps on a cinema screen, and it is not what this
 *  is for. The note asked for "an old time grainy texture of homemade
 *  films" -- 8mm, pushed stock, grain you can see standing still. Measured
 *  at 0.22 the effect was confirmed wired and driving the uniform, and still
 *  read as nothing against a paper texture that already has tooth.
 *
 *  It was also being halved twice over: `premultiply` scaled the grain by
 *  the colour beneath it, and the paper sky is a narrow band of mid blues,
 *  so the effect was attenuated by the very surface it was meant to sit on.
 *  That is off now (see the <Noise> in app/page.tsx), and this carries the
 *  rest of the distance.
 *
 *  Settled at 0.45 after looking at 0.6 on the contact card: 0.6 reads
 *  correctly as pushed 8mm stock but starts eating the type, and that card
 *  is the one screen here anybody has to actually read and click. */
export const SKY_GRAIN_OPACITY = 0.45

// --- the velocity lines ----------------------------------------------------

/** How many streaks. One InstancedMesh, so this is instances, not draw calls.
 *
 *  Raised from 70 with STREAK_SPREAD, and only to hold the density where it
 *  was: the field got 1.35 times the area, so it gets 1.35 times the streaks.
 *  Per unit of sky this is the same thinness that answered "the velocity lines
 *  are too prominent, it should be less dense and bright". */
export const STREAK_COUNT = 95
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
 *  as scratches on him rather than as air going past. Now that the field is
 *  built in the flight frame, the hole sits on the flight axis and so tracks
 *  him exactly, instead of staying put in the middle of the frame while the
 *  lean slid him out of it.
 *
 *  WIDER THAN THE FRAME, because the field no longer turns with the camera.
 *  The lean puts the look target SKY_LOOK_TILT = 0.55 to the side over
 *  CAMERA_BEHIND = 6.3, which is 6.8 degrees of yaw against a 29.5-degree
 *  half-angle, so the frustum's far edge reaches tan(36.3)/tan(29.5) = 1.29
 *  of the square-on frame. At the old 1.25 the outside edge of a hard lean
 *  would have run off the end of the field and shown bare sky. */
export const STREAK_SPREAD = 1.45
export const STREAK_CLEAR: readonly [number, number] = [0.22, 0.3]
/** How strongly the streaks are drawn at full speed.
 *
 *  Very low, and it is meant to be. At 0.5 over 220 of them the field read as
 *  weather -- the note was "the velocity lines are too prominent, it should be
 *  less dense and bright", and in the reference there is barely a streak to be
 *  seen at all: what sells the speed there is a single faint contrail off the
 *  aircraft. A third of the count at a quarter of the strength is a hint of
 *  movement in the air rather than a snowstorm. */
export const STREAK_OPACITY = 0.13

/** Nearest and furthest a streak is drawn, in units along the view axis. */
export const STREAK_DEPTH: readonly [number, number] = [4, 70]
export const STREAK_SPAN = 150
/** Scroll speed (offset units per second) at which the streaks reach full
 *  length and opacity. Below a tenth of this they are not drawn at all. */
export const STREAK_FULL_SPEED = 90
/** World units, at full speed. */
export const STREAK_MAX_LENGTH = 13
