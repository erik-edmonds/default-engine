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


/** How far the mask turns, in radians, at its liveliest.
 *
 *  The reference's card is never quite square to the screen: it carries a
 *  couple of degrees and the angle changes as you scroll, which is most of
 *  why it reads as a piece of paper lying on a page rather than a div.
 *
 *  ON THE MASK ONLY. The sheets behind it stay level, always. A picture that
 *  tilts with its hole is the exact fault flagged twice ("it is crooked and
 *  off to the side for some reason"), and the probe asserts the sheets'
 *  corner skew is zero at every sample. */
export const CARD_TILT_MAX = 0.052

/** How far the resting card leans toward the cursor, in radians.
 *
 *  "Have it stick for a bit, and the square adjusts to the position of the
 *  cursor." It adjusts its ANGLE, not its place -- decided with the user --
 *  so the card stays dead centre and turns to face the pointer, the way a
 *  held slide does when you tip it toward a light.
 *
 *  Larger about Y than X because the card is wider than it is tall, so the
 *  same angle buys more visible foreshortening across than up, and matching
 *  them makes the vertical read as the stronger of the two.
 *
 *  Both go to zero as the card opens: a scene that IS the screen must be
 *  square to it, and six degrees of yaw on a full-frame plate would show
 *  the cardboard sky down one side of it. */
export const CARD_CURSOR_YAW = 0.122 // 7 degrees
export const CARD_CURSOR_PITCH = 0.07 // 4 degrees


/** A few percent over the exact answer below, to swallow the edge bows --
 *  they push each edge out, never in, so they only ever help, but the
 *  corners sit between two bowed edges and the arithmetic does not know it. */
const COVER_SAFETY = 1.05

/** The uniform scale a card needs to cover a frame that is `halfW` by `halfH`
 *  at the card's own distance, with its rounded corners carried off the
 *  frame rather than showing the page through four notches.
 *
 *  SOLVED PER AXIS, and it has to be. The card is `aspect` wide and 1 tall
 *  at scale s, so it overhangs the frame by (s*aspect - 2*halfW)/2 across
 *  and (s - 2*halfH)/2 up, while each corner cuts corner*s into BOTH. Each
 *  axis therefore has its own demand:
 *
 *      across:  s >= halfW / (aspect/2 - corner)
 *      up:      s >= halfH / (0.5 - corner)
 *
 *  and the answer is the larger. The old form -- cover the frame, then
 *  multiply by a margin of 1/(1 - 2*corner) -- quietly assumes the axis that
 *  sets the scale is also the axis that has to clear the corner. That holds
 *  for a landscape card on a landscape frame and fails for an upright one:
 *  at aspect 0.74 the HEIGHT set the scale while the WIDTH had to clear the
 *  corner, leaving 0.385 of overhang against a 0.429 radius, and the page
 *  showed through the bottom-left corner of a window reported as full bleed.
 *
 *  A corner at or past aspect/2 has no solution -- it would eat the card's
 *  whole half-width -- so the styles keep well under it. */
export function cardCoverScale(halfW: number, halfH: number, style: CardStyle) {
  // The radius has to clear on BOTH axes: it rounds every corner, so a
  // corner left inside the frame on either axis shows.
  const radius = Math.max(halfW / (style.aspect / 2 - style.corner), halfH / (0.5 - style.corner))

  // THE STEP CLEARS ON EITHER AXIS, and that distinction is worth the two
  // lines. It is cut from ONE corner, so carrying that corner off the frame
  // horizontally hides it just as completely as carrying it off vertically
  // -- whichever is cheaper. Demanding both put the upright card at ten and
  // a half times its covering size, which would have had it fill the frame
  // a fifth of the way into its expansion and spend the rest growing
  // invisibly. Forgetting the step altogether is the other failure, and
  // that one showed as a bite of page in the corner of a "full screen"
  // window for a round.
  // EVERY CUT CORNER, not just the step. The chamfers are corner features
  // too and some of them are deeper than the step -- a 0.22 diagonal off
  // the bottom-left of the upright card against its 0.3 step -- so each one
  // has to be carried off the frame on one axis or the other, exactly like
  // the step, or the page shows through it at full screen.
  const corners: [number, number][] = [
    [style.notch.w, style.notch.h],
    style.chamfer.bl, style.chamfer.br, style.chamfer.tr, style.chamfer.tl,
  ]
  let cut = 0
  for (const [cw, ch] of corners) {
    if (cw <= 0 && ch <= 0) continue
    const onX = style.aspect / 2 - cw * style.aspect
    const onY = 0.5 - ch
    cut = Math.max(cut, Math.min(onX > 0 ? halfW / onX : Infinity, onY > 0 ? halfH / onY : Infinity))
  }

  return Math.max(radius, cut) * COVER_SAFETY
}

/** ONE WINDOW PER BEAT, AND NO TWO ALIKE.
 *
 *  All three used to be the same card: same width, same near-square shape,
 *  same outline, dead centre every time -- "it looks too default and AI
 *  generated", which is a fair reading of three identical rounded rectangles
 *  appearing in the same spot three times running.
 *
 *  So each beat gets its own. They differ in everything worth differing in:
 *  where they sit across the page, how big they are, their proportion --
 *  one landscape, one upright, one wide -- which corner the step is cut
 *  from, and which way they lean.
 *
 *  WHERE THEY CAN SIT IS BOUNDED, and the bound is the page under them.
 *  The big rotated label runs down the left margin to about -0.355 of the
 *  frame width, and the card is drawn in front of it, so overlapping it
 *  reads as a collision rather than as layering. On a narrow frame none of
 *  this fits and restingCard rearranges it.
 *
 *  HOW FAR EACH ONE OVERSHOOTS AT FULL SIZE IS NOT STATED HERE. It is a
 *  function of the corner and the aspect, and cardCoverScale derives it --
 *  twice now this has been a hand-written number that was right for the
 *  shape it was written for and wrong for the next one. */
export type CardStyle = {
  /** Which side of the page this beat's copy sits on.
   *
   *  THIS USED TO BE WHERE THE CARD RESTED -- a pair of offsets, and the
   *  copy went to whichever side they left clear. The card rests dead
   *  centre now ("shrink it to the middle of the screen"), so there is no
   *  offset left to read a side off, and a signed number whose magnitude
   *  means nothing is worse than naming the thing outright. */
  copy: "left" | "right"
  /** Its width at rest, as a share of the frame's width.
   *
   *  UNDER 0.31, ALL THREE, AND THAT IS THE BINDING CONSTRAINT. The copy
   *  column is 0.3 of the frame hung off a 0.045 gutter, so its inner edge
   *  is 0.155 from the centre line; a centred card wider than twice that
   *  sits on top of its own words, which is the fault the offsets were
   *  introduced to fix ("the text is at the middle bottom and behind the
   *  parallax hole so it can't even be read"). Being small is also what
   *  the reference asks for in its own right -- "a small square". */
  width: number
  /** Width over height. Below 1 it is an upright card. */
  aspect: number
  /** Corner radius, as a fraction of the card's height. Small -- these are
   *  cut plates, not pills. Kept well under aspect/2; see cardCoverScale. */
  corner: number
  /** The L-shaped step bitten out of one corner. `w` is a share of the
   *  card's WIDTH, `h` of its HEIGHT. */
  notch: { at: "bl" | "br" | "tr" | "tl"; w: number; h: number }
  /** A diagonal cut off each of the other corners, as [width, height]
   *  shares -- 0 for a plain rounded corner.
   *
   *  THIS IS WHAT MAKES IT IRREGULAR. "The shapes are still rectangles. It
   *  should be irregular, like the photo attached." A rounded rectangle
   *  with one step is still a rectangle with one step; the reference's
   *  plate is an octagon whose corners are all cut, and cut by visibly
   *  different amounts. Equal chamfers would read as a machined bevel,
   *  which is the same failure in a different costume. */
  chamfer: { bl: [number, number]; br: [number, number]; tr: [number, number]; tl: [number, number] }
  /** A fixed angle the slide sits at, in radians, on top of whatever the
   *  scroll adds. A reel's plates are never quite square to the viewer and
   *  no two sit at the same angle. */
  lean: number
}

export const CARD_STYLES: readonly CardStyle[] = [
  // Landscape, the middle size: a deep step out of the bottom-left, a long
  // shallow cut across the top-right, and a 1.4 degree lean.
  { copy: "right", width: 0.26, aspect: 1.18, corner: 0.035,
    notch: { at: "bl", w: 0.22, h: 0.12 }, lean: -0.024,
    chamfer: { bl: [0, 0], br: [0.07, 0.13], tr: [0.19, 0.09], tl: [0.05, 0.1] } },
  // Upright and the smallest: stepped at the top-right, a big diagonal off
  // the bottom-left, and leaning the other way.
  { copy: "left", width: 0.2, aspect: 0.74, corner: 0.028,
    notch: { at: "tr", w: 0.3, h: 0.1 }, lean: 0.017,
    chamfer: { bl: [0.22, 0.14], br: [0.1, 0.06], tr: [0, 0], tl: [0.06, 0.16] } },
  // The widest and flattest of the three: a shallow wide step out of the
  // bottom-right, both top corners cut unevenly, barely any lean.
  { copy: "right", width: 0.28, aspect: 1.52, corner: 0.04,
    notch: { at: "br", w: 0.18, h: 0.09 }, lean: -0.009,
    chamfer: { bl: [0.11, 0.17], br: [0, 0], tr: [0.08, 0.12], tl: [0.16, 0.07] } },
]

/** How big a resting card is, once the frame has had its say.
 *
 *  ONE FUNCTION, TWO READERS. SkyCard scales the card from this and SkyPage
 *  puts its copy under it from this; a portrait adjustment made in only one
 *  of them would put the text under a card of a different size.
 *
 *  IT NO LONGER SAYS WHERE. The card sat off to one side and, in an earlier
 *  version, travelled up the page; it now rests dead centre and turns over
 *  in place, so the only thing left for the frame to have a say about is
 *  the size.
 *
 *  THE WIDTHS ARE AUTHORED FOR A LANDSCAPE FRAME, where the copy is a
 *  column in the right or left gutter and the card clears it at 0.26-0.28
 *  of the frame. On a 430px phone that column is an unreadable third of the
 *  screen, so the copy runs full width UNDER the card instead -- nothing is
 *  beside the card there, and it can afford to be most of the width. */
export function restingCard(style: CardStyle, portrait: boolean) {
  if (!portrait) return { width: style.width }
  return { width: Math.min(0.82, style.width * 1.8) }
}

/** The bottom edge of that resting card, in shares of the frame's HEIGHT
 *  from its centre -- which is where the page's copy hangs from.
 *
 *  SkyCard scales the card by `width * frameW / aspect`, which IS its
 *  height in world units; over the frame's height that is a share, and
 *  shares hold at any distance because both frames grow in proportion to
 *  theirs. */
export function cardBottomShare(style: CardStyle, viewportAspect: number, portrait: boolean) {
  return -cardHalfHeight(style, viewportAspect, portrait)
}

/** Half a resting card's height, in shares of the frame's height. */
export function cardHalfHeight(style: CardStyle, viewportAspect: number, portrait: boolean) {
  return (restingCard(style, portrait).width * viewportAspect) / style.aspect / 2
}


/** Which side of the page the beat's copy sits on.
 *
 *  THE COPY WAS CENTRED AT THE BOTTOM and the hole came up the middle of
 *  the page, so it passed straight over the words every time: "the text is
 *  at the middle bottom and behind the parallax hole so it can't even be
 *  read". Vertical separation could not fix that, because a hole that
 *  travelled visited every height.
 *
 *  The hole does not travel any more -- it turns over dead centre -- so the
 *  separation is now a matter of the card being small enough to leave a
 *  gutter clear, which CardStyle.width is held under. The side still
 *  alternates between beats, because three identical page layouts in a row
 *  is exactly the "too default and AI generated" note. */
export function cardCopySide(style: CardStyle): "left" | "right" {
  return style.copy
}


/** Which style a parallax beat wears. Keyed on the beat's position in the
 *  run rather than on its index in SKY_TEXT_CUES, so inserting a beat
 *  anywhere earlier in the journey does not reshuffle the windows. */
export function cardStyleFor(parallaxOrdinal: number): CardStyle {
  return CARD_STYLES[parallaxOrdinal % CARD_STYLES.length]
}

/** The gutter the caption keeps from the frame's left edge, as a share of
 *  the frame's width.
 *
 *  THE CAPTION IS OFF TO THE SIDE, NOT CENTRED, and the reason is the art:
 *  the foreground plate in two of the three folders is a cut-out figure who
 *  stands in the middle of the scene, so a caption centred at the bottom --
 *  which is where the reference puts it -- lands across their chest and
 *  face. The figure is the subject of the picture and keeps the middle; the
 *  words move. Asked and answered rather than guessed at.
 *
 *  Expressed as a gutter rather than an offset so it keeps its distance from
 *  the edge whatever width the caption is -- and on a phone it is much
 *  wider (see CARD_TEXT_SCREEN_WIDTH_PORTRAIT), which walks it back towards
 *  the middle on its own. There the figure fills the frame and there is no
 *  clear space to move into; the scrim behind the words is what carries
 *  legibility, as it does on the reference. */
export const CARD_TEXT_SCREEN_GUTTER = 0.05

/** What share of the frame's width the caption takes on a PORTRAIT frame.
 *
 *  A share of the width is the wrong measure on a phone and this is the
 *  correction, not a taste call: a third of 1440px is a readable column and
 *  a third of 430px is 146px, which rendered the heading at a size nobody
 *  could read. The landscape number stays where it is. */
export const CARD_TEXT_SCREEN_WIDTH_PORTRAIT = 0.78

export const CARD_PAGE_DISTANCE = 46

/** WHITE, as the reference's page is.
 *
 *  It was a deep navy, chosen because white under this project's warm paper
 *  sky reads as a missing texture -- but the page is not under the paper
 *  sky, it REPLACES it for the length of the run, and a near-black page with
 *  one card floating in it is what made the stretch between the scenes read
 *  as a fault rather than as a spread. Off-white rather than pure, so the
 *  AgX pass has somewhere to roll off to.
 *
 *  Not quite 1.0 for the same reason everything else in this file is
 *  authored past where it should land: see the note at the top. */
export const CARD_PAGE_COLOUR = "#f4f2ee"

/** The ink on it. The existing dark used by the paper sky's own type -- the
 *  page's furniture is dark on light, where the caption inside a scene
 *  stays light on a dark picture. */
export const CARD_PAGE_INK = "#16202e"

/** Paint order for the parallax page and the hole that opens in it.
 *
 *  BOTH ARE TRANSPARENT, AND THAT IS THE POINT. three.js draws the whole
 *  opaque list before the whole transparent one, and renderOrder only sorts
 *  within a list -- so an opaque hole and a transparent page cannot be
 *  ordered against each other at all, however the numbers are set.
 *
 *  THE PAGE WAS AT -50 AND HAD TO COME UP. Below it in the transparent pass
 *  sit the subject's twine rope (0), the sky's own text (0) and the
 *  cardboard cloud and star cutouts (1 and 2). That was survivable only
 *  while the page was a full-screen fill that appeared the instant every
 *  one of those was force-hidden. A page that SLIDES up over the scene is
 *  on screen while the scene is still there, so it has to outrank them --
 *  and still sit under the hole it carries.
 *
 *  Getting the page-vs-hole order wrong is not subtle: the page simply
 *  painted over the hole, and all three parallax scenes came out as a flat
 *  screen of colour. */
export const CARD_PAGE_ORDER = 4

/** How tall the parallax page is drawn, in frame heights, and how far it
 *  has to travel to be wholly clear of the frame.
 *
 *  THE TWO ARE TIED, and getting that wrong is invisible in the config and
 *  obvious on screen. A page must be taller than the frame or its own edges
 *  come into shot while it is covering; and it must then travel half its
 *  own height plus half the frame to get out of the way. At three frames
 *  tall and one frame of travel -- which is what the first build did -- its
 *  top edge finished at +1.05 of a frame that ends at +1.0, so "slid away"
 *  still covered the screen completely. */
/** 2.4 rather than 1.4, so the page actually CONTAINS its holes. They
 *  travel CARD_SLOT_TRAVEL (0.74) either side of centre and stand about
 *  0.3 tall themselves, so they reach 1.04 -- past the edge of a page half
 *  of 1.4. It never showed, because while the page is landed anything out
 *  there is off the frame anyway; but "a hole in the page" that leaves the
 *  page is a model that will mislead the next change made to it. */
export const CARD_PAGE_SPAN = 2.4
export const CARD_PAGE_TRAVEL = (CARD_PAGE_SPAN + 1) / 2

export const CARD_MASK_ORDER = 10

/** How far in front of the camera the window's mask hangs.
 *
 *  Nearer than the sheets it reveals (CARD_PLATE_DISTANCE), so it is always
 *  in front of them, and far enough out that the lens does not bow its
 *  straight edges. The number is otherwise arbitrary: the mask is sized
 *  against the frame at this distance, so it covers the same share of the
 *  screen whatever it is. */
export const CARD_MASK_DISTANCE = 12


// --- what is inside one -----------------------------------------------------

/** How far in front of the camera the full-screen sheets hang.
 *
 *  They are square to the camera and sized to the frame at this distance, so
 *  the number itself is arbitrary -- what matters is that it is well clear of
 *  the near plane and the same for all three, because they are sorted by
 *  renderOrder rather than by depth. */
export const CARD_PLATE_DISTANCE = 30

/** A little larger than the frame, so no sheet shows its own edge. */
export const CARD_PLATE_MARGIN = 1.06

/** The parallax sheets, far to near.
 *
 *  `zoom` is how much TALLER than the screen the sheet is drawn, and
 *  therefore exactly how far it scrolls: a sheet 1.5 screens tall travels
 *  the half-screen of overflow and no more, so it is scrolled from its top
 *  edge to its bottom edge and never shows either. That is what "scroll
 *  moves down the image" means, and it is why this is a zoom rather than a
 *  free slide -- the first version slid each sheet by a fixed share of the
 *  screen regardless of how tall it actually was, which parked the
 *  foreground figure half off the top of the frame and cut him off at the
 *  waist on a hard edge.
 *
 *  Near sheets are zoomed more than far ones, so they travel further. That
 *  difference is the whole parallax: the sheets are all square to the camera
 *  at one distance, so there is no perspective between them to do the work. */
/** TRAVEL IS STATED, NOT INFERRED FROM THE ZOOM.
 *
 *  It used to be a side effect: a sheet was drawn `zoom` screens tall and
 *  scrolled by whatever overflow that left it, so the three speeds were
 *  whatever the three zooms happened to imply. That reads fine for scenery
 *  and breaks completely for a cut-out, which has no overflow to spend and
 *  so did not move at all -- "the foreground is just supposed to scroll
 *  faster than the middle or background, but it shouldn't follow the
 *  screen".
 *
 *  So each layer now says how far it travels, in screens, and `zoom` only
 *  has to be big enough to pay for it. A sheet must be at least `1 + travel`
 *  tall or it runs off its own picture; all three below have room to spare.
 *
 *  The spread is the parallax, and on the reference the foreground is the
 *  fastest thing on screen by a wide margin -- its near mountain climbs the
 *  frame while the clouds behind barely shift.
 *
 *  EVERY SHEET KEEPS SLACK -- zoom is more than 1 + travel, never equal to
 *  it. The journey is centred in whatever overflow a sheet has, so when the
 *  two are equal the sheet runs edge to edge and the scene necessarily
 *  OPENS ON THE LITERAL TOP OF THE PLATE. All three used to be exact (1.45
 *  for 0.45, 2.0 for 1.0), which did not show while the view ran bottom to
 *  top because the bottom of this art is ground; the moment the direction
 *  was put right it opened on a screenful of blank sky with the subject
 *  still below the frame.
 *
 *  And the far layer barely moves, which is both how parallax works and how
 *  this art survives it: the background is the only sheet that fills the
 *  frame on its own, so it is the one that must stay composed and stay
 *  sharp. At zoom 1.25 it is a 1281px plate drawn 1.35 screens wide instead
 *  of 2.0, and the frame holds four fifths of the picture at all times.
 *
 *  AND THE ZOOMS BUY TRAVEL AT THE COST OF SHARPNESS, so they are kept as
 *  low as the travel allows. The plates are 1281x832. A sheet drawn two
 *  screens tall on a 1440x900 frame is a 2.3x upscale filling the whole
 *  picture, and at 2.1 the midground was a pale blur over the top of a
 *  background that was perfectly sharp underneath it. Travel is clamped to
 *  a sheet's own overflow anyway, so asking for more than these buys
 *  nothing but softness. */
export const CARD_LAYERS = [
  { file: "background", zoom: 1.25, travel: 0.2 },
  { file: "midground", zoom: 1.7, travel: 0.6 },
  { file: "foreground", zoom: 2.2, travel: 1.0 },
] as const

/** How tall a CUT-OUT SUBJECT is drawn, as a share of the frame, and how
 *  far it rises over the scroll.
 *
 *  A subject does not obey the zoom rule above, and the reason is what it
 *  is: scenery is a backdrop that has to cover the screen, a subject is a
 *  figure standing in the scene. Zoomed to 1.62 screens like the foreground
 *  plate it belongs to, the placeholder portrait filled the frame and was
 *  cropped at the chin -- a close-up, not a figure in a landscape.
 *
 *  So it is sized to stand in the picture rather than fill it -- but it
 *  still has to MOVE, and faster than the midground, because it is the
 *  foreground layer.
 *
 *  THE ARITHMETIC FORCES A TRADE, and it is worth stating rather than
 *  hiding. A figure of height h travelling T screens is wholly inside the
 *  frame only while it is within (1 - h) / 2 of centre, and shows at all
 *  only while it is within (1 + h) / 2. At the old 0.82 that first window
 *  is 0.09 of a screen wide -- the figure could not travel even half as far
 *  as the midground without leaving, which is why it was pinned, and pinned
 *  is what the reader noticed.
 *
 *  At 0.45, against the foreground's 1.25 screens of travel: SOME of the
 *  figure is on screen for the whole scroll, and ALL of it for the middle
 *  44% of it. That is "faster than the middle or background, but it
 *  shouldn't follow the screen" as closely as the two can both be had. */
export const CARD_SUBJECT_HEIGHT = 0.45

/** Where the beat's words sit over the scene, as shares of the frame.
 *
 *  SMALL, CENTRED, NEAR THE BOTTOM -- which is where the reference puts its
 *  captions, and not the top-left corner this had before. A caption down
 *  there reads as a subtitle to the picture; the same words in the corner
 *  read as a headline the picture is illustrating, which is the wrong way
 *  round for a scene you are meant to be looking at. */
export const CARD_TEXT_SCREEN_WIDTH = 0.34
export const CARD_TEXT_SCREEN_BOTTOM = -0.3

/** A sheet's file, addressed by the beat's own folder.
 *
 *  By FOLDER, not by index. Only section 3's beats have plates, and a beat's
 *  place in the cue table is not its place in the art directory -- the cue
 *  table also holds the intro, the drift and the contact card. Each parallax
 *  beat names its own folder (see CUE_CONTENT). */
export function cardLayerUrl(folder: string, file: string) {
  return `/images/cards/${folder}/${file}.webp`
}

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

/** THE TYPE, PLACED AGAINST THE VISIBLE PICTURE RATHER THAN THE CARD.
 *
 *  The card overhangs the frame -- by CARD_COVER_MARGIN at full size, and by
 *  a great deal more than that on a phone, where covering a tall narrow frame
 *  with a 16:10 card means most of the card's width is off screen. So a
 *  margin measured from the CARD's edge puts the words outside the picture:
 *  on a 404-wide phone only the central 21% of the card is ever visible, and
 *  a column at -0.6 would miss it entirely.
 *
 *  SkyCard works out what part of the card the frame can actually see and
 *  hands it down; these are measured in from that, in card heights. Capped
 *  by the card's own edge too, so a small card -- which is smaller than the
 *  frame, not bigger -- keeps its words inside itself.
 *
 *  The column still SCALES with the card, which is the point: the heading is
 *  in the same place on a small card as on a full-screen one, and that is
 *  what makes the expansion read as one object growing rather than a cut to
 *  a different layout. */
export const CARD_TEXT_MARGIN = 0.075

/** The type column's width, in card heights, where there is room for it.
 *
 *  Chosen so that on a 16:10 desktop frame the painted column lands close to
 *  1:1 with the pixels it was drawn at -- the card's full-cover height is
 *  1.2 frames, so 0.66 of that is about 712 screen pixels against the 690 the
 *  canvas is painted at. Type resampled by a factor near one stays crisp;
 *  this was 0.62 of a figure measured against the wrong thing and the
 *  headline came out at 85px with its first line off the top of the screen. */
export const CARD_TEXT_WIDTH = 0.66

/** How far the type drifts up over the whole of INSIDE, in card heights.
 *
 *  Small. This is the reader moving through the card's scene, not a scrolling
 *  page inside a window -- the copy has to stay readable for the whole hold,
 *  and the hold is where the scroll magnet parks. */
export const CARD_TEXT_RISE = 0.09
