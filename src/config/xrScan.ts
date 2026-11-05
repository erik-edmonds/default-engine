/** Every tuned number for the scan viewer in a headset, in one table.
 *
 *  Here rather than beside their use for the reason config/journey.ts and
 *  config/paperSky.ts exist: these are the values someone will want to change
 *  after five minutes wearing a headset, and hunting them across six
 *  components with a headset on is not a thing anyone should have to do.
 */

/** Longest edge of the tabletop model, in metres.
 *
 *  EXPRESSED AS A FOOTPRINT, NOT A RATIO, and that is deliberate. "1:200"
 *  sounds reasonable until you work it out: the sample site is 1419 m along
 *  its longest axis, so 1:200 is a **7.1 metre** model — bigger than the room
 *  it is supposed to sit in. A target footprint survives the next scan being
 *  a different size; a ratio does not.
 *
 *  2.0 m gives a 2.00 x 1.47 m model with 9 cm of relief — a table you lean
 *  over and can walk around inside a 3 m guardian. For this file that works
 *  out at about 1:710. */
export const TABLE_LONGEST_M = 2.0

/** Where the tabletop model sits, in metres, relative to the play-space
 *  origin. 0.90 m is table height; 1.2 m forward puts the near edge about an
 *  arm's length away, so the far edge is reachable by leaning rather than
 *  walking. */
export const TABLE_ORIGIN: [number, number, number] = [0, 0.9, -1.2]

/** Points on screen at once, in a session.
 *
 *  ONE NUMBER FOR BOTH SCALES -- the GPU counts points, and does not know
 *  what "tabletop" means.
 *
 *  750,000 is ARITHMETIC, NOT MEASUREMENT, and replacing it is the entire
 *  point of this phase. The arithmetic: at 1M points, 24 bytes per point
 *  across two eyes at 72Hz is 3.46 GB/s of attribute bandwidth, against a
 *  framebuffer colour write of roughly 2.6 GB/s. So at 1M the cloud costs
 *  about what the framebuffer costs, which puts the knee somewhere near 2M.
 *  Start under it and walk up.
 *
 *  There is no published WebXR point-cloud benchmark for standalone headsets.
 *  Anyone who tells you a number for this has measured it or made it up. */
export const XR_POINT_BUDGET = 750_000

/** Steps the in-headset control walks through. Geometric, because what you
 *  are doing with it is bisecting a threshold. */
export const XR_BUDGET_STEPS = [250_000, 375_000, 500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000]

/** Point size clamp, in device pixels.
 *
 *  The size itself is computed per node from the octree's own spacing, so
 *  these are only the bounds. The floor matters more than it looks:
 *  sub-pixel points shimmer, and in a headset the head never stops moving,
 *  there is no temporal AA, and the two eyes disagree about which points
 *  survive rasterisation. That reads as sparkle with spurious depth and is
 *  the dominant aesthetic failure of VR point clouds. 3 is a starting guess
 *  to be tuned on the device. */
export const XR_POINT_MIN_PX = 3
export const XR_POINT_MAX_PX = 14

/** --- getting about, and handling the model ----------------------------- */

/** Walking speed, metres per second of ROOM.
 *
 *  Of room, not of model, and that is why it is one number for both scales:
 *  the stick moves the play space, and the play space is a room either way.
 *  At 1:1 that is walking the site; at tabletop it is walking around a table.
 *  1.4 m/s is an unhurried human walk, which is the speed that does not make
 *  people ill. */
export const MOVE_SPEED_MS = 1.4

/** Vertical speed on the right stick, metres per second.
 *
 *  Flying is unusual in VR and deliberate here: this is a survey viewer, and
 *  the view an aerial lidar scan is FOR is the one from above. Slower than
 *  walking because height changes are read as much bigger than they are. */
export const FLY_SPEED_MS = 0.9

/** Snap turn, in degrees.
 *
 *  SNAP, NOT SMOOTH. Continuous yaw from a thumbstick is the single most
 *  reliable way to make someone motion sick, because the inner ear reports no
 *  rotation while the eyes report a great deal. A snap gives no optical flow
 *  to disagree with. 30 degrees is small enough to aim with and large enough
 *  to be worth a flick. */
export const SNAP_TURN_DEG = 30

/** Below this a stick is considered centred.
 *
 *  Quest sticks rest at around 0.02-0.05 and drift with wear; without a
 *  deadzone the view creeps while nobody is touching anything, which reads as
 *  the scene being broken rather than as a worn stick. */
export const STICK_DEADZONE = 0.18

/** How far the model may be scaled from whatever the current rig put it at.
 *
 *  A clamp rather than freedom, because the failure it prevents is losing the
 *  model: scale it down far enough and it is a dot you cannot find, up far
 *  enough and you are inside one point. */
export const GRAB_SCALE_MIN = 0.05
export const GRAB_SCALE_MAX = 40

/** --- what is on the arm ------------------------------------------------ */

/** Where the Pip-Boy sits relative to the controller's GRIP space, and how
 *  big it is.
 *
 *  GUESSES, AND LABELLED AS SUCH -- the same treatment the wrist panel's
 *  offsets had, for the same reason: grip space is defined by where the hand
 *  is, not by any fixed relationship to a given controller's shell, so the
 *  only way to find a comfortable forearm placement is to wear it. These are
 *  the first things to change after five minutes in the headset.
 *
 *  The SCALE is derived rather than guessed. The GLB's own bounding box is
 *  1.871 x 2.000 x 1.918 units, and a real Pip-Boy 3000 is about 0.22 m along
 *  its longest axis, so 0.22 / 2.0 = 0.11 is life size for this asset. */
export const PIPBOY_OFFSET: [number, number, number] = [0, 0.03, 0.10]
export const PIPBOY_ROTATION: [number, number, number] = [-0.25, 0, 0]
export const PIPBOY_SCALE = 0.11

/** --- the wrist menu ----------------------------------------------------- */

/** How far the wrist must roll to raise the menu, and how far it must come
 *  back to drop it again.
 *
 *  TWO THRESHOLDS, NOT ONE. A single angle chatters: an arm resting near the
 *  boundary crosses it repeatedly on nothing more than tremor, and the menu
 *  flickers in and out. Opening at 35 degrees and closing at 20 leaves a 15
 *  degree dead band that tremor cannot cross. */
export const WRIST_MENU_ON_DEG = 35
export const WRIST_MENU_OFF_DEG = 20

/** And two dwells, for the same reason at a different timescale -- a threshold
 *  swept through on the way to somewhere else is not a request for a menu.
 *  The OFF dwell is the longer one deliberately: a menu that vanishes while
 *  you are reaching for one of its buttons is a worse failure than one that
 *  lingers a quarter second after you look away. */
export const WRIST_MENU_ON_DWELL_MS = 120
export const WRIST_MENU_OFF_DWELL_MS = 250

/** Which grip-space axes are "along the forearm" and "out of the palm".
 *
 *  THE ONE THING THAT CANNOT BE SETTLED OFF-HARDWARE. WebXR defines grip space
 *  by where the hand is rather than by a fixed relationship to a controller's
 *  shell, and the mapping differs between profiles. The roll is computed from
 *  these two vectors and nothing else, so correcting it on the device is a
 *  change to these two lines rather than to any logic. */
export const WRIST_FOREARM_AXIS: [number, number, number] = [0, 0, 1]
export const WRIST_PALM_AXIS: [number, number, number] = [0, -1, 0]

/** Where the menu stands when it opens, relative to the head: metres forward
 *  along the head's yaw, and metres below eye level.
 *
 *  2.0 m IS A READING DISTANCE, not an arm's length. The first version put a
 *  small panel at 0.62 m and the owner's note was exact -- "it should fill the
 *  screen and be centered, so the user doesn't strain themselves looking at
 *  it." Both halves of that point the same way: a panel close to the face has
 *  to be small to fit, and a small panel close to the face is the single most
 *  tiring thing to read in a headset, because the eyes converge hard and the
 *  text still subtends almost nothing. Further away and much bigger gives the
 *  same screen-filling angle with the eyes nearly parallel -- it reads like
 *  sitting back from a large monitor rather than holding a phone to your nose.
 *
 *  MOVED BACK FROM 1.3 m, AND SCALED BY THE SAME FACTOR. The owner's note was
 *  "let's move it a little further, the user still needs to be able to interact
 *  with it, but other than that this section is fine" -- and those two halves
 *  pull against each other, because pushing a panel back shrinks it. "Fine" is
 *  the apparent size, so the fix is to move it and grow it together by
 *  2.0/1.3 = 1.538, which holds the 108 x 85 degrees that was signed off and
 *  changes only where the panel sits relative to your arms. See MENU_SIZE_M,
 *  which carries the same factor, and the ray's `maxLength` in
 *  XrControllerHands, which has to reach the new distance.
 *
 *  Nearly CENTRED on the eyeline now (0.05 m, not 0.18): a panel meant to fill
 *  the view should not also ask you to look down at it. */
export const MENU_DISTANCE_M = 2.0
export const MENU_DROP_M = 0.05

/** The panel's size in metres, and what one layout pixel inside it is worth.
 *
 *  BOTH NUMBERS CARRY THE SAME FACTOR, ALWAYS. The layout inside is expressed
 *  in uikit pixels, so scaling the panel without scaling the pixel leaves the
 *  content marooned in one corner. Every resize of this panel has been a single
 *  multiplier applied to both lines, and it has to stay that way.
 *
 *  Two such resizes have happened, in opposite directions and for different
 *  reasons, and they are easy to confuse:
 *
 *  1. 2.5x FOR APPARENT SIZE. The first full-size attempt was 1.45 x 0.95 m at
 *     1.3 m and still read as small and hard to read. That was fixed by growing
 *     the panel AT THE SAME DISTANCE, because growing it and pushing it back by
 *     the same factor subtends exactly the same angle and would have been no
 *     change at all. Text went from roughly 1.35 to 3.4 degrees, which was the
 *     part actually being complained about.
 *
 *  2. 1.538x FOR DISTANCE, which is this one and is the exact move ruled out
 *     above -- deliberately, because here no change in apparent size is wanted.
 *     The owner asked for the panel "a little further" while staying
 *     interactable, and said the section was otherwise fine. So distance went
 *     1.3 -> 2.0 m and both numbers below grew by 2.0/1.3, leaving the angle
 *     identical and moving the panel out of arm's space. It is NOT bigger to
 *     look at; it is further away and the same size to look at.
 *
 *  So at 2.0 m, 5.58 x 3.66 m subtends about 108 x 85 degrees, which very
 *  nearly fills a Quest 3's ~110 x 96 degree field of view: full screen in the
 *  literal sense.
 *
 *  One consequence worth knowing rather than discovering: at this angle the
 *  far corners sit near the edge of the optics, so reading them means turning
 *  your head a little. That is the trade a full-screen panel makes, and it is
 *  why the controls are gathered into the left sidebar rather than spread to
 *  the edges. */
export const MENU_SIZE_M: [number, number] = [5.58, 3.66]
export const MENU_PIXEL_SIZE = 0.00692

/** Where `?menu=1` puts the panel on a MONITOR, and why it is not the real
 *  distance.
 *
 *  A headset sees about 110 degrees across; this window sees about 78. A panel
 *  sized to fill the first therefore overflows the second by a wide margin --
 *  correct in the headset, useless for checking a layout. Pushing it back only
 *  changes its apparent size, and apparent size is the one thing a monitor
 *  cannot show faithfully anyway.
 *
 *  5.2 m fits 5.58 m of panel inside a 78-degree view with margin, subtending
 *  about 56 degrees. It tracks MENU_SIZE_M rather than MENU_DISTANCE_M and has
 *  to move whenever the panel is resized -- at the old 3.4 m the panel that
 *  grew to 5.58 m would overflow the window and `?menu=1` would stop being
 *  able to show a layout, which is the only thing it is for. The ratio to hold
 *  is the one that was already working: distance ~= 0.94 x panel width.
 *
 *  Used for nothing else; the panel is head-locked either way, and this is only
 *  the local Z offset from the camera it is parented to. */
export const MENU_PREVIEW_DISTANCE_M = 5.2

/** Readout refresh, in Hz.
 *
 *  4 Hz, NOT PER FRAME, and it outlived the panel it was written for. Whatever
 *  draws the numbers -- troika then, uikit now -- rebuilds text geometry on
 *  the main thread on every content change, which is the same thread the frame
 *  is drawn on. A readout updated every frame adds its own cost to the p95 it
 *  is reporting, which is the one failure mode a measurement instrument may not
 *  have. 4 Hz is also about as fast as a number can be read. */
export const READOUT_HZ = 4

/** --- sampling --------------------------------------------------------- */

/** How long one sample window runs, in ms.
 *
 *  10 s is ~720 frames at 72 Hz, which makes a p95 mean something: at 100
 *  frames the 95th percentile is the fifth-worst frame and moves by
 *  milliseconds run to run. */
export const SAMPLE_WINDOW_MS = 10_000

/** Frames discarded after a budget or scale change, in ms.
 *
 *  A budget step is followed by a burst of fetching, decoding and GPU upload.
 *  Those frames are real but they measure the TRANSITION, and folding them in
 *  makes every setting look worse than it is — worst of all the one you just
 *  stepped to, which is the one you are trying to judge. */
export const SAMPLE_SETTLE_MS = 2_500

/** Target refresh rate to ask the runtime for.
 *
 *  @react-three/xr defaults `frameRate` to 'high', which resolves to the
 *  HIGHEST supported rate -- 90 or 120Hz on a Quest 3, i.e. an 8.3ms budget
 *  instead of 13.9. That is the wrong default for a point cloud: find the
 *  budget at 72 first, then try 90 once there is headroom. */
export const XR_TARGET_HZ = 72
