/** Where the sky journey has been scrolled to, published for anything that
 *  needs to move with it.
 *
 *  `skyOffset` lived as a useRef private to app/page.tsx, so the only things
 *  that could see it were the two controllers it was handed to imperatively.
 *  The fly-past needs a third reader -- the paper world itself -- and a fourth,
 *  the velocity lines, which need to know how FAST it is changing.
 *
 *  Module state rather than an atom, for the reason cameraBase.ts already gives
 *  for the same decision: this changes every frame while a gesture is in
 *  flight, and a React re-render per change would be absurd. pointerState and
 *  sunState are the same pattern.
 *
 *  TWO numbers, and the distinction matters:
 *
 *  - `target` is where the wheel has been scrolled to. Written by page.tsx.
 *  - `display` is the damped value the camera is actually at. Written by
 *    CameraController, which already computes it.
 *
 *  Consumers should read `display` and must NOT damp it again. config/
 *  skyJourney.ts warns that two smoothing constants let the camera and the
 *  avatar slide apart, and that is already latent between those two -- the
 *  camera clamps its delta to 1/30 and the avatar does not, so on a long frame
 *  they disagree. A third independent damp would be a third thing to drift. */
export const skyScroll = {
  /** 0 .. SKY_JOURNEY_DISTANCE. Where the scroll has been taken. */
  target: 0,
  /** 0 .. SKY_JOURNEY_DISTANCE. Where the camera actually is, damped. */
  display: 0,
  /** Units per second, damped, signed. The velocity lines read this; so does
   *  anything that should only appear while you are actually travelling. */
  speed: 0,
}

/** Called by whoever owns the damp, once per frame, so `speed` stays consistent
 *  with `display` rather than being differentiated independently by each
 *  consumer at a different point in the frame. */
export function publishSkyDisplay(display: number, delta: number) {
  if (delta > 0) {
    const instant = (display - skyScroll.display) / delta
    // Light smoothing: the raw derivative of a damped value is noisy at small
    // deltas, and this drives something visual.
    skyScroll.speed += (instant - skyScroll.speed) * Math.min(1, delta * 8)
  }
  skyScroll.display = display
}

export function resetSkyScroll() {
  skyScroll.target = 0
  skyScroll.display = 0
  skyScroll.speed = 0
}
