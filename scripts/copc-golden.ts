/** Does our hand-rolled LAS record parser agree with copc.js's own reader?
 *
 *  THE FIRST TEST IN THIS REPO, and it exists for one specific failure. The
 *  decoder stack (`copc@0.0.9`, `laz-perf@0.0.7`) is 0.0.x and
 *  single-maintainer, and `src/lib/copc/records.ts` reads the same bytes by
 *  hand for speed. Neither of those fails loudly: a wrong byte offset or a
 *  bad dependency bump produces a point cloud with subtly wrong coordinates
 *  or swapped colour channels, which looks plausible and is wrong.
 *
 *  So this decodes a real node two ways -- through copc.js's named-getter
 *  View, and through our parser -- and asserts they agree point for point.
 *  copc.js is the oracle; we are the thing under test.
 *
 *  Run:  node --experimental-strip-types --import ./scripts/alias-hook.mjs \
 *        scripts/copc-golden.ts
 *  (node 22+; it reads a public file over the network, so it needs one.)
 *
 *  THE RESOLVER HOOK IS NOW REQUIRED, where it used to be optional. This
 *  script's own imports carry explicit `.ts` extensions, but `records.ts` now
 *  imports `./extraBytes` the way the rest of `src/` is written -- extensionless
 *  -- and node's ESM resolver does not search extensions, because that is a
 *  CommonJS behaviour ESM deliberately dropped. The hook does it instead, which
 *  is exactly what it was written for.
 *
 *  `scripts/` is excluded from tsconfig, because node's type-stripping needs
 *  the explicit `.ts` import extensions below and tsc rejects them without
 *  `allowImportingTsExtensions` -- which would change how the whole app
 *  resolves imports for the sake of one standalone script. The script is run
 *  by hand, by a runtime that strips types rather than checks them, so it
 *  loses nothing.
 */
import { Copc, Hierarchy } from "copc"

import { decodeRecords } from "../src/lib/copc/records.ts"
import { HAG_DIMENSION, locateExtraByte } from "../src/lib/copc/extraBytes.ts"
import { SCANS } from "../src/config/scans.ts"

/** Point it at a different file with `--url`, which is how the ANNOTATED
 *  derivative gets tested:
 *
 *    node --experimental-strip-types scripts/copc-golden.ts \
 *      --url https://bucket.s3.amazonaws.com/autzen.annotated.copc.laz
 *
 *  That matters because the extra-bytes assertions below are the only check on
 *  an offset that is now COMPUTED rather than constant, and the sample survey
 *  carries no extra bytes at all -- so against the default URL they report
 *  honestly that they could not run, rather than passing vacuously. */
const urlFlag = process.argv.indexOf("--url")
const URL_ = urlFlag >= 0 ? process.argv[urlFlag + 1] : SCANS.autzen.url
const SAMPLE = 100

let failures = 0
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`)
}

let requests = 0
let bytes = 0
const getter = async (begin: number, end: number) => {
  requests++
  const response = await fetch(URL_, { headers: { Range: `bytes=${begin}-${end - 1}` } })
  if (!response.ok) throw new Error(`range failed: ${response.status}`)
  const buffer = await response.arrayBuffer()
  bytes += buffer.byteLength
  return new Uint8Array(buffer)
}

const copc = await Copc.create(getter)
check(
  "the file opens and is a COPC",
  copc.header.pointCount > 0 && copc.info.spacing > 0,
  `${copc.header.pointCount.toLocaleString()} points, PDRF ${copc.header.pointDataRecordFormat}, ` +
    `record ${copc.header.pointDataRecordLength}B, spacing ${copc.info.spacing.toFixed(4)}`,
)
check(
  "opening it cost exactly two range requests",
  requests === 2,
  `${requests} requests, ${bytes} bytes -- the 589-byte header+VLR, then the root hierarchy page`,
)

const root = await Hierarchy.load(getter, copc.info.rootHierarchyPage)
const keys = Object.keys(root.nodes)
check("the root hierarchy page lists nodes", keys.length > 0, `${keys.length} nodes, ${Object.keys(root.pages).length} deeper pages`)

// A node with real points, preferring a deeper one so the test is not just
// the root's coarse sample.
const key = keys.find((k) => (root.nodes[k]?.pointCount ?? 0) > 1000) ?? keys[0]
const node = root.nodes[key]!
console.log(`\n  node ${key}: ${node.pointCount.toLocaleString()} points, ${node.pointDataLength.toLocaleString()} compressed bytes\n`)

// --- the oracle -----------------------------------------------------------
const view = await Copc.loadPointDataView(getter, copc, node)
const g = {
  x: view.getter("X"), y: view.getter("Y"), z: view.getter("Z"),
  r: view.getter("Red"), gr: view.getter("Green"), b: view.getter("Blue"),
  c: view.getter("Classification"),
}

// --- us -------------------------------------------------------------------
const records = await Copc.loadPointDataBuffer(getter, copc.header, node)
const { scale, offset } = copc.header
// THE OFFSET UNDER TEST. Resolved from the file's own Extra Bytes VLR by the
// same code the viewer uses, so this exercises the computation rather than a
// constant -- see src/lib/copc/extraBytes.ts.
const hagLocation = locateExtraByte(HAG_DIMENSION, copc.header.pointDataRecordFormat, copc.eb)
const mine = decodeRecords(
  records as Uint8Array,
  node.pointCount,
  copc.header.pointDataRecordLength,
  copc.header.pointDataRecordFormat,
  { scale: [scale[0], scale[1], scale[2]], offset: [offset[0], offset[1], offset[2]] },
  // Origin zero, so this compares absolute coordinates against the oracle's.
  // The renderer subtracts the octree centre; that is a separate concern and
  // is covered by the browser probe, not here.
  [0, 0, 0],
  hagLocation,
)

let worstXYZ = 0
let worstRGB = 0
let classMismatches = 0
for (let i = 0; i < Math.min(SAMPLE, node.pointCount); i++) {
  worstXYZ = Math.max(
    worstXYZ,
    Math.abs(mine.position[i * 3] - g.x(i)),
    Math.abs(mine.position[i * 3 + 1] - g.y(i)),
    Math.abs(mine.position[i * 3 + 2] - g.z(i)),
  )
  if (mine.color.length) {
    // The oracle hands back raw 16-bit channels; ours are normalised, so
    // compare in the oracle's space using the divisor we inferred.
    const divisor = 65535
    worstRGB = Math.max(
      worstRGB,
      Math.abs(mine.color[i * 3] * divisor - g.r(i)),
      Math.abs(mine.color[i * 3 + 1] * divisor - g.gr(i)),
      Math.abs(mine.color[i * 3 + 2] * divisor - g.b(i)),
    )
  }
  if (mine.classification[i] !== g.c(i)) classMismatches++
}

// Float32 near 6e5 has ~0.06 spacing, so the positions cannot match to
// better than that -- the tolerance is the storage, not the parse. This is
// exactly why the renderer subtracts an origin first.
check("positions agree with copc.js's own reader", worstXYZ < 0.07, `worst axis error ${worstXYZ.toExponential(2)} over ${SAMPLE} points (Float32 spacing near 6e5 is ~0.06)`)
check("colour channels agree, in the right order", worstRGB < 1, `worst channel error ${worstRGB}`)
check("classification agrees", classMismatches === 0, `${classMismatches} mismatches of ${SAMPLE}`)

// --- the histogram the readout is built from ------------------------------
//
// Produced in the decode worker so the frame thread never scans the
// classification bytes. It is summed across the resident set and turned into
// the ground/canopy/noise percentages on the in-headset panel, so if it
// disagrees with the bytes it was counted from, the panel lies quietly.
let histogramTotal = 0
for (let i = 0; i < 256; i++) histogramTotal += mine.classHistogram[i]
check(
  "the class histogram counts every point exactly once",
  histogramTotal === node.pointCount,
  `${histogramTotal.toLocaleString()} binned against ${node.pointCount.toLocaleString()} points`,
)
let recountMismatch = 0
const recount = new Uint32Array(256)
for (let i = 0; i < node.pointCount; i++) recount[mine.classification[i]]++
for (let i = 0; i < 256; i++) if (recount[i] !== mine.classHistogram[i]) recountMismatch++
check(
  "and bins them where the classification attribute says",
  recountMismatch === 0,
  `${recountMismatch} bins disagree with a direct recount of the same array`,
)

// --- height above ground, the pipeline's own output -----------------------
if (!hagLocation) {
  // NOT A PASS AND NOT A FAILURE. Saying "skipped" is the whole point: an
  // assertion that silently succeeds on a file with no extra bytes would read
  // as cover for the offset arithmetic it never ran.
  console.log(
    `  SKIP  ${HAG_DIMENSION} is not in this file` +
      `  -- ${copc.eb.length} extra-bytes dimension(s) declared. This is the RAW survey;` +
      ` re-run with --url pointed at the annotated derivative to test the offset.`,
  )
} else {
  check(
    `${HAG_DIMENSION} is located after the base record, not inside it`,
    hagLocation.byteOffset >= 30 && hagLocation.byteOffset < copc.header.pointDataRecordLength,
    `byte ${hagLocation.byteOffset} of a ${copc.header.pointDataRecordLength}B record, ` +
      `${hagLocation.type}${hagLocation.length * 8}`,
  )
  // PDAL writes scale/offset as literal 0.0 with the options flags cleared.
  // Believing the stored number would multiply every height by zero.
  check(
    "and is read with scale 1, not with PDAL's stored 0.0",
    hagLocation.valueScale === 1 && hagLocation.valueOffset === 0,
    `scale ${hagLocation.valueScale}, offset ${hagLocation.valueOffset}`,
  )

  const hagOracle = view.getter(HAG_DIMENSION)
  let worstHag = 0
  for (let i = 0; i < Math.min(SAMPLE, node.pointCount); i++) {
    worstHag = Math.max(worstHag, Math.abs(mine.hag[i] - hagOracle(i)))
  }
  check(
    "height above ground agrees with copc.js's own reader",
    worstHag < 1e-3,
    `worst error ${worstHag.toExponential(2)} over ${SAMPLE} points -- the only check on a COMPUTED offset`,
  )

  // Ground points are set to exactly 0 by filters.hag_nn, and nothing should
  // be far below the ground surface. A negative sweep would mean the ground
  // solve sat above the data.
  let belowGround = 0
  let maxHag = 0
  for (let i = 0; i < node.pointCount; i++) {
    if (mine.hag[i] < -1) belowGround++
    if (mine.hag[i] > maxHag) maxHag = mine.hag[i]
  }
  check(
    "the heights are physically sensible",
    maxHag > 0 && belowGround < node.pointCount * 0.02,
    `tallest ${maxHag.toFixed(2)} file units, ${belowGround} points more than 1 unit below ground ` +
      `(${((belowGround / node.pointCount) * 100).toFixed(2)}%)`,
  )
  check(
    "and the decoder's reported maximum matches the array it scanned",
    Math.abs(mine.hagMax - maxHag) < 1e-6,
    `${mine.hagMax} against ${maxHag}`,
  )
}

console.log(`\n  ${failures === 0 ? "all checks passed" : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
