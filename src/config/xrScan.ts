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

/** --- the wrist panel ------------------------------------------------- */

/** Panel size in metres, width then height.
 *
 *  0.12 x 0.232 m held at arm's length reads like a clipboard, not a HUD. The
 *  height is the sum of its parts -- seventeen rows of numbers, a rule, and
 *  seven lines of bindings -- so a row added to either list needs this moved
 *  with it; WristPanel derives every offset inside from the same constants. The
 *  reason it is on the wrist at all rather than pinned to the view: a panel
 *  welded to the camera is in the way of the thing being measured, and a
 *  point cloud is exactly the kind of scene where a floating rectangle hides
 *  the detail you are leaning in to judge. On the wrist it is there when you
 *  look and gone when you do not. */
export const WRIST_PANEL_SIZE: [number, number] = [0.12, 0.232]

/** Offset from the controller's GRIP space, in metres, and the tilt.
 *
 *  GUESSES, AND LABELLED AS SUCH. Grip space is specified by where the hand
 *  is, not by any fixed relationship to the panel of a given controller, and
 *  the only way to find a comfortable wrist angle is to wear it. These are
 *  the first thing to change after five minutes in the headset, which is why
 *  they are here and not inline. */
export const WRIST_PANEL_OFFSET: [number, number, number] = [0, 0.05, 0.08]
/** Radians about X. Negative tilts the face up toward the eyes. */
export const WRIST_PANEL_TILT = -0.9

/** Hide the panel once its face turns away from the eyes.
 *
 *  The dot product of the panel's normal with the direction to the camera; at
 *  0.25 it fades out roughly 75 degrees off-axis. Without this the panel is a
 *  bright rectangle edge-on in your peripheral vision for the whole session,
 *  and in a point cloud any stray bright quad reads as geometry. */
export const WRIST_PANEL_FACING_MIN = 0.25

/** Panel refresh, in Hz.
 *
 *  4 Hz, NOT PER FRAME. troika rebuilds its text geometry on the main thread
 *  on every content change — the same thread the frame is drawn on. A panel
 *  updated every frame would add its own cost to the p95 it is reporting,
 *  which is the one failure mode a measurement instrument may not have. 4 Hz
 *  is also about as fast as a number can be read. */
export const WRIST_PANEL_HZ = 4

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
