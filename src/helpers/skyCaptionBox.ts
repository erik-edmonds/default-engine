/** Where the sky's block of words landed on screen, in CSS pixels.
 *
 *  Published by SkyCaptionBillboard, read by the DOM contact panel. Module
 *  state rather than an atom for the reason cameraBase.ts and skyScroll.ts
 *  already give for the same decision: this is rewritten every frame while
 *  the journey is moving, and a React render per change would be absurd.
 *
 *  WHY THE DOM NEEDS THIS AT ALL. The words are a canvas texture on a plane
 *  in the corridor, which is what lets the subject fly in front of them --
 *  but a texture cannot be clicked, and the last block is the contact card:
 *  "the user needs to be able to interact with it". So the prose stays in the
 *  scene and the ACTIONS are real DOM, placed against the box the scene
 *  reports rather than guessed at with a percentage. Guessing would hold at
 *  one window size and drift at every other, and the camera parks for this
 *  block, so any drift would sit there in plain view.
 *
 *  `visible` is false whenever the block is not being drawn -- including when
 *  it is behind the camera, where a projected point silently flips sign and
 *  would otherwise place the panel on the wrong side of the screen. */
export const skyCaptionBox = {
  visible: false,
  /** The block's left edge, in CSS pixels from the left of the canvas. */
  left: 0,
  /** Its right edge. */
  right: 0,
  /** Its bottom edge, in CSS pixels from the top. */
  bottom: 0,
}

export function resetSkyCaptionBox() {
  skyCaptionBox.visible = false
}
