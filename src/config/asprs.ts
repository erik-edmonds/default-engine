/** ASPRS classification codes, the colour each one draws as, and the
 *  height-above-ground ramp.
 *
 *  THE VIEW records.ts HAS BEEN WAITING FOR. The classification byte has been
 *  parsed since the first version of the decoder, with a comment saying it is
 *  "kept because it is nearly free here and is what any later classification
 *  view will colour by". This is that view.
 *
 *  Codes are from the ASPRS LAS 1.4 R15 specification, table "ASPRS Standard
 *  Point Classes". 0-22 are defined, 23-63 are reserved, and 64-255 are
 *  user-definable -- so the palette has to answer for all 256 values and not
 *  just the ones with names.
 */

// `with { type: "json" }` IS LOAD-BEARING, not decoration. Turbopack resolves
// a bare JSON import happily, but this module is also imported by the
// pure-arithmetic test suite under `node --experimental-strip-types`, and
// node's ESM loader REFUSES a JSON module without the attribute
// (ERR_IMPORT_ATTRIBUTE_MISSING). Leaving it off means the bands are untestable
// off a browser, which is the one place the pipeline's thresholds and the
// viewer's legend can be checked against each other.
import bands from "./hagBands.json" with { type: "json" }

/** The three ways the cloud can be coloured, and the integer the shader's
 *  `uColorMode` uniform holds for each.
 *
 *  HERE RATHER THAN BESIDE THE SHADER, and the reason is a build constraint
 *  rather than taste: lib/scan/pointMaterial.ts imports three, and both the
 *  readout (helpers/scanStats.ts) and the pure-arithmetic test harness, which
 *  runs under `node --experimental-strip-types` with no WebGL, need to name
 *  these. This module imports one JSON file and nothing else, so it is the one
 *  place all three can reach. */
export const COLOR_MODE = { rgb: 0, class: 1, height: 2 } as const
export type ColorModeName = keyof typeof COLOR_MODE

/** In menu order. `height` is last because it is the only one that can be
 *  unavailable -- a file that has not been through the pipeline has no height
 *  dimension to draw. */
export const COLOR_MODES: readonly ColorModeName[] = ["rgb", "class", "height"]

export const COLOR_MODE_LABELS: Record<ColorModeName, string> = {
  rgb: "True",
  class: "Class",
  height: "Height",
}

export interface AsprsClass {
  code: number
  label: string
  /** sRGB hex, as authored. Converted to linear once, below -- see the note on
   *  CLASS_PALETTE for why the shader must never receive these directly. */
  color: string
}

/** AUTHORED FOR A HEADSET, not for a GIS legend.
 *
 *  Two constraints the usual ASPRS colour schemes do not have to meet. First,
 *  these sit against a black void at 1:1 with no ambient light, so very dark
 *  colours vanish entirely rather than reading as dark. Second, the whole
 *  point of the class view in an agricultural QA pass is to separate GROUND
 *  from CANOPY at a glance and to make NOISE impossible to miss -- so the
 *  three vegetation classes are a deliberate progression of one hue, ground is
 *  the one warm earth tone, and noise is magenta, which appears nowhere in
 *  nature and nowhere else in this table. */
export const ASPRS_CLASSES: readonly AsprsClass[] = [
  { code: 0, label: "never classified", color: "#55606b" },
  { code: 1, label: "unclassified", color: "#8a97a3" },
  { code: 2, label: "ground", color: "#b0793f" },
  { code: 3, label: "low vegetation", color: "#bcd97a" },
  { code: 4, label: "medium vegetation", color: "#6ab04a" },
  { code: 5, label: "high vegetation", color: "#1f7a3a" },
  { code: 6, label: "building", color: "#e07a3f" },
  { code: 7, label: "low noise", color: "#ff3fd0" },
  { code: 8, label: "reserved", color: "#55606b" },
  { code: 9, label: "water", color: "#3f8fd9" },
  { code: 10, label: "rail", color: "#9b6fd9" },
  { code: 11, label: "road", color: "#6f7681" },
  { code: 12, label: "reserved", color: "#55606b" },
  { code: 13, label: "wire guard", color: "#d9c23f" },
  { code: 14, label: "wire conductor", color: "#d9a53f" },
  { code: 15, label: "transmission tower", color: "#c08a5a" },
  { code: 16, label: "wire connector", color: "#d9893f" },
  { code: 17, label: "bridge deck", color: "#a86f4a" },
  { code: 18, label: "high noise", color: "#ff3fd0" },
  { code: 19, label: "overhead structure", color: "#c2708f" },
  { code: 20, label: "ignored ground", color: "#7a5c3a" },
  { code: 21, label: "snow", color: "#e8f1f5" },
  { code: 22, label: "temporal exclusion", color: "#4a4f55" },
]

/** Reserved (23-63) and user-definable (64-255) codes. Visibly NOT one of the
 *  named colours, so a file using a private scheme reads as "this viewer does
 *  not know what these are" rather than as a wrong label. */
export const UNKNOWN_CLASS_COLOR = "#2f3a44"

/** Re-exported individually so callers name the one value they need rather
 *  than reaching through the JSON.
 *
 *  ONLY WHAT IS ACTUALLY USED. An earlier draft of this file also carried an
 *  `AG_CLASS_CODES` ordering, a `classLabel` lookup and an `OTHER_CLASS`
 *  constant, all plausible and none referenced anywhere. They are gone,
 *  because this repo already has a scar from exactly that: XR_POINT_MIN_PX and
 *  XR_POINT_MAX_PX sat in config/xrScan.ts imported by nothing for a whole
 *  phase, documented as though they were in force, while a flat 1.6px was what
 *  actually drew. An unused export that reads like a decision is worse than no
 *  export, and adding one back is a single line. */
export const HAG_BANDS = bands.bands
export const HAG_NEAR_GROUND_M = bands.nearGroundM
export const HAG_RAMP_MAX_M = bands.heightRampMaxM
export const GROUND_CLASS = bands.groundClass
export const NOISE_CLASS = bands.noiseClass

/** sRGB (0..1) -> linear (0..1), the exact IEC 61966-2-1 transfer function
 *  rather than a 2.2 power approximation.
 *
 *  Exact because it is run 256 times at module load and never again, so the
 *  cheap approximation buys nothing, and because the two differ most in the
 *  darks -- which is where `#2f3a44` and `#4a4f55` live. */
export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [
    srgbToLinear(((n >> 16) & 0xff) / 255),
    srgbToLinear(((n >> 8) & 0xff) / 255),
    srgbToLinear((n & 0xff) / 255),
  ]
}

/** 256 RGBA entries, LINEAR, as Float32 -- a lookup table indexed by the
 *  classification byte itself.
 *
 *  WHY A TEXTURE AND NOT A UNIFORM ARRAY. A `uniform vec3 colors[32]` indexed
 *  by a value read from an attribute is a DYNAMIC index into a uniform array,
 *  and GLSL ES 1.00 only guarantees constant-index-expressions there. three's
 *  own shaders only ever index uniform arrays with bounded loop counters,
 *  which do qualify. A classification byte does not. A texture fetch has no
 *  such restriction, needs no branching, and covers all 256 codes including
 *  the user-definable range for the same cost as covering 23.
 *
 *  WHY FLOAT32 AND NOT BYTES. The shader writes linear and three applies the
 *  sRGB transfer function on output, so the palette has to BE linear. Linear
 *  values in 8 bits band visibly in the darks, and this table is tiny -- 256
 *  texels, 4 KB -- so there is no reason to quantise it.
 *
 *  WHY LINEAR AT ALL, which is the part that is easy to get wrong: the scan
 *  canvas passes no `linear` prop, so r3f sets `outputColorSpace` to sRGB and
 *  three's `colorspace_fragment` chunk encodes whatever the shader produced.
 *  Handing it sRGB values means encoding them twice. */
export function buildClassPalette(): Float32Array {
  const data = new Float32Array(256 * 4)
  const [ur, ug, ub] = hexToLinear(UNKNOWN_CLASS_COLOR)
  for (let i = 0; i < 256; i++) {
    data[i * 4] = ur
    data[i * 4 + 1] = ug
    data[i * 4 + 2] = ub
    data[i * 4 + 3] = 1
  }
  for (const { code, color } of ASPRS_CLASSES) {
    const [r, g, b] = hexToLinear(color)
    data[code * 4] = r
    data[code * 4 + 1] = g
    data[code * 4 + 2] = b
    data[code * 4 + 3] = 1
  }
  return data
}

/** The height ramp's stops, in sRGB, dark-to-light with increasing height.
 *
 *  A SEQUENTIAL ramp, not a rainbow. Height is an ordered quantity and a
 *  rainbow ramp is the standard way to make an ordered quantity unreadable:
 *  nobody can say whether cyan is above or below yellow without checking the
 *  legend every time. Luminance increasing monotonically means the picture is
 *  readable without one, and survives being looked at out of the corner of
 *  your eye in a headset. */
export const HAG_RAMP: readonly string[] = ["#20323f", "#2f6b6e", "#5aa85f", "#c9d36a", "#f5efc8"]

/** The ramp as a 256-texel linear lookup, built the same way and for the same
 *  reasons as the class palette. Sampling a texture also means the ramp's
 *  shape lives here in TypeScript rather than as `mix` calls in GLSL. */
export function buildHagRamp(): Float32Array {
  const stops = HAG_RAMP.map(hexToLinear)
  const data = new Float32Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1)
    const lo = Math.min(Math.floor(t), stops.length - 2)
    const f = t - lo
    for (let c = 0; c < 3; c++) {
      data[i * 4 + c] = stops[lo][c] * (1 - f) + stops[lo + 1][c] * f
    }
    data[i * 4 + 3] = 1
  }
  return data
}

/** Which band a height falls in, in metres, or null for near-ground.
 *
 *  The viewer's answer to the same question the pipeline answers in PDAL. Kept
 *  here so the readout can name what it is looking at, and so the agreement
 *  between the two is testable without running PDAL. */
export function bandForHeight(metres: number): { class: number; label: string } | null {
  for (const b of bands.bands) {
    if (metres >= b.minM && (b.maxM === null || metres < b.maxM)) {
      return { class: b.class, label: b.label }
    }
  }
  return null
}
