/** Every number the phone reconstruction is drawn by, in one table.
 *
 *  The same shape as config/xrScan.ts and for the same reason: the interior and
 *  the /detection page both read these, and a constant that lives in two files
 *  is a constant that will disagree with itself.
 *
 *  WHAT THIS IS. A phone video, reconstructed: structure from motion recovers
 *  where the camera was for every frame and a sparse cloud of what it saw, an
 *  open-vocabulary detector runs over the frames, and the thousands of 2D boxes
 *  that come back are fused into distinct 3D instances. The portal shows the
 *  geometry; /detection lets you query it.
 *
 *  SCALE IS NOT METRIC UNLESS SOMETHING MAKES IT SO. Monocular structure from
 *  motion recovers geometry up to an unknown similarity transform -- the shape
 *  is right and the size is arbitrary. `units` on a manifest records which case
 *  a given reconstruction is in, and nothing in the UI prints a measurement
 *  while it says "arbitrary". Emitting centimetres from a scale-free
 *  reconstruction is the quietest way to be confidently wrong.
 */

/** Where `sfm/export.py` writes, relative to `public/`. */
export const SFM_DIR = "/sfm"

/** A reconstruction the site knows about.
 *
 *  A table rather than a directory scan: `public/` is not readable at runtime
 *  on a static export, and a missing capture should be a typed absence rather
 *  than a 404 discovered in a fetch. */
export interface SfmReconstruction {
  id: string
  /** Shown as the heading wherever this reconstruction is presented. */
  label: string
  /** What was filmed, and on what. One line. */
  credit: string
  /** True once `sfm/` has actually produced the files under `public/sfm/<id>/`.
   *
   *  THE HONEST GATE. While this is false the portal draws the phone and
   *  nothing else, and /detection says the capture has not been made rather
   *  than rendering an empty scene that looks like a bug. Flipping it is the
   *  last step of the pipeline, not the first step of the UI. */
  ready: boolean
}

/** The captures, in the order they were made.
 *
 *  `ready: false` is the current and correct state: the pipeline in `sfm/` is
 *  real and runnable, and no video has been shot through it yet. Nothing here
 *  claims a result that does not exist on disk. */
export const RECONSTRUCTIONS: SfmReconstruction[] = [
  {
    id: "desk",
    label: "A desk, walked around once",
    credit: "handheld phone video · global SfM · open-vocabulary detection",
    ready: false,
  },
]

export const reconstructionById = (id: string) =>
  RECONSTRUCTIONS.find((r) => r.id === id) ?? null

/** The one the portal opens. */
export const PORTAL_RECONSTRUCTION = RECONSTRUCTIONS[0]

// ---------------------------------------------------------------------------
// THE PORTAL INTERIOR
// ---------------------------------------------------------------------------

/** How tall the phone is drawn, in world units, after the Box3 auto-fit.
 *
 *  VrInterior uses 1.25 for the headset, which is a wide object. The phone is
 *  2.41 x 4.79 in its own units -- tall and narrow -- so the same height reads
 *  as a sliver. At 1.6 it is about half the 3.2 units of height the camera sees
 *  at the z below, which leaves the lower third of the frame to the DOM
 *  caption and the top edge clear.
 *
 *  Measured at 1.6 with the group at y 0.05: the phone's lower tip landed at
 *  665px of a 900px frame and the caption's heading starts at about 660, so
 *  they touched. 1.45 at y 0.26 clears it. */
export const PHONE_TARGET_HEIGHT = 1.45

/** Where the phone sits in the portal's scene. */
export const PHONE_POSITION: readonly [number, number, number] = [0, 0.26, -3.4]

/** Radians a second on the turntable.
 *
 *  SLOWER THAN THE HEADSET'S 0.35, because unlike the headset this object has
 *  two sides that say different things -- the screen shows the detections, the
 *  back shows the lens the reconstruction comes out of -- and the turn is the
 *  only thing that gets you from one to the other. A full revolution takes
 *  about 25 seconds. */
export const PHONE_SPIN = 0.25

/** How much of PHONE_SPIN survives square-on to the camera.
 *
 *  The turntable is eased rather than constant -- see PhoneInterior. At 0.3 a
 *  face is held for roughly three times as long as an edge, which is enough to
 *  read the screen without the turn ever looking like it has stalled. */
export const PHONE_SPIN_EASE = 0.3

/** Where the turntable starts.
 *
 *  Not zero. Square-on, a phone is a rectangle with no depth cue at all; a
 *  little under a radian shows the chamfer down the long edge, which is the
 *  only thing that says this is a solid object. It is also what a screenshot
 *  or a first glance lands on. */
export const PHONE_SPIN_START = 0.9

/** A fixed lean, so the phone is not a flat rectangle edge-on to the camera.
 *
 *  Applied outside the turntable: tilting inside it would make the phone
 *  wobble as it turned, which reads as a physics bug rather than as a lean. */
export const PHONE_TILT_X = 0.12

/** The shut and open sizes, damped between by the portal's own live ramp.
 *
 *  The globe's pair (0.085 shut, 0.26 open) is the worked example and the
 *  reason this exists at all: content tuned to fill the open view overflows
 *  the small closed window. */
export const PHONE_SCALE_SHUT = 0.42
export const PHONE_SCALE_OPEN = 1

/** The screen's colour while there is no capture to show on it.
 *
 *  Not black: a black screen on a dark phone against a dark background reads
 *  as a hole in the model. A very dark blue with a little emissive lifts it
 *  just enough to read as glass that is switched off. */
export const PHONE_SCREEN_OFF = "#0a1220"
export const PHONE_SCREEN_OFF_EMISSIVE = 0.18
