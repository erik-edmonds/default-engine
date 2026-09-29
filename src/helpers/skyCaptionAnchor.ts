/** Where the sky journey's block of text is, as a place in the SCENE.
 *
 *  The words used to be a DOM overlay pinned to one half of the frame: they
 *  cut in at full size the moment their cue passed and sat at a fixed spot
 *  until the next one. The note was that "the text just pops up at the
 *  forefront of the screen, but the text is a part of the scene -- it should
 *  appear in the background as well, and on scroll it should advance to the
 *  front as the dragonite passes towards/past it", and the reference does
 *  exactly that: a small, faint caption a long way off that grows and drifts
 *  outward until it sweeps past the camera.
 *
 *  So the block now has a position in the corridor, like a cloud does, and
 *  what lives here is where that position lands on screen. The scene computes
 *  it -- it is the only thing that has the camera -- and the DOM block follows
 *  it. Module state rather than an atom for the same reason skyScroll is: this
 *  changes every frame and a re-render per change would be absurd.
 *
 *  `x` and `y` are fractions of the viewport, not pixels, so the block can
 *  place itself without knowing the canvas size. `scale` is 1 at the distance
 *  the type was designed to be read at, and grows as it closes. */
export const skyCaptionAnchor = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  opacity: 0,
  /** False while there is no block in the corridor at all -- before the first
   *  cue, and in the gap after one has swept past. */
  present: false,
}

export function resetSkyCaptionAnchor() {
  skyCaptionAnchor.x = 0.5
  skyCaptionAnchor.y = 0.5
  skyCaptionAnchor.scale = 1
  skyCaptionAnchor.opacity = 0
  skyCaptionAnchor.present = false
}
