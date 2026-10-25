/** Painting a card's words into a 2D canvas, so they can be carried on a
 *  plane inside the card's own scene.
 *
 *  Lifted out of SkyCaptionBillboard, which drew the same three elements --
 *  an eyebrow, a headline and a paragraph -- onto a plane flying past in the
 *  corridor. The reasons for a canvas rather than DOM or 3D text are
 *  unchanged and worth restating, because all three alternatives were tried:
 *
 *  - DOM painted over the canvas can never be BEHIND anything in the scene,
 *    and inside a card it has to be, because the card's own layers pass in
 *    front of it.
 *  - drei's <Html occlude="blending"> composites outside this scene's
 *    postprocessing and arrives as a black rectangle.
 *  - troika's 3D text wants a font file, and the face this has to match is
 *    the one next/font generates, which has no stable URL.
 *
 *  A canvas gets that face for free: the browser already has it loaded.
 */

/** Pixels of texture per CSS pixel of the design.
 *
 *  Three. A card's type is drawn once at CARD_TEXT_CSS_WIDTH and then scaled
 *  up by however much the card grows -- from about a third of the frame to
 *  the whole of it, so better than three times -- and at 1x the headline
 *  would go soft at exactly the moment it is largest and most read. */
const TEXTURE_SCALE = 3

/** The column the card's copy is set in, in CSS pixels.
 *
 *  Wide enough that the body runs eight or nine words to a line, which is
 *  about where prose stops reading as a list and starts reading as prose. */
export const CARD_TEXT_CSS_WIDTH = 460

/** How much wider the painted canvas is than the column of type.
 *
 *  The extra is the SCRIM: a soft dark wash under the words, fading out to
 *  nothing across the right of the canvas and off the top and bottom. The
 *  card's bands pass behind the type and the backdrop is a mid colour, so
 *  white copy on it was legible but weak -- the heading read grey. A scrim is
 *  what every title over an image does, and painting it into the same canvas
 *  costs nothing: no second mesh, no second texture, and it is exactly the
 *  size of the copy it is darkening because it is drawn from the same
 *  measurements. */
const PAINT_SPREAD = 1.62
export const CARD_PAINT_WIDTH = Math.round(CARD_TEXT_CSS_WIDTH * PAINT_SPREAD)
const PAINT_PAD = 44
/** A little room to the left of the type, so the scrim wraps around the
 *  column rather than starting abruptly underneath its first letter. */
const PAINT_LEFT = 26

/** The margin on a canvas with NO scrim: just enough to hold the type's own
 *  drop shadow (blur 10, offset 1), applied to both sides.
 *
 *  THE PLAIN CANVAS IS SYMMETRIC ABOUT THE COLUMN, and that is the whole of
 *  the sky text's placement fix. CARD_PAINT_WIDTH is 1.62x the column
 *  because the SCRIM needs somewhere to fade out to -- but the unscrimmed
 *  path paints no scrim, so a third of every canvas was transparent pixels
 *  hanging off the right of the words. Anything that centred the resulting
 *  plane was centring a box the type did not sit in the middle of: left-hand
 *  blocks ended up hard against the frame's edge and right-hand blocks
 *  floating near the middle of the screen, which is "the text is poorly
 *  placed". Sized to the column instead, the plane's centre IS the column's
 *  centre and mirroring needs no arithmetic at all. */
const PAINT_HALO = 12

/** The canvas width for a given path. The scrimmed one keeps its spread. */
function paintWidthFor(scrim: boolean) {
  return scrim ? CARD_PAINT_WIDTH : CARD_TEXT_CSS_WIDTH + PAINT_HALO * 2
}

/** What a painted block turned out to be, in CSS pixels.
 *
 *  `height` is what this used to return on its own. The rest exists because
 *  a caller placing the plane, or boxing DOM under it, needs to know where
 *  the words actually are rather than where the canvas's edges are. */
export type CardTextMetrics = {
  height: number
  /** The canvas's own width -- 745 scrimmed, 484 plain. */
  width: number
  /** The authored column: the box the type was wrapped into. */
  column: { left: number; right: number }
  /** The ink that was actually laid down, padded by the shadow's reach.
   *  `right` can exceed the column when a word will not break. */
  ink: { left: number; right: number; top: number; bottom: number }
}

const TYPE = { head: 58, headLead: 62, body: 23, bodyLead: 35, eyebrow: 16 }
const TYPE_PORTRAIT = { head: 44, headLead: 48, body: 20, bodyLead: 30, eyebrow: 14 }

/** The family the rest of the site is set in.
 *
 *  next/font rewrites the family name at build time, so it cannot be spelled
 *  here -- it is read off the same custom property the stylesheets use, which
 *  is the one place it is stated. */
function nunito() {
  if (typeof document === "undefined") return "sans-serif"
  const declared = getComputedStyle(document.documentElement).getPropertyValue("--font-nunito").trim()
  return declared ? `${declared}, system-ui, sans-serif` : "system-ui, sans-serif"
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export type CardCopy = { eyebrow: string; text: string; body: string }

/** Draw one card's copy, and report how tall it came out so the plane that
 *  carries it can be given the right proportions.
 *
 *  Left-aligned, always. The old billboard flipped its alignment to rag away
 *  from the subject, because it stood beside him in one half of the frame; a
 *  card is its own picture with its own margin, and type in a picture hangs
 *  off that margin. */
export function paintCardText(
  canvas: HTMLCanvasElement,
  copy: CardCopy,
  ink: string,
  portrait: boolean,
  /** Whether to wash a dark scrim under the words.
   *
   *  ON over a painted card, where the type is white and the picture behind
   *  it is busy and mid-toned. OFF over the open paper sky, which is a pale
   *  flat blue -- there a dark wash is a grey smear with nothing to do, and
   *  the words read better as dark ink straight onto the paper. Getting this
   *  wrong is not subtle: white type with a weak scrim on a light sky came
   *  out all but invisible. */
  scrim = true,
  /** Centre every line instead of hanging them off a left margin.
   *
   *  The parallax captions are centred under the picture, as on the
   *  reference; the drift's blocks are set in a column with a margin and
   *  stay left. */
  centre = false,
) {
  // HALF THE RESOLUTION WITHOUT A SCRIM. The card's copy is painted once
  // and then scaled up as the card opens to fill the screen, so it needs the
  // headroom; the sky's block is placed at a fixed share of the frame and
  // never grows, so at scale 3 it was uploading four megabytes of oversample
  // per beat.
  const s = scrim ? TEXTURE_SCALE : TEXTURE_SCALE - 1
  const W = CARD_TEXT_CSS_WIDTH
  const paintWidth = paintWidthFor(scrim)
  const left = scrim ? PAINT_LEFT : PAINT_HALO
  const T = portrait ? TYPE_PORTRAIT : TYPE
  const family = nunito()
  const ctx = canvas.getContext("2d")!

  // Measured on a throwaway pass first: the height depends on how the body
  // wraps, and the canvas has to be sized before anything can be drawn on it.
  ctx.font = `400 ${T.body}px ${family}`
  const bodyLines = wrap(ctx, copy.body, W)
  ctx.font = `700 ${T.head}px ${family}`
  const headLines = wrap(ctx, copy.text, W)
  const copyHeight = 15 + 18 + headLines.length * T.headLead + 20 + bodyLines.length * T.bodyLead
  const height = copyHeight + PAINT_PAD * 2

  canvas.width = paintWidth * s
  canvas.height = Math.ceil(height) * s
  ctx.setTransform(s, 0, 0, s, 0, 0)
  ctx.textAlign = centre ? "center" : "left"

  // THE SCRIM, painted before the words and shaped to them.
  //
  // Horizontal first: opaque under the column, gone by the right-hand edge of
  // the canvas, so the wash has no visible end -- it simply runs out. Then
  // `destination-in` multiplies what is already there by a vertical fade,
  // which turns the band into a soft 2D patch instead of one with hard edges
  // along the top and bottom. Only the scrim is on the canvas at this point,
  // so nothing else is touched by the composite.
  if (!scrim) {
    // Straight onto the paper. The shadow below still runs, which is what
    // keeps the type off a cloud that happens to pass behind it.
    ctx.shadowColor = "rgba(255, 255, 255, 0.55)"
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 1
    return paintWords(ctx, copy, ink, T, family, bodyLines, headLines, height, centre, left, paintWidth)
  }
  const across = ctx.createLinearGradient(0, 0, CARD_PAINT_WIDTH, 0)
  across.addColorStop(0, "rgba(8, 14, 26, 0.52)")
  across.addColorStop(0.55, "rgba(8, 14, 26, 0.34)")
  across.addColorStop(1, "rgba(8, 14, 26, 0)")
  ctx.fillStyle = across
  ctx.fillRect(0, 0, CARD_PAINT_WIDTH, height)
  const down = ctx.createLinearGradient(0, 0, 0, height)
  down.addColorStop(0, "rgba(0,0,0,0)")
  down.addColorStop(PAINT_PAD / height, "rgba(0,0,0,1)")
  down.addColorStop(1 - PAINT_PAD / height, "rgba(0,0,0,1)")
  down.addColorStop(1, "rgba(0,0,0,0)")
  ctx.globalCompositeOperation = "destination-in"
  ctx.fillStyle = down
  ctx.fillRect(0, 0, CARD_PAINT_WIDTH, height)
  ctx.globalCompositeOperation = "source-over"

  // And the type still carries its own shadow on top of the scrim: the
  // bands behind it are not flat, and a wash alone does not separate a thin
  // stroke from a ridge of the same value crossing underneath it.
  ctx.shadowColor = "rgba(10, 16, 28, 0.55)"
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 2

  return paintWords(ctx, copy, ink, T, family, bodyLines, headLines, height, centre, left, paintWidth)
}

/** The three elements, drawn. Shared by the scrimmed and unscrimmed paths so
 *  the layout cannot drift between them. */
function paintWords(
  ctx: CanvasRenderingContext2D,
  copy: CardCopy,
  ink: string,
  T: typeof TYPE,
  family: string,
  bodyLines: string[],
  headLines: string[],
  height: number,
  centre: boolean,
  left: number,
  paintWidth: number,
): CardTextMetrics {
  // Where a line is anchored: its left margin, or the middle of the column.
  const at = centre ? left + CARD_TEXT_CSS_WIDTH / 2 : left
  // The ink, accumulated as it is drawn. Measured rather than assumed: a
  // long unbreakable word runs past the column, and a caller boxing DOM
  // under the words needs the real edge.
  let inkL = Infinity
  let inkR = -Infinity
  let inkT = Infinity
  let inkB = -Infinity
  const mark = (y: number, text: string) => {
    const m = ctx.measureText(text)
    const w = m.width
    inkL = Math.min(inkL, centre ? at - w / 2 : at)
    inkR = Math.max(inkR, centre ? at + w / 2 : at + w)
    inkT = Math.min(inkT, y - (m.actualBoundingBoxAscent || 0))
    inkB = Math.max(inkB, y + (m.actualBoundingBoxDescent || 0))
  }

  let y = PAINT_PAD + 15
  ctx.font = `700 ${T.eyebrow}px ${family}`
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.78
  // Set BEFORE measuring, not just before drawing: the eyebrow is tracked
  // out and an unspaced measurement understates it by several pixels.
  ctx.letterSpacing = `${(3.4 * T.eyebrow) / 16}px`
  const eyebrow = copy.eyebrow.toUpperCase()
  mark(y, eyebrow)
  ctx.fillText(eyebrow, at, y)
  ctx.letterSpacing = "0px"
  ctx.globalAlpha = 1

  y += 18 + T.head * 0.815
  ctx.font = `700 ${T.head}px ${family}`
  ctx.fillStyle = ink
  headLines.forEach((l) => {
    mark(y, l)
    ctx.fillText(l, at, y)
    y += T.headLead
  })

  y += 20 - T.headLead + T.bodyLead
  ctx.font = `400 ${T.body}px ${family}`
  ctx.globalAlpha = 0.9
  bodyLines.forEach((l) => {
    mark(y, l)
    ctx.fillText(l, at, y)
    y += T.bodyLead
  })
  ctx.globalAlpha = 1

  // Padded by the shadow's reach and clamped into the canvas.
  const clampX = (v: number) => Math.max(0, Math.min(paintWidth, v))
  const clampY = (v: number) => Math.max(0, Math.min(height, v))
  return {
    height,
    width: paintWidth,
    column: { left: at - (centre ? CARD_TEXT_CSS_WIDTH / 2 : 0), right: at + (centre ? CARD_TEXT_CSS_WIDTH / 2 : CARD_TEXT_CSS_WIDTH) },
    ink: {
      left: clampX(inkL - PAINT_HALO),
      right: clampX(inkR + PAINT_HALO),
      top: clampY(inkT - PAINT_HALO),
      bottom: clampY(inkB + PAINT_HALO),
    },
  }
}

/** THE PAGE'S BIG LABEL, painted large and tight for a plane that is then
 *  turned on its side.
 *
 *  The reference sets a bare stat -- "10K", "250K" -- in very heavy type
 *  down the left margin of the page between scenes, rotated ninety degrees.
 *  Our beats carry an eyebrow ("Fact #04") that plays the same part, so this
 *  takes that string and nothing else.
 *
 *  Painted HORIZONTALLY on a canvas sized to the words; the rotation is the
 *  mesh's business, not the texture's. Painting it rotated would mean a
 *  canvas as tall as the label is long, most of it empty, and a texture
 *  whose resolution falls with the length of the string.
 *
 *  Returns the canvas's aspect so the plane can be given the right shape --
 *  the same contract paintCardText has. */
export function paintPageLabel(canvas: HTMLCanvasElement, label: string, ink: string) {
  const family = nunito()
  const size = 150
  const pad = 20
  const probe = canvas.getContext("2d")
  if (!probe) return 1
  probe.font = `900 ${size}px ${family}`
  const width = Math.ceil(probe.measureText(label).width) + pad * 2
  // Cap height plus a little, not the full em box: this is one line of
  // display type and the leading below the baseline is dead space that
  // would push the label off its own margin once rotated.
  const height = Math.ceil(size * 1.06) + pad * 2
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return height / width
  ctx.clearRect(0, 0, width, height)
  ctx.font = `900 ${size}px ${family}`
  ctx.fillStyle = ink
  ctx.textBaseline = "alphabetic"
  ctx.fillText(label, pad, pad + size * 0.84)
  return height / width
}

/** The page's body copy: plain prose, wrapped, centred.
 *
 *  The page between scenes carries the header and this, and nothing else
 *  -- "it will just be the header text that's used as fact # right now,
 *  and actual text which I will add". No scrim and no rule: it is dark ink
 *  on a near-white page, which needs no help.
 *
 *  Returns the canvas's aspect so the plane can be shaped to it, the same
 *  contract paintCardText and paintPageLabel have. */
export function paintPageBody(canvas: HTMLCanvasElement, body: string, ink: string) {
  const family = nunito()
  const size = 30
  const lead = 46
  const pad = 24
  const width = 760
  const probe = canvas.getContext("2d")
  if (!probe) return 1
  probe.font = `400 ${size}px ${family}`
  const lines = wrap(probe, body, width - pad * 2)
  const height = pad * 2 + lines.length * lead
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return height / width
  ctx.clearRect(0, 0, width, height)
  ctx.font = `400 ${size}px ${family}`
  ctx.fillStyle = ink
  ctx.textAlign = "center"
  ctx.textBaseline = "alphabetic"
  let y = pad + size
  for (const line of lines) {
    ctx.fillText(line, width / 2, y)
    y += lead
  }
  return height / width
}
