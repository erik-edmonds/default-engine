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
 *  THE JOURNEY IS A REAL DOCUMENT NOW, AND LENIS DRIVES IT.
 *
 *  It used to be synthetic: app/page.tsx captured the wheel, called
 *  preventDefault, and pushed the delta into a hand-written integrator that
 *  lived in this file -- a coast with friction, a magnet that sprang the
 *  reader toward each block of text, and a second "settle" mechanism that
 *  took over the landing once a flick was spent. Four hundred lines of
 *  physics, and the verdict on it was "the scroll is painful. It's hard to
 *  move through."
 *
 *  It was. Two separate mechanisms pulled backwards against the reader at
 *  every beat, and a measurement taken while removing them found a third
 *  fault underneath: SKY_SETTLE_REACH was derived from beat 0's span with
 *  the comment "every section is the same length, so one is all of them",
 *  which stopped being true when the beats were given weights -- so the
 *  magnet's reach was 74 units against the 214 a parallax beat needed, and
 *  it could no longer pull anyone out of a half-opened window anyway.
 *
 *  What replaces all of it: a spacer that makes the page genuinely tall (see
 *  app/page.tsx), Lenis smoothing the scroll, and this file doing nothing but
 *  holding the numbers. Wheel, trackpad, touch, keyboard, the scrollbar and
 *  the browser's own find-on-page all work, none of which was true before.
 *
 *  THREE numbers, and the distinction still matters:
 *
 *  - `target` is where the scroll has been taken -- Lenis's `targetScroll`
 *    mapped onto the axis.
 *  - `display` is the smoothed value everything is drawn at -- Lenis's
 *    `scroll`, which is the one the reader sees moving.
 *  - `speed` is the derivative of `display`, lightly filtered.
 *
 *  Consumers should read `display` and must NOT damp it again. Lenis owns the
 *  smoothing; a second damp on top of it is latency with no benefit, and two
 *  independent damps let the camera and the avatar slide apart. */
export const skyScroll = {
  /** 0 .. SKY_JOURNEY_DISTANCE. Where the scroll has been taken. */
  target: 0,
  /** 0 .. SKY_JOURNEY_DISTANCE. Where the scene is actually drawn. */
  display: 0,
  /** Units per second, lightly filtered, signed. The velocity lines read
   *  this, and so does the card's lean; anything that should only happen
   *  while you are actually travelling. */
  speed: 0,
}

/** Called once a frame by whoever owns the scroll, so `speed` stays
 *  consistent with `display` rather than being differentiated independently
 *  by each consumer at a different point in the frame. */
export function publishSkyDisplay(display: number, delta: number) {
  if (delta > 0) {
    const instant = (display - skyScroll.display) / delta
    // Light smoothing: a raw frame-to-frame derivative is noisy at small
    // deltas, and this drives something visual.
    skyScroll.speed += (instant - skyScroll.speed) * Math.min(1, delta * 8)
  }
  skyScroll.display = display
}

/** Where the scroll has been taken, before smoothing. Set from Lenis's
 *  `targetScroll`; kept separate from `display` because the two differ
 *  while a flick is still easing out, and the probes read both. */
export function publishSkyTarget(target: number) {
  skyScroll.target = target
}

export function resetSkyScroll() {
  skyScroll.target = 0
  skyScroll.display = 0
  skyScroll.speed = 0
}
