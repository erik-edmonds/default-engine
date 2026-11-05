/** Raw LAS point records -> the typed arrays three.js draws from.
 *
 *  WHY THIS IS HAND-ROLLED, when copc.js ships `loadPointDataView` with named
 *  getters: that view resolves a dimension by string and calls a function per
 *  point per dimension. For a 100,000-point node that is 600,000 property
 *  lookups and calls to produce three floats each. This reads the same bytes
 *  with a DataView in one pass, and it runs in a worker where the main thread
 *  cannot feel it either way.
 *
 *  THE RISK THAT BUYS, AND HOW IT IS PAID FOR: an off-by-one in the offsets
 *  below does not throw. It produces a point cloud with subtly wrong
 *  coordinates or swapped colour channels -- the exact failure mode flagged
 *  for the 0.0.x decoder stack. So `scripts/copc-golden.mjs` decodes a real
 *  node both ways and asserts this parser agrees with copc.js's own view,
 *  point for point. That test is the only reason this file is allowed to
 *  exist; if you change an offset here, run it.
 *
 *  Layout, from the ASPRS LAS 1.4 R15 spec. PDRF 6 is the 30-byte base that
 *  every COPC point format extends (COPC permits only 6, 7 and 8):
 *
 *      0   X                int32      scaled
 *      4   Y                int32      scaled
 *      8   Z                int32      scaled
 *     12   Intensity        uint16
 *     14   return bits      uint8
 *     15   flag bits        uint8
 *     16   Classification   uint8
 *     17   User Data        uint8
 *     18   Scan Angle       int16
 *     20   Point Source ID  uint16
 *     22   GPS Time         float64
 *     30   (end of PDRF 6)
 *
 *  PDRF 7 appends Red/Green/Blue as uint16 at 30/32/34, giving 36 bytes.
 *  PDRF 8 appends NIR as uint16 at 36, giving 38. So the colour offset is the
 *  same for both, and PDRF 6 simply has none.
 *
 *  EXTRA BYTES ARE THE ONE THING THAT CANNOT BE A CONSTANT HERE, because where
 *  they sit depends on what the file declares. Their offset arrives already
 *  resolved, as an ExtraByteLocation -- see extraBytes.ts, which also explains
 *  why a stored scale of 0 must never be believed. */

import { readExtraByte, type ExtraByteLocation } from "./extraBytes"

/** Byte offsets within one point record. Constant across PDRF 6, 7 and 8. */
const X = 0
const Y = 4
const Z = 8
const CLASSIFICATION = 16
/** Only present on PDRF 7 and 8. */
const RGB = 30

export interface Scaling {
  scale: [number, number, number]
  offset: [number, number, number]
}

export interface DecodedNode {
  /** xyz, metres (or whatever the file's CRS uses), RELATIVE to `origin`. */
  position: Float32Array
  /** rgb, 0..1, three per point. Empty when the file carries no colour. */
  color: Float32Array
  /** One per point. Kept because it is nearly free here and is what the
   *  classification view in config/asprs.ts colours by. */
  classification: Uint8Array
  /** Height above the interpolated ground surface, one per point, in FILE
   *  UNITS -- the same units as `position`, because it is a length in the same
   *  space and converting it here would make it the only quantity in this
   *  struct that is not.
   *
   *  EMPTY IS THE NORMAL CASE, not a failure. It is only populated for a file
   *  the annotation pipeline has been through; the source survey this viewer
   *  ships with has no extra dimensions at all. Everything downstream has to
   *  handle a zero-length array, which is the same contract `color` already
   *  has for a PDRF 6 file. */
  hag: Float32Array
  /** 256 bins, one per possible classification byte, counting this node.
   *
   *  COMPUTED HERE AND NOT ON THE FRAME THREAD. The readout wants "what is
   *  this cloud made of", which is a pass over a few hundred thousand bytes
   *  per node -- cheap, but not cheap enough to do once a second on the thread
   *  that draws the frame, on a route whose whole purpose is measuring its own
   *  frame times. Summing 256-bin histograms across the resident set is
   *  instead trivial, and summing is all the main thread ever does.
   *
   *  Deliberately NOT a percentage and NOT sorted: a count composes under
   *  addition and a percentage does not. */
  classHistogram: Uint32Array
  /** Tallest point in this node, in file units. 0 when the file has no height
   *  dimension. A max rather than a percentile because a percentile cannot be
   *  combined across nodes from per-node summaries -- the honest place for
   *  percentiles is the pipeline, over every point, into scan_stats. */
  hagMax: number
  pointCount: number
}

/** WHY POSITIONS ARE RELATIVE TO AN ORIGIN.
 *
 *  Autzen's coordinates are Oregon state plane: x ~637,905, y ~851,209. A
 *  Float32 has 24 bits of mantissa, so near 1e6 its spacing is about 0.06 --
 *  six centimetres. The file's own scale is 0.01, so storing absolute
 *  coordinates in the Float32Array three.js needs would throw away more
 *  precision than the survey has, and the cloud visibly quantises into slabs.
 *
 *  Subtracting a per-file origin first (the octree centre is the natural
 *  choice) brings every value into a few thousand units of zero, where
 *  Float32 spacing is well under a millimetre. The origin goes back on the
 *  <points> object's own position, so the scene graph is correct and nothing
 *  downstream has to know. */
export function decodeRecords(
  records: Uint8Array,
  pointCount: number,
  pointDataRecordLength: number,
  pointDataRecordFormat: number,
  { scale, offset }: Scaling,
  origin: [number, number, number],
  /** Where height-above-ground lives in this file, or null when it does not.
   *  Resolved ONCE per file by CopcSource rather than per node here: it is the
   *  same answer for every node, and this function runs a few hundred times a
   *  session. */
  hagLocation: ExtraByteLocation | null = null,
): DecodedNode {
  const view = new DataView(records.buffer, records.byteOffset, records.byteLength)
  const position = new Float32Array(pointCount * 3)
  const hasColor = pointDataRecordFormat === 7 || pointDataRecordFormat === 8
  const color = hasColor ? new Float32Array(pointCount * 3) : new Float32Array(0)
  const classification = new Uint8Array(pointCount)
  const hag = hagLocation ? new Float32Array(pointCount) : new Float32Array(0)
  const classHistogram = new Uint32Array(256)
  let hagMax = 0

  // 16-BIT COLOUR THAT IS ACTUALLY 8-BIT IS THE COMMON CASE.
  //
  // LAS stores colour as uint16, but a great many writers put 0..255 into it
  // unscaled -- the PLY->LAS path is notorious for it. Dividing by 65535
  // regardless would render those files essentially black. So: scan first,
  // and pick the divisor from what is actually there. A single pass over the
  // red channel is enough to tell 0..255 from 0..65535.
  let peak = 0
  if (hasColor) {
    for (let i = 0; i < pointCount; i++) {
      const r = view.getUint16(i * pointDataRecordLength + RGB, true)
      if (r > peak) peak = r
    }
  }
  const colorDivisor = peak > 255 ? 65535 : 255

  for (let i = 0; i < pointCount; i++) {
    const at = i * pointDataRecordLength
    const o = i * 3
    position[o] = view.getInt32(at + X, true) * scale[0] + offset[0] - origin[0]
    position[o + 1] = view.getInt32(at + Y, true) * scale[1] + offset[1] - origin[1]
    position[o + 2] = view.getInt32(at + Z, true) * scale[2] + offset[2] - origin[2]
    const cls = view.getUint8(at + CLASSIFICATION)
    classification[i] = cls
    classHistogram[cls]++
    if (hasColor) {
      color[o] = view.getUint16(at + RGB, true) / colorDivisor
      color[o + 1] = view.getUint16(at + RGB + 2, true) / colorDivisor
      color[o + 2] = view.getUint16(at + RGB + 4, true) / colorDivisor
    }
    // NOT origin-relative, and not rotated: this is a height, not a position.
    // Subtracting an origin from it or sending it through the group's -90
    // degrees about X would both be category errors that happen to typecheck.
    if (hagLocation) {
      const h = readExtraByte(view, at, hagLocation)
      hag[i] = h
      if (h > hagMax) hagMax = h
    }
  }

  return { position, color, classification, hag, classHistogram, hagMax, pointCount }
}
