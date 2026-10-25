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
 *  Run:  node --experimental-strip-types scripts/copc-golden.ts
 *  (node 22+; it reads a public file over the network, so it needs one.)
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
import { SCANS } from "../src/config/scans.ts"

const URL_ = SCANS.autzen.url
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

console.log(`\n  ${failures === 0 ? "all checks passed" : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
