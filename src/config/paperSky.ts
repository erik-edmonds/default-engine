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
export const SKY_FOV_SHRINK = 0.8 * 0.8
export const SKY_FOV_Y = ISLAND_FOV_Y * SKY_FOV_SHRINK
/** The aspect the corridor is designed against -- a desktop 16:10. The
 *  horizontal field of view depends on it, and every lateral number here is
 *  derived from that. */
export const DESIGN_ASPECT = 1.6

const DEG = Math.PI / 180

/** The pendulum. Declared HERE, above the corridor, because the corridor's
 *  extents are derived from how far a prop can swing -- and a const used above
 *  its own declaration in the same module is a TDZ ReferenceError at import
 *  time, not a compile error.
 *
 *  STIFFNESS is gravity over rope length -- a longer string swings slower, as
 *  it should. DAMPING brings it to rest in about three swings, which reads as
 *  paper rather than as a pendulum in a vacuum. */
export const SWING_STIFFNESS = 13
export const SWING_DAMPING = 2
/** How hard lateral motion of the anchor throws the prop. */
export const SWING_DRIVE = 0.55
/** Radians. A cutout that swings past this reads as tumbling, not hanging.
 *
 *  Halved, to 16 degrees. At 31 a cloud 24 units across threw 6 units of its
 *  own width up into its height, which is width the frame has to find room for
 *  -- and it is why props measured 17 units tall against a 13-unit model. Less
 *  swing is also simply calmer, which is what a few large masses want. */
export const SWING_MAX = 0.28
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
export const CORRIDOR_FAR_AXIAL = 240
export const CORRIDOR_NEAR_AXIAL = 10

/** How far down the approach a prop must still be WHOLLY inside the frame.
 *
 *  This is "the total cloud can be seen when it enters". Full visibility can
 *  only be a promise down to some distance -- a prop that flies past the camera
 *  must leave the frame eventually, and leaving sideways is the whole point --
 *  so the promise is: from first appearance until it is this close, no part of
 *  a prop is off any edge. After that it exits through the SIDE, which is
 *  motion, not clipping. */
export const FULL_FRAME_AXIAL = 85

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
export const CORRIDOR_WIDTH_RATIO = 2.5

/** The cloud model's native size, in its own file's units. The scales below are
 *  hundredths because of the first number. */
const CLOUD_NATIVE_WIDTH = 232
const CLOUD_NATIVE_HEIGHT = 128

/** Scale range for the clouds. Bigger and narrower than before -- the brief is
 *  a few large masses, so the small end is raised rather than the large end
 *  pushed further. */
export const CLOUD_SCALE: readonly [number, number] = [0.3, 0.4]

/** The largest half-extent any prop presents, INCLUDING its swing.
 *
 *  A hanging cutout is tilted by up to SWING_MAX, which rotates width into
 *  height and back -- so the envelope that has to fit inside the frame is the
 *  rotated one, not the model's own box. Ignoring this is why props measured
 *  17 units tall when the model is 13. */
const PROP_HALF_W = (CLOUD_NATIVE_WIDTH * CLOUD_SCALE[1]) / 2
const PROP_HALF_H = (CLOUD_NATIVE_HEIGHT * CLOUD_SCALE[1]) / 2
export const PROP_HALF_W_SWUNG = PROP_HALF_W * Math.cos(SWING_MAX) + PROP_HALF_H * Math.sin(SWING_MAX)
export const PROP_HALF_H_SWUNG = PROP_HALF_W * Math.sin(SWING_MAX) + PROP_HALF_H * Math.cos(SWING_MAX)

/** Where a prop first appears and is retired, expressed the way the corridor
 *  arithmetic wants it: distance ahead of the AVATAR, which sits CAMERA_BEHIND
 *  in front of the camera. */
export const CORRIDOR_DEPTH = CORRIDOR_FAR_AXIAL - CAMERA_BEHIND
/** Negative now, and deliberately: the corridor's near end is in FRONT of the
 *  camera, not behind it. Nothing is allowed to reach the lens. */
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
export const CORRIDOR_TRAVEL_PER_OFFSET = 0.27

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
export const CORRIDOR_POOL = 4

/** Half the pool is placed to the left of the flight axis and half to the
 *  right, by index parity.
 *
 *  A guarantee, not a tuning. The old scatter drew from a sin-hash which is
 *  unbiased in aggregate (1423 left / 1377 right over 2800 samples) but
 *  DETERMINISTIC, so the same draw happened on every visit -- and the draw that
 *  happens to be on screen when you arrive is 6 left / 2 right. Stratifying by
 *  side makes every wave exactly balanced, so there is no sample to get
 *  unlucky with. */
export const STRATIFY_SIDES = true

/** How many of the pool are stars rather than clouds.
 *
 *  Deliberately low, and the reason is measured: cardboard_star.glb is 330,894
 *  triangles and 196,860 vertices, against 1,228 for the cloud. The model is
 *  used as supplied, so the only lever left is how many are on screen at once,
 *  and at 2 of 14 the stars still cost more than every cloud put together. */
export const STAR_COUNT = 1

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
export const CORRIDOR_CLEAR_RADIUS =
  PROP_HALF_W_SWUNG + AVATAR_SAFE_AXIAL * Math.tan(AVATAR_CLEAR_ANGLE)
export const CORRIDOR_HALF_WIDTH = CORRIDOR_CLEAR_RADIUS * CORRIDOR_WIDTH_RATIO

/** Vertical spread, DERIVED: high enough to read as a field rather than a line,
 *  low enough that a prop is still wholly between the top and bottom edges at
 *  FULL_FRAME_AXIAL. This is the "so high or low that the total cloud can't be
 *  seen" number, and at the old 15 a swung prop ran off the top edge while it
 *  was still 40 units away. */
export const CORRIDOR_HALF_HEIGHT = FULL_FRAME_AXIAL * Math.tan(HALF_FOV_V) - PROP_HALF_H_SWUNG

/** For the stars, whose model is about 2.4 units wide natively. Smaller than
 *  the clouds, so the envelope above bounds them too. */
export const STAR_SCALE: readonly [number, number] = [15, 20]

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
export const DROP_SECONDS = 1.25

/** How much later each successive prop is released, in seconds. Enough that
 *  the arrival reads as a sequence rather than a single clatter; short enough
 *  that the whole field is down before the first caption. */
export const DROP_STAGGER = 0.11

/** World units. A lateral anchor move larger than this in ONE frame is a
 *  teleport -- a prop being recycled onto the other side of the corridor, or a
 *  caption appearing -- not flight, and it must not drive the pendulum. At the
 *  corridor's half width a recycle can move an anchor ~20 units; real lateral
 *  drift is a fraction of a unit per frame. */
export const MAX_ANCHOR_STEP = 2

/** Captions swing far less than the props do.
 *
 *  At the props' 0.55 radians a caption card tilts 31 degrees, and text at 31
 *  degrees reads as a mistake rather than as motion -- it is the one thing in
 *  this world the viewer has to actually parse. A few degrees keeps it alive
 *  without making it work to read.
 *
 *  This constant existed for three rounds without being imported: the caption
 *  clamped against SWING_MAX, so every value set here -- including a zero set
 *  as a diagnostic -- changed nothing, and the card kept tilting 31 degrees. */
export const CAPTION_SWING_MAX = 0.06

// --- the captions ----------------------------------------------------------

export const CAPTION_CHAR_WIDTH = 0.24
export const CAPTION_HALF_HEIGHT = 0.5
export const CAPTION_FONT_SIZE = 0.38
/** Card stock, in world units. */
export const CAPTION_THICKNESS = 0.03

/** How far from the corridor axis a caption hangs, and on which side.
 *
 *  Laid out AROUND the avatar, and the distance is arithmetic rather than
 *  taste. At CAPTION_DEPTH the card sits 18.7 units from the camera, where its
 *  own half-width subtends 0.22 in normalised screen space; the avatar occupies
 *  about +/-0.27. So the card's INNER edge has to clear 0.30, which needs its
 *  centre beyond 0.52 -- about 7.3 units off the axis. At the previous 3.9 the
 *  card spanned 0.06 to 0.50 and its text ran straight across the character,
 *  which is what the screenshots kept showing.
 *
 *  7.5 leaves the outer edge at 0.76, comfortably inside the frame. */
export const CAPTION_SLOTS: { x: number; y: number }[] = [
  { x: -7.5, y: 1.8 },
  { x: 7.5, y: 0.9 },
  { x: -7.5, y: -1.4 },
  { x: 7.5, y: -2.4 },
]

/** How far in front of the viewer a caption hangs. FIXED -- a caption does not
 *  fly past.
 *
 *  The props stream toward you and that is the point of them; text cannot do
 *  the same and stay readable. Flying captions down the corridor put the
 *  longest one directly across the avatar at reading size, because a card that
 *  travels from far to near necessarily passes through the middle of the
 *  frame. So a caption holds station at this depth for as long as its cue is
 *  current, and is lowered in and lifted out on its string at the ends. */
export const CAPTION_DEPTH = 13

/** How many scroll units a caption takes to drop in, and to lift back out.
 *
 *  A caption is no longer shown in a window either side of its cue. It is
 *  CURRENT from its own threshold until the next cue's, so there is always one
 *  card up and never two: card i finishes lifting out exactly as card i+1
 *  starts dropping in. The spans come from SKY_TEXT_CUES itself rather than
 *  from a width constant, so the timing and the text cannot drift apart -- the
 *  same reason the cue table already feeds the DOM live region.
 *
 *  At the old +/-62 each card was up for 124 of the 600 units and dark for the
 *  other 26 between cues, which is the "barely on the screen long enough". */
export const CAPTION_EASE = 18

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
export const STREAK_RADIUS: readonly [number, number] = [7, 34]
export const STREAK_SPAN = 150
/** Scroll speed (offset units per second) at which the streaks reach full
 *  length and opacity. Below a tenth of this they are not drawn at all. */
export const STREAK_FULL_SPEED = 90
/** World units, at full speed. */
export const STREAK_MAX_LENGTH = 16
