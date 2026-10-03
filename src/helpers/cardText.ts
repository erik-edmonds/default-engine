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
) {
  const s = TEXTURE_SCALE
  const W = CARD_TEXT_CSS_WIDTH
  const T = portrait ? TYPE_PORTRAIT : TYPE
  const family = nunito()
  const ctx = canvas.getContext("2d")!

  // Measured on a throwaway pass first: the height depends on how the body
  // wraps, and the canvas has to be sized before anything can be drawn on it.
  ctx.font = `400 ${T.body}px ${family}`
  const bodyLines = wrap(ctx, copy.body, W)
  ctx.font = `700 ${T.head}px ${family}`
  const headLines = wrap(ctx, copy.text, W)
  const height = 15 + 18 + headLines.length * T.headLead + 20 + bodyLines.length * T.bodyLead

  canvas.width = W * s
  canvas.height = Math.ceil(height) * s
  ctx.setTransform(s, 0, 0, s, 0, 0)
  ctx.textAlign = "left"

  // The card's own backdrop is a flat mid colour and its bands pass behind
  // the type, so the words bring their own contrast rather than trusting
  // whatever happens to be behind them at the time.
  ctx.shadowColor = "rgba(10, 16, 28, 0.5)"
  ctx.shadowBlur = 16
  ctx.shadowOffsetY = 2

  let y = 15
  ctx.font = `700 ${T.eyebrow}px ${family}`
  ctx.fillStyle = ink
  ctx.globalAlpha = 0.78
  ctx.letterSpacing = `${(3.4 * T.eyebrow) / 16}px`
  ctx.fillText(copy.eyebrow.toUpperCase(), 0, y)
  ctx.letterSpacing = "0px"
  ctx.globalAlpha = 1

  y += 18 + T.head * 0.815
  ctx.font = `700 ${T.head}px ${family}`
  ctx.fillStyle = ink
  headLines.forEach((l) => {
    ctx.fillText(l, 0, y)
    y += T.headLead
  })

  y += 20 - T.headLead + T.bodyLead
  ctx.font = `400 ${T.body}px ${family}`
  ctx.globalAlpha = 0.9
  bodyLines.forEach((l) => {
    ctx.fillText(l, 0, y)
    y += T.bodyLead
  })
  ctx.globalAlpha = 1
  return height
}
