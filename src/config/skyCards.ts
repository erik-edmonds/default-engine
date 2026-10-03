/** The cards the sky journey is built out of, and the scenes inside them.
 *
 *  A block of text used to be a plane with words painted on it, flying past.
 *  It is now a CARD: a window standing in the corridor that grows until it is
 *  the whole screen, holds while its own scene is scrolled through, and
 *  shrinks away again -- "a stack of scenes where the sky scene contains
 *  cards that contain their own scene inside".
 *
 *  Timing lives in config/skyJourney.ts (skyCardState); this file is the
 *  geometry and the art direction.
 *
 *  ON THE COLOURS. Everything here is authored well past where it should
 *  land, for the reason PAPER_SKY already gives at length: the scene ends in
 *  an AgX tone-mapping pass over the whole framebuffer, `toneMapped: false`
 *  does not opt a material out of it, and AgX desaturates as it rolls off.
 *  Values picked to look right in a swatch come out grey on screen.
 */

import { CAMERA_BEHIND } from "@/config/flightFrame"

// --- where the card is ------------------------------------------------------

/** Where a card first appears, how far out it is read, and where it finally
 *  sweeps past the lens -- all on the corridor's own axial scale.
 *
 *  Deliberately the caption's old three distances. The approach is the one
 *  part of this that was already right: a block coming out of the haze,
 *  growing, and passing is the motion the corridor was tuned around over
 *  three rounds, and the card inherits it rather than inventing a new one. */
export const CARD_FAR_AXIAL = 190
export const CARD_READ_AXIAL = 62
export const CARD_NEAR_AXIAL = 2

/** The card's distance in front of the CAMERA when it is open. Every frame
 *  fraction below is evaluated here, so the card has one size and one place
 *  for the whole of its hold rather than breathing as the corridor moves. */
export const CARD_READ_AHEAD = CARD_READ_AXIAL - CAMERA_BEHIND

// --- how big it is ----------------------------------------------------------

/** The card's proportions, width over height.
 *
 *  Baked into the GEOMETRY rather than applied as a non-uniform scale, and
 *  that is load-bearing. drei's MeshPortalMaterial gives the portal's scene
 *  the parent mesh's whole world matrix -- `scene.matrixWorld.copy(
 *  parent.matrixWorld)` -- so anything the card is scaled by, its contents
 *  are scaled by too. A non-uniform scale would stretch the scene inside the
 *  card by the card's aspect, and it would stretch by a DIFFERENT amount at
 *  every viewport. Authored into the shape, the scale stays uniform and the
 *  inner scene is undistorted everywhere.
 *
 *  16:10 rather than 16:9: it has to cover portrait phones too (see
 *  cardCoverScale), and every bit of extra height is cover it does not have
 *  to buy by overshooting the width. */
export const CARD_ASPECT = 1.6

/** Corner radius, as a fraction of the card's height. The reference's cards
 *  are softly rounded at this size and the roundness is one of the few things
 *  that reads at a glance while the card is small. */
export const CARD_CORNER = 0.075

/** How wide a closed card is, as a fraction of the frame's half-width.
 *  About a third of the picture: big enough to be a thing rather than a
 *  postage stamp, small enough that "it expands to take up the full screen"
 *  is a real change. */
export const CARD_WIDTH_NDC = 0.34

/** How far off the flight axis a closed card sits, and how high.
 *
 *  The subject is in the other half, which is the composition the whole sky
 *  is built around -- see SKY_LOOK_TILT. Both go to zero as the card opens:
 *  a card that is about to be the screen has to be centred on it. */
export const CARD_SIDE_NDC = 0.52
export const CARD_UP_NDC = 0.1

/** How far a closed card is turned away from the camera, in radians.
 *
 *  The second reference clip opens on a card clearly turned about fifteen
 *  degrees off square -- it is what makes it read as an object in a space
 *  rather than a rectangle pasted on the picture. It unwinds to exactly
 *  square as the card opens, because a screen cannot be at an angle. */
export const CARD_TURN = 0.26

/** How far past full coverage a fully open card goes.
 *
 *  NOT a safety hair -- it is the corner radius, and the number is derived.
 *
 *  The card's corners are rounded, and a rounded corner scales with the card,
 *  so at full size the sky would show through four curved notches at the
 *  edges of the screen. Rebuilding the geometry with a shrinking radius every
 *  frame is the obvious fix and far too expensive; overhanging the frame by
 *  more than the radius puts the notches outside the picture instead.
 *
 *  The card overhangs by (m - 1) * half on each side and the corner cuts
 *  CARD_CORNER * 2 * half * m into it, so the notch clears the frame when
 *  (m - 1) >= 2 * CARD_CORNER * m, i.e. m >= 1 / (1 - 2 * CARD_CORNER) =
 *  1.176. 1.2 with a little margin on the margin. */
export const CARD_COVER_MARGIN = 1.2

/** The uniform scale a card needs to cover a frame that is `halfW` by `halfH`
 *  at the card's own distance.
 *
 *  The plane is CARD_ASPECT wide and 1 tall, so covering needs the larger of
 *  the two demands -- which is the width on a desktop and very much the
 *  height on a phone. */
export function cardCoverScale(halfW: number, halfH: number) {
  return Math.max((2 * halfW) / CARD_ASPECT, 2 * halfH) * CARD_COVER_MARGIN
}

// --- what is inside one -----------------------------------------------------

/** The card's local space is CARD_ASPECT wide and 1 tall, centred on the
 *  origin, so every layer below is authored in those units and comes out the
 *  right size whatever the card is scaled to.
 *
 *  Layers are OVERSIZED on purpose. They sit behind the window and slide
 *  across it, and anything outside the card's silhouette is clipped by the
 *  portal for free -- so a layer only has to be wide enough that its own edge
 *  never wanders into view. */
export const LAYER_OVERSIZE = 2.1

/** The parallax layers of a card's scene, far to near.
 *
 *  `depth` is how far behind the window the layer sits, in card heights.
 *  `drift` is how far it slides across the window over the whole of INSIDE,
 *  also in card heights -- near layers travel further, which is the whole of
 *  parallax. `rise` is the matching vertical drift.
 *
 *  THE PLACEHOLDER IS THE POINT, for now. "They can just have placeholder
 *  parallax things inside it, we can focus on finetuning it once the
 *  structure is correct." These are cut-paper bands -- the same material the
 *  sky outside is made of -- rather than art that would have to be thrown
 *  away when the real contents arrive. */
export const CARD_LAYERS = [
  { depth: 0.62, drift: -0.1, rise: 0.02, bumps: 5, height: 0.56, tint: 0.0 },
  { depth: 0.4, drift: -0.2, rise: 0.035, bumps: 4, height: 0.42, tint: 0.18 },
  { depth: 0.22, drift: -0.36, rise: 0.05, bumps: 3, height: 0.3, tint: 0.36 },
  { depth: 0.08, drift: -0.58, rise: 0.07, bumps: 3, height: 0.19, tint: 0.56 },
] as const

/** Each card's own world, in the order the blocks are read.
 *
 *  `sky` is the backdrop, `near` the colour the closest band is tinted
 *  toward, and the bands in between are mixed across the two by their `tint`
 *  above -- so a card is one coherent light rather than four unrelated
 *  colours. `ink` is the type, which is near-white on all of them because the
 *  backdrops are all mid-to-deep and the copy has to read at a glance while
 *  the card is still small. */
export const CARD_PALETTES = [
  // Data Scientist, Mostly Remote -- a cold clear morning, somewhere else.
  { sky: "#2f6fae", near: "#0d2742", ink: "#f4f9ff", glow: "#8fd3ff" },
  // Photographs In, Scenes Out -- the violet of a splat viewer's void.
  { sky: "#6a4bc4", near: "#20123f", ink: "#f8f4ff", glow: "#d8a6ff" },
  // Pokemon Trainer at Heart -- late afternoon, the long walk home.
  { sky: "#e0702f", near: "#43180f", ink: "#fff6ee", glow: "#ffc46b" },
  // Certified Scuba Diver -- thirty metres down, no signal.
  { sky: "#118a94", near: "#03242f", ink: "#effdff", glow: "#67e8d6" },
  // Let's Connect -- the last of the light.
  { sky: "#d4466f", near: "#2c0f2c", ink: "#fff2f6", glow: "#ffb08a" },
] as const

/** How much of the card's height the type column occupies, and where it sits.
 *
 *  Set against the card rather than against the screen, so the words keep
 *  their place in the composition while it grows -- the heading is in the
 *  same corner of a small card as of a full-screen one, which is what makes
 *  the expansion read as one object getting bigger rather than as a cut to a
 *  different layout. */
export const CARD_TEXT_WIDTH = 0.62
export const CARD_TEXT_LEFT = -0.66
export const CARD_TEXT_TOP = 0.3

/** How far the type drifts up over the whole of INSIDE, in card heights.
 *
 *  Small. This is the reader moving through the card's scene, not a scrolling
 *  page inside a window -- the copy has to stay readable for the whole hold,
 *  and the hold is where the scroll magnet parks. */
export const CARD_TEXT_RISE = 0.1
