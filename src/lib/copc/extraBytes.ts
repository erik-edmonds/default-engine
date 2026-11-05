/** Where an extra-bytes dimension sits inside a point record, and how to read it.
 *
 *  WHY THIS IS NOT A CONSTANT, when every other offset in records.ts is. The
 *  core LAS offsets are fixed by the spec -- X at 0, Classification at 16, RGB
 *  at 30 -- and can be module constants. Extra bytes cannot: their position
 *  depends on which dimensions a particular file declares, and in what order.
 *  So this computes them from the file's own Extra Bytes VLR, which copc.js
 *  has already parsed into `copc.eb` by the time anything here runs.
 *
 *  THE LAYOUT RULE, and it is a convention rather than a stored field: extra
 *  dimensions are laid end to end starting immediately after the base PDRF
 *  record, in the order the VLR declares them. Nothing in the file records a
 *  byte offset per dimension -- you are expected to add up the lengths. Both
 *  PDAL (`writers.copc`) and copc.js (`las/extractor.js:createExtras`) do
 *  exactly this, which is why they interoperate.
 *
 *  THE TRAP THIS MODULE EXISTS TO CONTAIN -- and it is a silent, total
 *  data-destroying one:
 *
 *  PDAL writes an extra dimension's `scale` and `offset` fields as literal
 *  0.0, with the options bitmask cleared. That is correct per the spec and
 *  deliberate on PDAL's side -- the comment in its own `ExtraBytesIf` says
 *  "Setting the scale to 0 looks wrong, but it isn't. If the scale option flag
 *  isn't set, the scale is supposed to be 0." A reader that takes the stored
 *  number at face value multiplies every value by zero and renders a dimension
 *  that is uniformly, plausibly, flat.
 *
 *  copc.js gets this right: `ExtraBytes.parseOne` only populates `scale` and
 *  `offset` when the corresponding option flags are set, so on PDAL output
 *  both are `undefined` rather than `0`. The defaults below are therefore the
 *  whole defence, and they are `1` and `0` -- never the stored value.
 */

/** The name PDAL's `filters.hag_nn` and `filters.hag_delaunay` give the
 *  dimension they compute. Matched on exactly, because `writers.copc` leaves
 *  the VLR's `description` field EMPTY -- unlike `writers.las`, it sets only
 *  `name` and `data_type` -- so the name is the only thing to match on. */
export const HAG_DIMENSION = "HeightAboveGround"

/** One entry of the Extra Bytes VLR, as copc.js hands it over. Structurally
 *  `Las.ExtraBytes`, restated here so this module -- and its tests -- do not
 *  need to import copc.js just to describe four fields. */
export interface ExtraByteField {
  name: string
  /** Absent for "undocumented extra bytes" (raw type 0), which carry a length
   *  and no interpretation. Those are unreadable as numbers and are skipped,
   *  but they still OCCUPY their length, so they must be counted when adding
   *  up the offsets of whatever comes after them. */
  type?: "signed" | "unsigned" | "float"
  length: number
  scale?: number
  offset?: number
}

export interface ExtraByteLocation {
  /** Byte offset within ONE point record. */
  byteOffset: number
  type: "signed" | "unsigned" | "float"
  length: number
  /** NOT the VLR's stored value when the flag is unset -- see the header note.
   *  Named `value*` rather than `scale`/`offset` because `offset` already means
   *  a byte position two fields up, and conflating the two is exactly the kind
   *  of mistake this file is trying to prevent. */
  valueScale: number
  valueOffset: number
}

/** Length of one point record EXCLUDING extra bytes, by format.
 *
 *  COPC permits only 6, 7 and 8, but the legacy formats are here because the
 *  arithmetic is the same and a wrong answer would be silent. Mirrors
 *  copc.js's own `getBasePointLength`. */
export function basePointLength(pointDataRecordFormat: number): number {
  switch (pointDataRecordFormat) {
    case 0: return 20
    case 1: return 28
    case 2: return 26
    case 3: return 34
    case 6: return 30
    case 7: return 36
    case 8: return 38
    default:
      throw new Error(`unsupported point data record format: ${pointDataRecordFormat}`)
  }
}

/** Find a named extra dimension, or null when the file does not carry it.
 *
 *  NULL IS THE EXPECTED CASE, not an error. The source file this viewer ships
 *  with has no extra bytes at all, and every path downstream has to work
 *  against it -- the derived, annotated file is an addition, not a
 *  replacement. */
export function locateExtraByte(
  name: string,
  pointDataRecordFormat: number,
  eb: readonly ExtraByteField[],
): ExtraByteLocation | null {
  let byteOffset = basePointLength(pointDataRecordFormat)
  for (const field of eb) {
    if (field.name === name) {
      // An undocumented field (no type) cannot be read as a number even though
      // we found it by name.
      if (!field.type) return null
      if (!readable(field.type, field.length)) return null
      return {
        byteOffset,
        type: field.type,
        length: field.length,
        valueScale: field.scale ?? 1,
        valueOffset: field.offset ?? 0,
      }
    }
    // Counted whether or not it was readable: an unreadable field still takes
    // up space, and skipping its length would misplace everything after it.
    byteOffset += field.length
  }
  return null
}

/** Whether a (type, length) pair is one the LAS spec actually defines. */
function readable(type: "signed" | "unsigned" | "float", length: number): boolean {
  if (type === "float") return length === 4 || length === 8
  return length === 1 || length === 2 || length === 4 || length === 8
}

/** Read one extra-bytes value. `at` is the start of the point record.
 *
 *  Little-endian throughout, as LAS is. 8-byte integers go through `Number`,
 *  which is lossy past 2^53 -- acceptable because nothing this viewer reads
 *  from an extra dimension is a 64-bit identifier, and a Float32Array could
 *  not hold one anyway. */
export function readExtraByte(view: DataView, at: number, loc: ExtraByteLocation): number {
  const o = at + loc.byteOffset
  let raw: number
  if (loc.type === "float") {
    raw = loc.length === 4 ? view.getFloat32(o, true) : view.getFloat64(o, true)
  } else if (loc.type === "signed") {
    raw =
      loc.length === 1 ? view.getInt8(o)
      : loc.length === 2 ? view.getInt16(o, true)
      : loc.length === 4 ? view.getInt32(o, true)
      : Number(view.getBigInt64(o, true))
  } else {
    raw =
      loc.length === 1 ? view.getUint8(o)
      : loc.length === 2 ? view.getUint16(o, true)
      : loc.length === 4 ? view.getUint32(o, true)
      : Number(view.getBigUint64(o, true))
  }
  return raw * loc.valueScale + loc.valueOffset
}
