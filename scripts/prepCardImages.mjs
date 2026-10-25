/** Turn the sky cards' source art into layers the scene can actually stack.
 *
 *  THE PROBLEM THIS SOLVES. The art arrives as `public/images/cards/<n>/
 *  {background,midground,foreground}.jpg`. The midground and foreground are
 *  meant to be transparent overlays -- clouds, cliffs, a cut-out figure --
 *  but JPEG has no alpha channel, so what is actually in the files is the
 *  editor's transparency CHECKERBOARD, baked in as grey pixels. Stacked as
 *  they are, the top layer is opaque and hides everything behind it, and the
 *  "transparent" parts show up as a chequered grid.
 *
 *  THE RIGHT FIX IS TO RE-EXPORT with real alpha (PNG or WebP). This script
 *  exists so the scene works with the files as they stand, and so that it
 *  keeps working when they are replaced: it writes `.webp` beside each
 *  source, the app loads the `.webp`, and a source that already has proper
 *  alpha passes through untouched.
 *
 *  HOW THE KEY WORKS, and why it is not a naive colour match. Two different
 *  checkerboards appear in the current art -- a dark one (tones ~58 and ~101)
 *  and a light one (~200 and ~255) -- and one image is a figure on flat
 *  near-white (~248). So the tones are not hardcoded: each image's own BORDER
 *  RING is sampled, and the dominant ACHROMATIC tones there are what gets
 *  keyed. Two properties make that safe:
 *
 *    - Achromatic only. Every piece of this art is strongly coloured
 *      (purples, pinks), so requiring |max - min| <= CHROMA guarantees the
 *      key cannot bite into the artwork. A black hoodie at (24,24,24) is
 *      achromatic too, but it is nowhere near the sampled tone, so the
 *      distance test excludes it.
 *    - Connected to the edge. The fill starts at the border and spreads, so
 *      an enclosed grey region inside the picture is never removed -- only
 *      background actually reachable from outside.
 *
 *  An image whose border is not mostly achromatic is taken to be finished art
 *  (the backgrounds are), and is converted without a key.
 *
 *  Run: node scripts/prepCardImages.mjs
 */

import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const ROOT = path.join(process.cwd(), "public/images/cards")
const LAYERS = ["background", "midground", "foreground"]

/** How far a channel triple may spread and still count as grey. */
const CHROMA = 14
/** How close a pixel must be to a sampled tone to be keyed, as a squared
 *  Euclidean distance in RGB. 38 per channel is generous enough to absorb
 *  JPEG ringing on a flat field and far tighter than the gap to any of the
 *  artwork's own colours. */
const TONE_TOLERANCE = 54 * 54 * 3
/** A tone must hold at least this share of the border ring to be keyed. Low,
 *  because the decision about whether to key AT ALL is made afterwards from
 *  the result -- see CLEAR_FLOOR. */
const TONE_SHARE = 0.05
/** If keying opens up less than this much of the image, there was no
 *  background there and the alpha is thrown away.
 *
 *  DECIDED BY OUTCOME RATHER THAN BY A THRESHOLD ON THE BORDER, and that is
 *  the whole point. The first version refused to key anything whose border
 *  was under 45% grey, which sounded reasonable and was wrong: the one
 *  foreground with real artwork in it -- cliffs that run right to the edges
 *  of the frame -- measured 40% and was passed through opaque, while the
 *  finished backgrounds measured 21%. Separating those two by a number
 *  between 21 and 40 is a guess that happens to work on five files.
 *
 *  Running the fill and looking at what it opened up needs no such guess. A
 *  checkerboard is half the image; finished art reachable from the edge is a
 *  fraction of a percent, because the fill stops the moment it meets a
 *  colour. */
const CLEAR_FLOOR = 0.05

const grey = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) <= CHROMA

/** The dominant achromatic tones around the edge of the image. */
function borderTones(data, w, h, c) {
  const at = (x, y) => { const i = (y * w + x) * c; return [data[i], data[i + 1], data[i + 2]] }
  const hist = new Map()
  let total = 0
  const note = (x, y) => {
    const [r, g, b] = at(x, y)
    total++
    if (!grey(r, g, b)) return
    const k = Math.round(((r + g + b) / 3) / 6) * 6
    hist.set(k, (hist.get(k) ?? 0) + 1)
  }
  for (let x = 0; x < w; x++) { note(x, 0); note(x, h - 1) }
  for (let y = 0; y < h; y++) { note(0, y); note(w - 1, y) }
  const ranked = [...hist.entries()].sort((a, b) => b[1] - a[1])
  const achromatic = ranked.reduce((n, [, count]) => n + count, 0)
  // Every tone holding at least a twentieth of the ring: a checkerboard
  // contributes two, a flat field one, and noise contributes nothing.
  const tones = ranked.filter(([, count]) => count / total >= TONE_SHARE).map(([k]) => k)
  return { tones, share: achromatic / total }
}

/** Alpha mask: 0 wherever a background tone appears at all, 255 elsewhere.
 *
 *  The companion to keyFromEdges, and the reason both exist. The edge fill is
 *  conservative -- it only removes background it can WALK to from outside --
 *  which leaves any enclosed window of checkerboard in place. One survived in
 *  the first pass: a chequered patch sitting in a gap between two clouds,
 *  fully ringed by artwork, visible in the composite as a grey grid.
 *
 *  Keying the tones everywhere fixes that and is riskier, because artwork
 *  that happens to be grey would go with it -- white cloud highlights against
 *  a light checkerboard are the obvious hazard. So neither is trusted on its
 *  own: the caller runs both and compares. */
function keyEverywhere(data, w, h, c, tones) {
  const alpha = new Uint8Array(w * h).fill(255)
  for (let p = 0; p < w * h; p++) {
    const i = p * c
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (!grey(r, g, b)) continue
    for (const t of tones) {
      if ((r - t) ** 2 + (g - t) ** 2 + (b - t) ** 2 <= TONE_TOLERANCE) { alpha[p] = 0; break }
    }
  }
  return alpha
}

/** Alpha mask: 0 where background-like pixels reach the edge, 255 elsewhere. */
function keyFromEdges(data, w, h, c, tones) {
  const isBackground = (i) => {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (!grey(r, g, b)) return false
    for (const t of tones) {
      const d = (r - t) ** 2 + (g - t) ** 2 + (b - t) ** 2
      if (d <= TONE_TOLERANCE) return true
    }
    return false
  }
  const alpha = new Uint8Array(w * h).fill(255)
  // An explicit stack rather than recursion: a million-pixel flood fill blows
  // the call stack several times over.
  const stack = []
  const push = (x, y) => {
    const p = y * w + x
    if (alpha[p] === 0) return
    if (!isBackground(p * c)) return
    alpha[p] = 0
    stack.push(p)
  }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1) }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y) }
  while (stack.length) {
    const p = stack.pop()
    const x = p % w
    const y = (p / w) | 0
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }
  return alpha
}

/** Pull the opaque region in by one pixel, then soften the edge.
 *
 *  JPEG blends across every hard edge, so the outermost ring of "artwork"
 *  pixels is really artwork mixed with checkerboard -- left in, it reads as a
 *  grey halo around every cliff. Eroding removes that ring and the blur stops
 *  the new edge looking cut out with scissors. */
function erodeAndFeather(alpha, w, h) {
  const eroded = new Uint8Array(alpha)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      if (alpha[p] === 0) continue
      if (alpha[p - 1] === 0 || alpha[p + 1] === 0 || alpha[p - w] === 0 || alpha[p + w] === 0) eroded[p] = 0
    }
  }
  const out = new Uint8Array(eroded)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      let sum = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += eroded[p + dy * w + dx]
      out[p] = Math.round(sum / 9)
    }
  }
  return out
}

const folders = (await readdir(ROOT, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

for (const folder of folders) {
  for (const layer of LAYERS) {
    const src = path.join(ROOT, folder, `${layer}.jpg`)
    try { await stat(src) } catch { console.log(`  ${folder}/${layer}  -- no source`); continue }

    const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true })
    const { width: w, height: h, channels: c } = info
    const { tones, share } = borderTones(data, w, h, c)

    const share0 = (mask) => { let n = 0; for (let p = 0; p < w * h; p++) if (mask[p] === 0) n++; return n / (w * h) }
    let alpha = null
    let openedShare = 0
    let how = "edge"
    if (tones.length) {
      const edge = keyFromEdges(data, w, h, c, tones)
      const everywhere = keyEverywhere(data, w, h, c, tones)
      const edgeShare = share0(edge)
      const allShare = share0(everywhere)
      // THE TWO MASKS CHECK EACH OTHER. Filling the enclosed holes should
      // remove a little more than the edge fill did; if it removes a great
      // deal more, the tones are matching artwork rather than background and
      // the global pass is eating the picture. A quarter again is the line:
      // holes are small by nature, and anything larger is not a hole.
      const useAll = allShare <= edgeShare * 1.25
      how = useAll ? "edge+holes" : "edge only (global pass would have taken " + Math.round(allShare * 100) + "%)"
      alpha = erodeAndFeather(useAll ? everywhere : edge, w, h)
      openedShare = useAll ? allShare : edgeShare
    }
    // Nothing meaningful came away -- this is finished art, not art on a
    // checkerboard. Drop the mask rather than ship a few nibbled corners.
    if (alpha && openedShare < CLEAR_FLOOR) alpha = null

    const rgba = Buffer.alloc(w * h * 4)
    let clear = 0
    for (let p = 0; p < w * h; p++) {
      rgba[p * 4] = data[p * c]
      rgba[p * 4 + 1] = data[p * c + 1]
      rgba[p * 4 + 2] = data[p * c + 2]
      const a = alpha ? alpha[p] : 255
      rgba[p * 4 + 3] = a
      if (a < 128) clear++
    }
    const out = path.join(ROOT, folder, `${layer}.webp`)
    await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .webp({ quality: 82, alphaQuality: 90 })
      .toFile(out)
    const kb = Math.round((await stat(out)).size / 1024)
    const pct = Math.round((clear / (w * h)) * 100)
    console.log(
      `  ${folder}/${layer}`.padEnd(24) +
        `${w}x${h}`.padEnd(11) +
        `border grey ${Math.round(share * 100)}%`.padEnd(18) +
        (alpha ? `keyed ${how} -> ${pct}% clear` : `opaque (fill opened ${Math.round(openedShare * 100)}%)`).padEnd(44) +
        ` ${kb}K`,
    )
  }
}
