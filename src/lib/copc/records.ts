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
 *  same for both, and PDRF 6 simply has none. */

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
  /** One per point. Kept because it is nearly free here and is what any
   *  later classification view will colour by. */
  classification: Uint8Array
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
): DecodedNode {
  const view = new DataView(records.buffer, records.byteOffset, records.byteLength)
  const position = new Float32Array(pointCount * 3)
  const hasColor = pointDataRecordFormat === 7 || pointDataRecordFormat === 8
  const color = hasColor ? new Float32Array(pointCount * 3) : new Float32Array(0)
  const classification = new Uint8Array(pointCount)

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
    classification[i] = view.getUint8(at + CLASSIFICATION)
    if (hasColor) {
      color[o] = view.getUint16(at + RGB, true) / colorDivisor
      color[o + 1] = view.getUint16(at + RGB + 2, true) / colorDivisor
      color[o + 2] = view.getUint16(at + RGB + 4, true) / colorDivisor
    }
  }

  return { position, color, classification, pointCount }
}
