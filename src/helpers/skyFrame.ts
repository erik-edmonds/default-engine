/** The frame the camera is ACTUALLY looking through, republished every frame.
 *
 *  Module state rather than an atom, for the reason helpers/skyScroll.ts and
 *  helpers/skyCaptionBox.ts already give for the same decision: this changes
 *  whenever the window does and is read inside frame callbacks, and a React
 *  render per change would be absurd.
 *
 *  WHY THIS EXISTS AT ALL.
 *
 *  The paper sky had exactly one statement of horizontal framing, and it was
 *  a constant:
 *
 *      export const DESIGN_ASPECT = 1.6
 *      export const HALF_FOV_H = atan(tan(HALF_FOV_V) * DESIGN_ASPECT)
 *
 *  The vertical half is honest -- three's PerspectiveCamera.fov IS vertical,
 *  and CameraController writes SKY_FOV_Y straight into it, so every vertical
 *  derivation in the scene is correct at any window size. The horizontal half
 *  was frozen at 16:10, and every lateral offset in the sky was either derived
 *  from it or written as a world distance chosen by eye against it.
 *
 *  On a 404x986 phone the live aspect is 0.41, so the real tan(halfH) is
 *  0.145 against the design's 0.567 -- the frame is 3.9 times narrower than
 *  everything in it was placed for. Measured there: the block of text sat at
 *  ndc +/-1.95, the corridor cloud's centre ran from 1.04 out to 2.30, and all
 *  seven edge clouds were outside the frustum for the entire journey. The
 *  Dragonite was the only thing visible, because he is the only thing in the
 *  scene with no lateral term at all.
 *
 *  So: one place that knows how wide the picture really is, written by the
 *  component that already owns the lens, read by everything that places
 *  anything sideways.
 *
 *  The defaults below are the design values, so a consumer that somehow reads
 *  this before the first frame behaves exactly as the scene did before.
 */
export const skyFrame = {
  /** tan of the horizontal half-angle. Multiply by a distance to get the
   *  half-width of the frame at that distance, in world units. */
  tanH: 0.5666,
  /** tan of the vertical half-angle. Same, for height. */
  tanV: 0.3541,
  /** width / height of the canvas. */
  aspect: 1.6,
  /** Whether the picture is narrow enough to need its own composition rather
   *  than a scaled-down version of the wide one. See PORTRAIT_ASPECT. */
  portrait: false,
}

/** Below this aspect the sky stops laying text out BESIDE the subject and
 *  stacks it above him instead.
 *
 *  0.9 rather than 1.0: the wide layout needs room for a block of type and a
 *  cloud on opposite sides of a subject in the middle, and it has stopped
 *  having that some way before the picture is literally square. Above 0.9 --
 *  every laptop, every tablet in landscape, a half-width desktop window -- the
 *  composition the scene was designed as still reads.
 *
 *  Deliberately an ASPECT and not a width in pixels. Every other breakpoint in
 *  this app is width-only and helpers/useShortViewport.ts already carries the
 *  note about why that is wrong here: a landscape iPhone is 844px wide. What
 *  decides whether two things fit side by side is the shape of the frame, not
 *  how many pixels it has. */
export const PORTRAIT_ASPECT = 0.9

/** Called once per frame by CameraController, which owns the lens. */
export function publishSkyFrame(fovDegrees: number, aspect: number) {
  const tanV = Math.tan((fovDegrees * Math.PI) / 360)
  skyFrame.tanV = tanV
  skyFrame.tanH = tanV * aspect
  skyFrame.aspect = aspect
  skyFrame.portrait = aspect < PORTRAIT_ASPECT
}

/** The design frame's horizontal tangent, kept so props can be measured
 *  against the shape they were drawn for. */
const DESIGN_TAN_H = 0.5666

/** How much to shrink a prop so it covers the same FRACTION of the picture it
 *  was authored to cover.
 *
 *  Placing things correctly is only half of fitting a narrow frame. A cloud is
 *  thirty world units across and that does not change with the window, so on a
 *  phone -- where the frame at the cloud's own distance is 18 units of
 *  half-width rather than 71 -- a cloud whose CENTRE is comfortably in shot
 *  still covers the entire picture and the subject behind it. Measured that
 *  way and it looked correct: centre at ndc 0.55, well inside. The screenshot
 *  showed a cloud filling the frame.
 *
 *  So props scale by the same ratio their frame did. At 16:10 this is exactly
 *  1 and nothing moves; at 0.41 it is 0.256, which holds a cloud at the 0.212
 *  of a half-frame it occupies on a desktop.
 *
 *  Clamped at 1 so an ultrawide window does not inflate everything. */
export function skyPropScale() {
  return Math.min(1, skyFrame.tanH / DESIGN_TAN_H)
}

/** Half-width of the frame in world units at a given distance from the camera. */
export function frameHalfWidth(distance: number) {
  return Math.max(0, distance) * skyFrame.tanH
}

/** Half-height of the frame in world units at a given distance from the camera. */
export function frameHalfHeight(distance: number) {
  return Math.max(0, distance) * skyFrame.tanV
}
