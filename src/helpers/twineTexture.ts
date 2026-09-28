import * as THREE from "three"

/** A twisted-cord surface for the strings the paper world hangs from.
 *
 *  A smooth cylinder in a flat colour is a tube -- the note was "it still looks
 *  like a paper towel roll, not a rope". What makes cord read as cord is the
 *  LAY: two or three plies spiralling around each other, so the surface is a
 *  run of diagonal ridges with a shadowed groove between each pair, and the
 *  highlight travels around the cord rather than down it.
 *
 *  Drawn into a tileable 64x64 canvas rather than shipped as an image, because
 *  the pattern is a formula and an asset would be another 30KB to load before
 *  the sky can dress itself.
 *
 *  TILEABLE IN BOTH DIRECTIONS, which is the only real constraint. On a
 *  cylinder u wraps the circumference and v runs the length, so the ply phase
 *  is `PLIES * u + v`: it advances a whole number of periods across one wrap
 *  (u 0 -> 1) and exactly one across one tile of length (v 0 -> 1). Both seams
 *  therefore meet, and a caller can repeat it any whole number of times up a
 *  rope of any length without a visible join.
 *
 *  Returned as two textures over the same canvas: a colour map, which must be
 *  decoded as sRGB, and a bump map, which must not. Sharing one Texture for
 *  both would have to pick one decode and be wrong for the other. */

const SIZE = 64
/** Strands in the lay. Three is the common hardware-store twine. */
export const TWINE_PLIES = 3

/** Jute, and the two ends of its shading. The mid colour is close to the flat
 *  ROPE_COLOR the strings used before, so the change reads as relief appearing
 *  on the same string rather than as a different material. */
const CROWN: [number, number, number] = [0xe0, 0xc6, 0x9b]
const GROOVE: [number, number, number] = [0x6f, 0x5a, 0x3c]

function frac(x: number) {
  return x - Math.floor(x)
}

function drawCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas")
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext("2d")!
  const image = ctx.createImageData(SIZE, SIZE)
  const data = image.data

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE
      const v = y / SIZE

      // Where this pixel sits across the ply it belongs to: 0 and 1 are the
      // grooves either side, 0.5 is the crown.
      const t = frac(TWINE_PLIES * u + v)

      // A round strand, not a sine ridge. The exponent flattens the crown and
      // steepens the shoulders, which is what a twisted fibre bundle does --
      // most of the strand faces you, and it falls away quickly at the groove.
      let shade = Math.pow(Math.sin(Math.PI * t), 0.45)

      // Fibre. Coarse enough to survive the mip chain a few levels down, and
      // biased along the strand rather than across it, since that is the way
      // the fibres run. Hashed rather than random so the texture is identical
      // between reloads and between the server and the client.
      const along = frac(Math.sin((t * 12.9898 + v * 78.233) * 43758.5453))
      const across = frac(Math.sin((x * 4.1414 + y * 0.7331) * 1234.5678))
      shade *= 0.88 + 0.12 * along
      shade *= 0.94 + 0.06 * across

      const i = (y * SIZE + x) * 4
      data[i] = GROOVE[0] + (CROWN[0] - GROOVE[0]) * shade
      data[i + 1] = GROOVE[1] + (CROWN[1] - GROOVE[1]) * shade
      data[i + 2] = GROOVE[2] + (CROWN[2] - GROOVE[2]) * shade
      data[i + 3] = 255
    }
  }

  ctx.putImageData(image, 0, 0)
  return canvas
}

let cached: { map: THREE.Texture; bump: THREE.Texture } | null = null

/** The shared source textures. Never handed to a material directly -- each
 *  rope needs its own `repeat.y` (see makeTwineTextures), and repeat lives on
 *  the Texture, not the material. */
function source() {
  // Lazily, because this module is imported into a tree that renders on the
  // server as well, and there is no `document` there to draw into.
  if (!cached) {
    const canvas = drawCanvas()
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    const bump = new THREE.CanvasTexture(canvas)
    cached = { map, bump }
  }
  return cached
}

/** A private pair of textures for one rope.
 *
 *  Cloned rather than shared: every rope is a different length and wants a
 *  different number of tiles up it to keep the lay the same physical size, and
 *  that count is a property of the Texture. Clones share the canvas, so the
 *  extra cost is one small upload each and no extra drawing. */
export function makeTwineTextures() {
  const base = source()
  const map = base.map.clone()
  const bump = base.bump.clone()
  for (const t of [map, bump]) {
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
    t.needsUpdate = true
  }
  map.colorSpace = THREE.SRGBColorSpace
  return { map, bump }
}

/** How many tiles fit up a rope of this length and radius.
 *
 *  A whole number, so the seam at the top of each tile lands on the seam at
 *  the bottom of the next; anything else leaves a ring of mismatched strands
 *  every tile. The target is a LAY LENGTH -- the distance a single strand takes
 *  to go once around -- of about four diameters, which is what hardware twine
 *  does. One tile carries 1/PLIES of a lay, hence the factor. */
export function twineRepeat(length: number, radius: number) {
  const lay = radius * 8
  return Math.max(1, Math.round((TWINE_PLIES * length) / lay))
}
