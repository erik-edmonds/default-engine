/** The measurement apparatus, against sequences whose answers are known.
 *
 *  Run: node --experimental-strip-types --import ./scripts/alias-hook.mjs \
 *       scripts/xr-measure-test.ts
 *
 *  WORTH A TEST RATHER THAN A GLANCE, because this is the instrument. Every
 *  number Phase 1 produces — the point budget, whether 1:1 is worth having,
 *  what a 300M-point farm scan will need — is read off these percentiles, and
 *  a ring buffer with an off-by-one in its wrap would report confidently
 *  wrong figures that no amount of time in a headset would reveal. A probe in
 *  a browser cannot check this: it would have to know the right answer, which
 *  means knowing the frame times, which means not measuring them.
 *
 *  The second reason is the ring. `CAPACITY` is 1200 and a ten-second window
 *  at 72Hz is ~720 frames, so a long window runs near the wrap. The wrap is
 *  exactly where a buffer like this goes wrong, and it goes wrong silently.
 */
import { DROP_FACTOR, FrameTimes, frameBudgetMs } from "@/helpers/frameStats"
import { WRIST_ROWS, WRIST_SPACERS, wristColumns, wristValues } from "@/helpers/wristRows"
import { samplesToCsv, type Sample } from "@/helpers/sampleLog"
import * as THREE from "three"
import { basePointLength, locateExtraByte, readExtraByte } from "@/lib/copc/extraBytes"
import { pointSizeForDepth } from "@/lib/scan/pointMaterial"
import { XR_POINT_MAX_PX, XR_POINT_MIN_PX } from "@/config/xrScan"
import {
  HAG_BANDS,
  HAG_NEAR_GROUND_M,
  HAG_RAMP_MAX_M,
  bandForHeight,
  buildClassPalette,
  buildHagRamp,
  srgbToLinear,
} from "@/config/asprs"
import { fileToWorld, lifeSizeRig, tabletopRig, worldToFile } from "@/lib/copc/scale"
import { buildHandGeometry } from "@/lib/xr/handGeometry"
import { GATE_CLOSED, nextGateState, wristRoll, type GateState } from "@/lib/xr/wristGate"
import {
  beginTwoHand,
  deadzone,
  oneHandMatrix,
  snapTurnPosition,
  twoHandMatrix,
  walkDelta,
} from "@/lib/xr/manipulate"

let failures = 0
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`)
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

// --- percentiles on a sequence with an arithmetic answer ----------------
{
  const f = new FrameTimes()
  // 1..100 ms. Nearest-rank: p50 is the 50th value, p95 the 95th.
  for (let i = 1; i <= 100; i++) f.push(i)
  check("count tracks what was pushed", f.count === 100, `${f.count}`)
  check("p50 of 1..100 is 50", near(f.percentile(0.5), 50), `${f.percentile(0.5)}`)
  check("p95 of 1..100 is 95", near(f.percentile(0.95), 95), `${f.percentile(0.95)}`)
  check("p100 is the worst frame", near(f.percentile(1), 100), `${f.percentile(1)}`)
  // Order must not matter. Shuffle the same multiset and demand the same
  // answers -- a percentile that depended on arrival order would track the
  // most recent frames rather than the distribution.
  const g = new FrameTimes()
  const shuffled = Array.from({ length: 100 }, (_, i) => i + 1)
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (i * 7919 + 13) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  for (const v of shuffled) g.push(v)
  check("percentiles are order-independent",
    near(g.percentile(0.5), 50) && near(g.percentile(0.95), 95),
    `shuffled: p50 ${g.percentile(0.5)}, p95 ${g.percentile(0.95)}`)
}

// --- the window argument ------------------------------------------------
{
  const f = new FrameTimes()
  // 500 cheap frames, then 100 expensive ones.
  for (let i = 0; i < 500; i++) f.push(5)
  for (let i = 0; i < 100; i++) f.push(50)
  check("a short window sees only recent frames",
    near(f.percentile(0.5, 100), 50),
    `last 100: p50 ${f.percentile(0.5, 100)} -- all 50s`)
  check("a long window sees the whole run",
    near(f.percentile(0.5, 600), 5),
    `last 600: p50 ${f.percentile(0.5, 600)} -- 500 fives against 100 fifties`)
  check("asking for more than exists is not an error",
    near(f.percentile(0.5, 100_000), 5),
    `${f.percentile(0.5, 100_000)}`)
}

// --- THE WRAP. 1200 is CAPACITY; this is where a ring goes wrong --------
{
  const f = new FrameTimes()
  // 1200 frames of 99, then 1200 of 10. After the second batch NOTHING of
  // the first may survive -- the buffer has been completely overwritten.
  for (let i = 0; i < 1200; i++) f.push(99)
  for (let i = 0; i < 1200; i++) f.push(10)
  check("the ring caps at capacity", f.count === 1200, `${f.count}`)
  check("a full overwrite leaves nothing of the old data",
    near(f.percentile(1), 10),
    `worst frame is ${f.percentile(1)}; a 99 here means the wrap reads stale slots`)

  // Half-overwritten: 600 of each, so the median sits exactly at the seam.
  const g = new FrameTimes()
  for (let i = 0; i < 1200; i++) g.push(99)
  for (let i = 0; i < 600; i++) g.push(10)
  check("a half overwrite keeps exactly half",
    near(g.percentile(0.25), 10) && near(g.percentile(0.75), 99),
    `p25 ${g.percentile(0.25)} (10), p75 ${g.percentile(0.75)} (99) -- 600 of each across the wrap`)

  // The newest 600 must be the 10s regardless of where the write head sits.
  check("the window reads backwards from the write head, not from slot 0",
    near(g.percentile(1, 600), 10),
    `worst of the last 600 is ${g.percentile(1, 600)}`)
}

// --- dropped frames -----------------------------------------------------
{
  const budget = frameBudgetMs(72)
  check("the 72Hz slot is 13.89ms", near(budget, 1000 / 72), `${budget.toFixed(4)}`)
  const f = new FrameTimes()
  // 90 frames inside the slot, 10 at double. Only the doubles overrun 1.5x.
  for (let i = 0; i < 90; i++) f.push(13.0)
  for (let i = 0; i < 10; i++) f.push(27.8)
  check("only real overruns are counted",
    f.droppedAbove(budget * DROP_FACTOR) === 10,
    `${f.droppedAbove(budget * DROP_FACTOR)} of 100 -- the 13.0ms frames are inside the slot`)

  // THE REASON FOR 1.5x. A viewer sitting right at the slot width jitters
  // either side of it; at a 1.0x threshold half those frames would be
  // reported dropped and the viewer would look broken in the log while
  // looking perfect in the headset.
  const g = new FrameTimes()
  for (let i = 0; i < 100; i++) g.push(i % 2 === 0 ? 13.8 : 14.0)
  check("jitter around the slot is not a dropped frame",
    g.droppedAbove(budget * DROP_FACTOR) === 0,
    `${g.droppedAbove(budget * DROP_FACTOR)} dropped at 1.5x, against ${g.droppedAbove(budget)} at 1.0x`)
}

// --- an empty meter must not report zeros as measurements ---------------
{
  const f = new FrameTimes()
  check("an empty meter reports 0, not NaN",
    f.percentile(0.5) === 0 && f.droppedAbove(10) === 0 && f.count === 0,
    `p50 ${f.percentile(0.5)}, dropped ${f.droppedAbove(10)}`)
  f.push(16)
  f.reset()
  check("reset empties it", f.count === 0 && f.percentile(0.5) === 0, `${f.count}`)
}

// --- spanMs, which is what tells you a window really lasted 10s ---------
{
  const f = new FrameTimes()
  for (let i = 0; i < 720; i++) f.push(13.889)
  check("720 frames at 13.889ms is ten seconds",
    near(f.spanMs(), 10_000, 1),
    `${(f.spanMs() / 1000).toFixed(3)}s -- a window that reports fewer frames than this was cut short`)
}

// --- THE WRIST PANEL'S ROW INVARIANT ------------------------------------
//
// The labels and the values are two separate troika objects sharing a line
// height. If their row counts ever diverge the panel does not throw, does not
// warn and does not look broken -- every row below the divergence shows the
// wrong label, so you read "p95: 31" off a line that is really the draw-call
// count. A wrong number that looks like a right one, in a headset, while
// measuring. This is the assertion that makes that impossible.
{
  const frames = new FrameTimes()
  for (let i = 0; i < 300; i++) frames.push(13.2)
  frames.push(31.4)
  const readout = {
    cloud: { points: 1_234_567, nodes: 65, bytes: 20_600_000, requests: 71, loading: 3, ready: true },
    budget: 750_000,
    scaleMode: "table" as const,
    ratio: 710,
    frames,
    hz: 72,
    framebuffer: [2208, 2112] as [number, number],
    foveation: 1,
    drawCalls: 65,
    programs: 1,
    pointSize: 1.6,
    pointSizeMax: 1.6,
    pixelRatio: 1,
    colorMode: "rgb" as const,
    hasHag: false,
    // 60% ground, 25% medium vegetation, 10% low vegetation, 5% noise, so
    // every share the panel reports has a known answer.
    classHistogram: (() => {
      const h = new Uint32Array(256)
      h[2] = 600; h[3] = 100; h[4] = 250; h[7] = 50
      return h
    })(),
    hagMax: 0,
    unitsToMetres: 0.3048,
    userScale: 1,
    wristRoll: 0,
  }
  const vals = wristValues(readout)
  check("the panel's labels and values have the same row count",
    WRIST_ROWS.length === vals.length,
    `${WRIST_ROWS.length} labels, ${vals.length} values -- a mismatch mislabels every row below it, silently`)

  // Blank spacer rows must line up too, or the groups drift apart.
  const labelBlanks = WRIST_ROWS.map((l, i) => (l === "" ? i : -1)).filter((i) => i >= 0)
  const valueBlanks = vals.map((v, i) => (v === "" ? i : -1)).filter((i) => i >= 0)
  check("the spacer rows are at the same indices in both columns",
    JSON.stringify(labelBlanks) === JSON.stringify(valueBlanks),
    `labels blank at [${labelBlanks}], values blank at [${valueBlanks}]`)

  const row = (label: string) => vals[WRIST_ROWS.indexOf(label as never)]
  check("median is formatted in milliseconds", row("median") === "13.2 ms", `"${row("median")}"`)
  check("worst picks up the one slow frame", row("worst") === "31.4 ms", `"${row("worst")}"`)
  check("dropped is shown against the refresh slot",
    row("dropped") === "1 / 13.9",
    `"${row("dropped")}" -- one frame over 1.5x the 13.9ms slot`)
  check("the eye framebuffer is the runtime's, not the window's",
    row("eye") === "2208x2112", `"${row("eye")}"`)
  check("the tabletop ratio reads as a ratio", row("scale") === "1:710", `"${row("scale")}"`)
  // THE SHIMMER NUMBER. pointsMaterial.size x pixelRatio is what the shader
  // uses, and a session's ratio is 1 -- so the panel must show 1.6, not the
  // 3.2 the same material gives on a retina monitor.
  check("point size is reported in DEVICE pixels",
    row("point") === "1.6 px",
    `"${row("point")}" at size ${readout.pointSize} x ratio ${readout.pixelRatio} -- under the 3px floor, which is the finding`)

  const lifeVals = wristValues({ ...readout, scaleMode: "life", ratio: 1 })
  check("life size reads 1:1 rather than 1:1-the-number",
    lifeVals[WRIST_ROWS.indexOf("scale" as never)] === "1:1",
    `"${lifeVals[WRIST_ROWS.indexOf("scale" as never)]}"`)

  const empty = wristValues({ ...readout, frames: new FrameTimes(), framebuffer: [0, 0], hz: 0 })
  check("before any frames, the panel shows a dash rather than 0.0 ms",
    empty[0] === "—" && empty[WRIST_ROWS.indexOf("eye" as never)] === "—",
    `median "${empty[0]}", eye "${empty[WRIST_ROWS.indexOf("eye" as never)]}" -- a confident 0.0 would read as a measurement`)

  // --- WHAT THE PIPELINE MADE OF IT ------------------------------------
  //
  // These four rows are the only readout of the annotation on the whole
  // route, so a formatting error here is an annotation nobody can check.
  check("the ground share is a percentage of the resident set",
    row("ground") === "60.0%",
    `"${row("ground")}" -- 600 of 1000 binned points`)
  check("canopy sums every vegetation class the pipeline assigns",
    row("canopy") === "35.0%",
    `"${row("canopy")}" -- classes 3+4 (100+250 of 1000), taken from hagBands.json rather than restated`)
  check("noise is reported separately, because a classifier can quietly eat a scan",
    row("noise") === "5.0%", `"${row("noise")}"`)
  check("a file with no height dimension shows a dash, not 0.0 m",
    row("tallest") === "—",
    `"${row("tallest")}" -- 0.0 m would read as "the ground is flat" rather than "this has not been annotated"`)

  const empties = wristValues({ ...readout, classHistogram: new Uint32Array(256) })
  check("an empty cloud shows a dash rather than 0.0% ground",
    empties[WRIST_ROWS.indexOf("ground" as never)] === "—",
    `"${empties[WRIST_ROWS.indexOf("ground" as never)]}" -- no ground and no data are different things to be looking at`)

  // FEET -> METRES, and this is the conversion that would be invisible if
  // wrong. The sample survey is in feet; a canopy at 94 file units is 28.7 m.
  const tall = wristValues({ ...readout, hasHag: true, hagMax: 94.2 })
  check("tallest is converted from file units to metres",
    tall[WRIST_ROWS.indexOf("tallest" as never)] === "28.7 m",
    `"${tall[WRIST_ROWS.indexOf("tallest" as never)]}" -- 94.2 ft x 0.3048. Reporting the raw 94.2 would look entirely plausible and be wrong by 3.28x`)

  const byClass = wristValues({ ...readout, colorMode: "class" })
  check("the colour row names the mode in force",
    byClass[WRIST_ROWS.indexOf("colour" as never)] === "Class",
    `"${byClass[WRIST_ROWS.indexOf("colour" as never)]}" -- the buttons carry no active state, so this row is the only indication`)

  // --- the point size is a RANGE now -----------------------------------
  const spread = wristValues({ ...readout, pointSize: 3, pointSizeMax: 11.5, pixelRatio: 1 })
  check("a resident set spanning depths reports a size range",
    spread[WRIST_ROWS.indexOf("point" as never)] === "3.0–11.5 px",
    `"${spread[WRIST_ROWS.indexOf("point" as never)]}"`)
  check("and collapses to one figure when every node is the same depth",
    row("point") === "1.6 px", `"${row("point")}"`)
  const retina = wristValues({ ...readout, pointSize: 3, pointSizeMax: 3, pixelRatio: 2 })
  check("the size is still reported in DEVICE pixels",
    retina[WRIST_ROWS.indexOf("point" as never)] === "6.0 px",
    `"${retina[WRIST_ROWS.indexOf("point" as never)]}" -- three multiplies size by the pixel ratio, and a session's ratio is 1 while a retina monitor's is 2`)
}

// --- THE TWO-COLUMN SPLIT, which fixed a row nobody could see -----------
//
// At 19 rows the single column needed ~442 uikit px in a 427px box, so the
// last row was clipped -- and the last row is `roll`, the live wrist angle the
// gate thresholds are supposed to be tuned against. The split has to balance
// AND to break only on a spacer, or a column starts mid-group and reads as
// though the heading above it applied.
{
  const columns = wristColumns(WRIST_ROWS.length, WRIST_SPACERS)
  check("the rows are split into two columns",
    columns.length === 2, `${columns.length} columns`)
  const flat = [...columns[0], ...columns[1]]
  // Every row but ONE survives: the spacer the break lands on is consumed,
  // because the column break now does the separating it was doing. The other
  // spacers stay -- they divide groups WITHIN a column and are still wanted.
  check("every row appears exactly once and in order, less the consumed break",
    flat.length === WRIST_ROWS.length - 1
      && flat.every((v, i) => i === 0 || v > flat[i - 1]),
    `${flat.length} rows placed from ${WRIST_ROWS.length} labels -- one spacer consumed by the break`)
  check("no column begins or ends with a spacer",
    columns.every((c) => WRIST_ROWS[c[0]] !== "" && WRIST_ROWS[c[c.length - 1]] !== ""),
    `column heads "${WRIST_ROWS[columns[0][0]]}" / "${WRIST_ROWS[columns[1][0]]}" -- a leading gap reads as a missing row`)
  check("the break falls on a spacer, so no group is split",
    WRIST_SPACERS.includes(columns[0][columns[0].length - 1] + 1),
    `column one ends at row ${columns[0][columns[0].length - 1]} ("${WRIST_ROWS[columns[0][columns[0].length - 1]]}")`)
  const longest = Math.max(columns[0].length, columns[1].length)
  // The box fits about 21 rows; the point of splitting is to be comfortably
  // inside that, not just inside it.
  check("the taller column fits the panel with room to spare",
    longest <= 18,
    `${longest} rows in the taller column, against the ~21 the 427px box holds`)

  // Degenerate inputs, because this runs before anything is measured.
  check("no spacers means one column rather than a split through a group",
    wristColumns(5, []).length === 1, `${wristColumns(5, []).length}`)
  check("zero rows does not throw", wristColumns(0, []).length === 1)
}

// --- EXTRA BYTES: the offsets the pipeline's output is read through -----
//
// This is the arithmetic that decides whether height-above-ground is read at
// all, and getting it wrong does not throw -- it reads whatever bytes happen
// to be at the offset and produces a plausible, wrong height. The layout rule
// is a CONVENTION, not a stored field: dimensions sit end to end after the
// base PDRF record, in VLR order, and you are expected to add up the lengths.
{
  check("PDRF 6, 7 and 8 have the base lengths the spec gives",
    basePointLength(6) === 30 && basePointLength(7) === 36 && basePointLength(8) === 38,
    `${basePointLength(6)} / ${basePointLength(7)} / ${basePointLength(8)}`)
  let threw = false
  try { basePointLength(5.5 as number) } catch { threw = true }
  check("an unknown format throws rather than guessing a length", threw)

  const eb = [
    { name: "Amplitude", type: "unsigned" as const, length: 2 },
    { name: "HeightAboveGround", type: "float" as const, length: 4 },
    { name: "Trailing", type: "unsigned" as const, length: 1 },
  ]
  const hag = locateExtraByte("HeightAboveGround", 7, eb)
  check("a dimension's offset is the base length plus everything before it",
    hag?.byteOffset === 38,
    `${hag?.byteOffset} -- PDRF 7's 36 bytes plus Amplitude's 2, NOT 36`)
  check("a dimension the file does not carry resolves to null, not to offset 0",
    locateExtraByte("Intensity", 7, eb) === null,
    "null is the normal case: the raw survey has no extra bytes at all")
  check("a file with no extra bytes at all resolves to null",
    locateExtraByte("HeightAboveGround", 7, []) === null)
  check("the same dimension moves when the format does",
    locateExtraByte("HeightAboveGround", 6, eb)?.byteOffset === 32,
    `${locateExtraByte("HeightAboveGround", 6, eb)?.byteOffset} -- PDRF 6 has no RGB, so everything shifts 6 bytes earlier`)

  // THE ONE THAT MATTERS MOST. PDAL writes scale and offset as literal 0.0
  // with the options bitmask cleared -- correct per the spec, and its own
  // source says so. A reader that believes the stored number multiplies every
  // value by zero and renders a dimension that is uniformly, plausibly flat.
  check("an absent scale flag means scale 1, NEVER the stored 0",
    hag?.valueScale === 1 && hag?.valueOffset === 0,
    `scale ${hag?.valueScale}, offset ${hag?.valueOffset} -- believing PDAL's stored 0.0 would zero every height in the file`)
  const scaled = locateExtraByte("S", 6, [{ name: "S", type: "signed" as const, length: 2, scale: 0.01, offset: 5 }])
  check("a scale that IS declared is honoured",
    scaled?.valueScale === 0.01 && scaled?.valueOffset === 5,
    `scale ${scaled?.valueScale}, offset ${scaled?.valueOffset}`)

  // An undocumented field (raw type 0) carries a length and no interpretation.
  // It cannot be read, but it still takes up space -- skipping its length
  // would misplace everything after it.
  const withOpaque = [
    { name: "Opaque", length: 3 },
    { name: "HeightAboveGround", type: "float" as const, length: 4 },
  ]
  check("an unreadable field still consumes its bytes",
    locateExtraByte("HeightAboveGround", 7, withOpaque)?.byteOffset === 39,
    `${locateExtraByte("HeightAboveGround", 7, withOpaque)?.byteOffset} -- 36 + 3, so the opaque field is counted even though it cannot be decoded`)
  check("and is itself unreadable rather than silently mis-typed",
    locateExtraByte("Opaque", 7, withOpaque) === null)

  // Round-trip a real value through the reader, little-endian as LAS is.
  {
    // Two records' worth, so the stride test below has somewhere to write.
    const buffer = new ArrayBuffer(128)
    const view = new DataView(buffer)
    // Written AT the resolved offset rather than at a hand-computed one, so
    // the round trip tests the reader and not my arithmetic twice.
    view.setFloat32(hag!.byteOffset, 12.5, true)
    check("a float32 extra byte reads back exactly",
      readExtraByte(view, 0, hag!) === 12.5,
      `${readExtraByte(view, 0, hag!)} from byte ${hag!.byteOffset}`)
    view.setInt16(scaled!.byteOffset, 400, true)
    check("a scaled integer has its scale and offset applied",
      near(readExtraByte(view, 0, scaled!), 9, 1e-9),
      `${readExtraByte(view, 0, scaled!)} -- 400 x 0.01 + 5, from byte ${scaled!.byteOffset}`)
    // Not point zero: the offset is within a RECORD, so it has to be added to
    // the record's own start. Reading from the first record every time is the
    // failure mode that looks like a uniformly flat dimension.
    const stride = 40
    view.setFloat32(stride + hag!.byteOffset, 77.25, true)
    check("the offset is relative to the point record, not to the buffer",
      readExtraByte(view, stride, hag!) === 77.25,
      `${readExtraByte(view, stride, hag!)} from record 1 at stride ${stride}`)
  }
}

// --- THE PALETTE AND THE RAMP -------------------------------------------
{
  const palette = buildClassPalette()
  check("the palette answers for all 256 classification codes",
    palette.length === 256 * 4,
    `${palette.length / 4} entries -- LAS classification is a full byte, and 64-255 are user-definable`)
  const at = (code: number) => [palette[code * 4], palette[code * 4 + 1], palette[code * 4 + 2]]
  const ground = at(2)
  const highVeg = at(5)
  check("ground and vegetation are different colours",
    ground.join() !== highVeg.join(), `ground ${ground.map((v) => v.toFixed(3))}, high veg ${highVeg.map((v) => v.toFixed(3))}`)
  check("an unnamed code gets the unknown colour, not black and not a neighbour's",
    at(200).join() === at(100).join() && at(200).join() !== ground.join(),
    `code 200 ${at(200).map((v) => v.toFixed(3))} -- a private scheme should read as "unknown", not as a wrong label`)
  check("every entry is opaque",
    Array.from({ length: 256 }, (_, i) => palette[i * 4 + 3]).every((a) => a === 1))

  // LINEAR, NOT sRGB, and this is the half of the colour fix that lives in
  // TypeScript. The shader writes linear and three applies the sRGB transfer
  // function on output, so a palette authored in sRGB would be encoded twice.
  // #b0793f's red channel is 0xb0/255 = 0.690 in sRGB and 0.430 in linear.
  check("the palette is stored linear, so three's output encode is not doubled",
    near(ground[0], srgbToLinear(0xb0 / 255), 1e-6),
    `${ground[0].toFixed(4)} against sRGB ${(0xb0 / 255).toFixed(4)} -- the gap between these two IS the washed-out cloud`)
  check("srgbToLinear is the real transfer function at both ends",
    near(srgbToLinear(0), 0) && near(srgbToLinear(1), 1) && near(srgbToLinear(0.04045), 0.04045 / 12.92, 1e-9),
    "0, 1 and the kink where the linear segment meets the power curve")

  const ramp = buildHagRamp()
  check("the ramp spans 256 texels", ramp.length === 256 * 4)
  const lum = (i: number) => 0.2126 * ramp[i * 4] + 0.7152 * ramp[i * 4 + 1] + 0.0722 * ramp[i * 4 + 2]
  let monotonic = true
  for (let i = 1; i < 256; i++) if (lum(i) < lum(i - 1) - 1e-6) monotonic = false
  // A SEQUENTIAL ramp, not a rainbow: height is an ordered quantity, and a
  // rainbow makes an ordered quantity unreadable without a legend.
  check("luminance increases monotonically with height",
    monotonic,
    `${lum(0).toFixed(3)} at the bottom to ${lum(255).toFixed(3)} at the top -- so the picture reads without consulting the legend`)
}

// --- THE BANDS, shared with the Python pipeline --------------------------
//
// hagBands.json is read by thresholds.py to build the PDAL assign statements
// AND imported here to draw the legend. These assertions are what stop the
// viewer confidently mislabelling what the pipeline wrote.
{
  check("near-ground is below the first band",
    HAG_NEAR_GROUND_M <= HAG_BANDS[0].minM,
    `${HAG_NEAR_GROUND_M} m against a first band starting at ${HAG_BANDS[0].minM} m`)
  let contiguous = true
  for (let i = 1; i < HAG_BANDS.length; i++) {
    if (HAG_BANDS[i].minM !== HAG_BANDS[i - 1].maxM) contiguous = false
  }
  check("the bands are contiguous, so no height falls between two of them",
    contiguous,
    HAG_BANDS.map((b) => `${b.minM}-${b.maxM ?? "∞"}`).join(" "))
  check("the last band is open-ended",
    HAG_BANDS[HAG_BANDS.length - 1].maxM === null,
    "a closed top band would leave the tallest points unclassified")
  check("every band maps to a distinct class",
    new Set(HAG_BANDS.map((b) => b.class)).size === HAG_BANDS.length)
  check("bandForHeight agrees with the table at every boundary",
    bandForHeight(0.05) === null
      && bandForHeight(0.1)?.class === 3
      && bandForHeight(0.49)?.class === 3
      && bandForHeight(0.5)?.class === 4
      && bandForHeight(4.99)?.class === 4
      && bandForHeight(5)?.class === 5
      && bandForHeight(900)?.class === 5,
    "bands are min-inclusive and max-exclusive, which is what filters.assign's >= / < produce")
  check("the ramp tops out above the tallest band's floor",
    HAG_RAMP_MAX_M > HAG_BANDS[HAG_BANDS.length - 1].minM,
    `${HAG_RAMP_MAX_M} m -- a ramp topping out below the last band would clip every tall point to one colour`)
}

// --- PER-NODE POINT SIZE, and its clamp ---------------------------------
//
// XR_POINT_MIN_PX and XR_POINT_MAX_PX sat in config imported by nothing for a
// whole phase. The floor is the part that matters: sub-pixel points shimmer,
// a headset's head never stops moving, and the two eyes disagree about which
// points survive rasterisation.
{
  const cube = 4655
  const root = pointSizeForDepth(cube / 128, cube)
  const deep = pointSizeForDepth(cube / 128 / 2 ** 8, cube)
  check("a shallow node draws larger points than a deep one",
    root > deep, `root ${root.toFixed(1)} px, depth 8 ${deep.toFixed(1)} px`)
  check("nothing is ever drawn below the shimmer floor",
    deep >= XR_POINT_MIN_PX && pointSizeForDepth(0, cube) >= XR_POINT_MIN_PX,
    `${deep.toFixed(2)} px at depth 8, ${pointSizeForDepth(0, cube).toFixed(2)} px at zero spacing, floor ${XR_POINT_MIN_PX}`)
  check("and nothing above the ceiling, however coarse the node",
    pointSizeForDepth(cube, cube) <= XR_POINT_MAX_PX && pointSizeForDepth(cube * 1000, cube) <= XR_POINT_MAX_PX,
    `${pointSizeForDepth(cube * 1000, cube).toFixed(2)} px against a ceiling of ${XR_POINT_MAX_PX}`)
  // SCALE-FREE, because a survey in feet and one in metres must not get
  // different point sizes for the same octree shape.
  check("the size depends on the octree's shape, not on its units",
    near(pointSizeForDepth(cube / 128, cube), pointSizeForDepth((cube / 128) * 0.3048, cube * 0.3048), 1e-9),
    "the same file in feet and in metres draws identically")
}

// --- THE RIG, and the two ways it was wrong ----------------------------
//
// Autzen's real numbers: 4655.5 ft longest extent, in a file whose WKT says
// UNIT["foot", 0.3048], so the site is 1419 m across.
{
  const size: [number, number, number] = [4655.5, 3421.0, 208.0]
  // `source.origin` is the octree CUBE centre, and the data sits far below it
  // in Z -- which is what makes the anchor's rotation matter so much.
  const centre: [number, number, number] = [0, 0, -2233]
  const rig = tabletopRig(size, centre, 2.0, [0, 0.9, -1.2], 0.3048)

  check("the tabletop normalises the longest edge to two metres",
    near(rig.k * size[0], 2.0, 1e-9),
    `k ${rig.k.toExponential(4)} x ${size[0]} = ${(rig.k * size[0]).toFixed(4)} m`)

  // THE RATIO BUG. 1/k is 2328 -- file units per metre, a mixed-unit number.
  // The site is 1419 m long and the model is 2 m, so the scale is 1:710.
  // 4655.5 ft is 1418.99 m, so the exact ratio is 709.495 and rounds to 709.
  // The plan says 710 because it rounded the metres to 1419 first; both are
  // the same number and neither is the point. Asserted as a tolerance rather
  // than an integer, because an exact expectation at a rounding boundary
  // tests the boundary and not the behaviour.
  check("the reported ratio is a real scale, not 1/k",
    Math.abs(rig.ratio - 709.5) <= 0.5,
    `1:${rig.ratio}, where 1/k would have said 1:${Math.round(1 / rig.k)} -- wrong by exactly the 3.28 ft/m conversion, and plausible enough on a wrist panel to be believed`)

  check("life size is 1:1 and the file's own unit scale",
    lifeSizeRig(0.3048, centre).ratio === 1 && near(lifeSizeRig(0.3048, centre).k, 0.3048),
    `k ${lifeSizeRig(0.3048, centre).k}, ratio 1:${lifeSizeRig(0.3048, centre).ratio}`)

  // THE TRANSFORM-ORDER BUG, as arithmetic. The recentre group is the parent
  // of PointCloud's -90-about-X rotation, so its translation applies AFTER R
  // and must therefore be -R*A rather than -A. `fileToWorld` is the authority
  // on what the chain is supposed to compute; this asserts the group chain
  // agrees with it.
  const R = new THREE.Euler(-Math.PI / 2, 0, 0)
  const anchorRotated: [number, number, number] = [rig.anchor[0], rig.anchor[2], -rig.anchor[1]]
  const probe: [number, number, number] = [1200, -900, -2100]

  // What the group chain does: T + k*(R*p + d), with d the recentre position.
  const chain = (d: [number, number, number]) => {
    const v = new THREE.Vector3(...probe).applyEuler(R)
    return v.add(new THREE.Vector3(...d)).multiplyScalar(rig.k).add(new THREE.Vector3(...rig.placement))
  }
  const correct = chain([-anchorRotated[0], -anchorRotated[1], -anchorRotated[2]])
  const naive = chain([-rig.anchor[0], -rig.anchor[1], -rig.anchor[2]])
  const want = fileToWorld(probe, rig, R)

  check("the group chain with a ROTATED anchor matches fileToWorld",
    correct.distanceTo(want) < 1e-6,
    `(${correct.toArray().map((v) => v.toFixed(4)).join(', ')}) vs (${want.toArray().map((v) => v.toFixed(4)).join(', ')})`)

  check("and subtracting the anchor unrotated misplaces the model",
    naive.distanceTo(want) > 1.0,
    `off by ${naive.distanceTo(want).toFixed(3)} m at tabletop -- the model on the floor at your feet rather than on a table; the same error at 1:1 (k ${0.3048}) is ${(naive.distanceTo(want) * (0.3048 / rig.k)).toFixed(0)} m, which is simply a black screen`)

  // The claim the whole scale design rests on: a uniform k cancels out of the
  // LOD, so the same viewpoint picks the same nodes at any scale.
  const tiny = tabletopRig(size, centre, 2.0, [0, 0.9, -1.2], 0.3048)
  const life = lifeSizeRig(0.3048, centre)
  const roundTrip = (rigToUse: typeof rig) =>
    worldToFile(fileToWorld(probe, rigToUse, R), rigToUse, R)
  for (const [name, r] of [["tabletop", tiny], ["life size", life]] as const) {
    const back = roundTrip(r)
    check(`${name}: file -> world -> file is lossless`,
      back.every((v, i) => Math.abs(v - probe[i]) < 1e-3),
      `(${back.map((v) => v.toFixed(3)).join(', ')}) from (${probe.join(', ')})`)
  }
}

// --- MOVING ABOUT, AND HANDLING THE MODEL ------------------------------
//
// None of this can be reached by a browser probe: a real XR session cannot be
// driven headless here (headless Chromium ships a native XRSystem with no
// device, and iwer will not install over one), so without these checks the
// two-handed grab would be verified only by someone in a headset deciding it
// "feels wrong". Each one below is an invariant that is either exactly true
// or quietly broken.
{
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  check("a resting stick reads as centred",
    deadzone(0.04, 0.18) === 0 && deadzone(-0.05, 0.18) === 0 && deadzone(0.9, 0.18) === 0.9,
    "0.04 and -0.05 are zero, 0.9 is untouched -- Quest sticks rest around 0.02-0.05 and drift with wear, and without this the view creeps while nobody is touching anything")

  // Walking is relative to the HEAD, not to the play space.
  {
    const forward = walkDelta(0, -1, 0, 1, 1)
    check("pushing the stick forward walks forward",
      near(forward.x, 0, 1e-9) && near(forward.z, -1, 1e-9),
      `(${forward.toArray().map((v) => v.toFixed(3)).join(', ')}) -- stick Y is positive BACKWARD in the WebXR mapping, and -Z is forward in three`)

    const turned = walkDelta(0, -1, Math.PI / 2, 1, 1)
    check("and after turning 90 degrees it walks the new way",
      near(turned.x, -1, 1e-6) && near(turned.z, 0, 1e-6),
      `(${turned.toArray().map((v) => v.toFixed(3)).join(', ')}) at a head yaw of 90 degrees`)

    const down = walkDelta(0, -1, 0, 1, 1)
    check("walking is always level, never into the floor",
      down.y === 0,
      "y is 0 by construction -- the head's YAW is used and its pitch is discarded, or glancing down would drive you into the ground")
  }

  // THE SNAP TURN INVARIANT. The head must not move.
  {
    // The wearer is standing 2m from the play-space origin.
    const originPos = V(0, 0, 0)
    const head = V(2, 1.6, -1)
    const angle = (30 * Math.PI) / 180
    const moved = snapTurnPosition(originPos, head, angle)
    // Where does the head end up? Apply the same yaw about the new origin.
    const headLocal = V(head.x - originPos.x, 0, head.z - originPos.z)
    const rotated = headLocal.clone().applyAxisAngle(V(0, 1, 0), angle)
    const headAfter = V(moved.x + rotated.x, head.y, moved.z + rotated.z)
    check("a snap turn leaves the wearer's head exactly where it was",
      Math.abs(headAfter.x - head.x) < 1e-9 && Math.abs(headAfter.z - head.z) < 1e-9,
      `head (${head.x}, ${head.z}) -> (${headAfter.x.toFixed(9)}, ${headAfter.z.toFixed(9)}) -- turning about the play space's ORIGIN instead would swing anyone standing away from it through an arc, which feels like being shoved sideways`)
  }

  // THE TWO-HANDED GRAB. Scale and rotate about the point between the hands.
  {
    const model = new THREE.Matrix4().identity()
    const l0 = V(-0.2, 1.2, -0.5)
    const r0 = V(0.2, 1.2, -0.5)
    const start = beginTwoHand(l0, r0, model, 1)
    check("a grab records the span between the hands",
      near(start.span, 0.4, 1e-9) && near(start.mid.x, 0, 1e-9),
      `${(start.span * 100).toFixed(0)}cm apart, midpoint at (${start.mid.toArray().map((v) => v.toFixed(2)).join(', ')})`)

    // Hands stay put: nothing may move.
    const still = twoHandMatrix(start, l0, r0, 0.05, 40)
    check("holding still changes nothing",
      still.equals(model),
      "the identity model is returned unchanged -- a grab that drifts while your hands are still is the most unnerving version of this bug")

    // Pull the hands twice as far apart, about the same midpoint.
    const l1 = V(-0.4, 1.2, -0.5)
    const r1 = V(0.4, 1.2, -0.5)
    const doubled = twoHandMatrix(start, l1, r1, 0.05, 40)
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    doubled.decompose(p, q, sc)
    check("pulling your hands twice as far apart doubles the model",
      near(sc.x, 2, 1e-6) && near(sc.y, 2, 1e-6) && near(sc.z, 2, 1e-6),
      `scale ${sc.x.toFixed(4)} -- and uniform in all three axes, which is what keeps the LOD scale-invariant`)

    // THE ONE THAT MATTERS: the midpoint is a fixed point of the transform.
    const midPoint = start.mid.clone().applyMatrix4(doubled)
    check("and the point between your hands does not move while it grows",
      midPoint.distanceTo(start.mid) < 1e-6,
      `midpoint (${start.mid.toArray().map((v) => v.toFixed(3)).join(', ')}) maps to (${midPoint.toArray().map((v) => v.toFixed(3)).join(', ')}) -- scaling an Object3D's own .scale instead would scale about the MODEL's origin, which on a survey is nowhere near your hands, and it would shoot off sideways as it grew`)

    // Rotate the hands 90 degrees about the midpoint; the model must follow.
    const l2 = V(0, 1.2, -0.3)
    const r2 = V(0, 1.2, -0.7)
    const turned = twoHandMatrix(start, l2, r2, 0.05, 40)
    turned.decompose(p, q, sc)
    const yaw = new THREE.Euler().setFromQuaternion(q, "YXZ").y
    check("turning your hands turns the model by the same angle",
      near(Math.abs(yaw), Math.PI / 2, 1e-6) && near(sc.x, 1, 1e-6),
      `${((yaw * 180) / Math.PI).toFixed(1)} degrees of yaw at scale ${sc.x.toFixed(3)} -- a quarter turn of the hands, no change of size`)
    const turnedMid = start.mid.clone().applyMatrix4(turned)
    check("and it turns about your hands, not about its own origin",
      turnedMid.distanceTo(start.mid) < 1e-6,
      `midpoint stays at (${turnedMid.toArray().map((v) => v.toFixed(3)).join(', ')})`)

    // The clamp bounds the MODEL, not the hand travel.
    const far = twoHandMatrix(start, V(-50, 1.2, -0.5), V(50, 1.2, -0.5), 0.05, 40)
    far.decompose(p, q, sc)
    check("the model cannot be grown past the clamp",
      near(sc.x, 40, 1e-6),
      `hands 100m apart would be 250x; clamped to ${sc.x.toFixed(1)}x -- the clamp exists so the model cannot be lost`)
    const tiny = twoHandMatrix(start, V(-0.0005, 1.2, -0.5), V(0.0005, 1.2, -0.5), 0.05, 40)
    tiny.decompose(p, q, sc)
    check("nor shrunk past it",
      near(sc.x, 0.05, 1e-6),
      `clamped to ${sc.x.toFixed(3)}x`)
  }

  // ONE HAND: the model keeps its pose relative to that hand.
  {
    const hand0 = new THREE.Matrix4().makeTranslation(0.3, 1.1, -0.4)
    const model0 = new THREE.Matrix4().makeTranslation(0, 0.9, -1.2)
    const captured = hand0.clone().invert().multiply(model0)

    const still = oneHandMatrix(hand0, captured)
    check("a one-handed grab does not jump when it starts",
      still.equals(model0),
      "the model's matrix is returned unchanged at the instant of the squeeze")

    // Move the hand half a metre right and the model must come with it.
    const hand1 = new THREE.Matrix4().makeTranslation(0.8, 1.1, -0.4)
    const moved = oneHandMatrix(hand1, captured)
    const p = new THREE.Vector3()
    moved.decompose(p, new THREE.Quaternion(), new THREE.Vector3())
    check("moving your hand moves the model with it, one for one",
      near(p.x, 0.5, 1e-9) && near(p.y, 0.9, 1e-9) && near(p.z, -1.2, 1e-9),
      `model at (${p.toArray().map((v) => v.toFixed(3)).join(', ')}) after a 0.5m move -- translation only, no drift in the other axes`)

    // Rotating the hand must orbit the model about the HAND.
    const hand2 = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(
      new THREE.Matrix4().makeTranslation(0.3, 1.1, -0.4),
    )
    const orbited = oneHandMatrix(hand2, captured)
    orbited.decompose(p, new THREE.Quaternion(), new THREE.Vector3())
    const handPos = new THREE.Vector3(0.3, 1.1, -0.4)
    const before = new THREE.Vector3(0, 0.9, -1.2).distanceTo(handPos)
    check("and turning your wrist orbits it about your hand",
      Math.abs(p.distanceTo(handPos) - before) < 1e-6,
      `distance from the hand is ${p.distanceTo(handPos).toFixed(4)}m before and after -- a rigid motion, so nothing is stretched or sheared by a wrist turn`)
  }
}

// --- THE HAND, as geometry ---------------------------------------------
//
// One draw call per hand is the claim, and it is the kind that rots quietly:
// add a part as a `<mesh>` child instead of merging it and nothing breaks, the
// hand looks identical, and the viewer's own `draws` readout climbs by two
// without anyone connecting the two facts.
{
  const left = buildHandGeometry("left")
  const right = buildHandGeometry("right")

  check("each hand is ONE geometry, not a group of parts",
    left instanceof THREE.BufferGeometry && right instanceof THREE.BufferGeometry,
    "merged at module scope -- this route reports its own draw-call count, so a hand that costs six calls is the instrument charging itself for furniture")

  const tris = left.index ? left.index.count / 3 : left.attributes.position.count / 3
  check("and is low-poly, as asked",
    tris > 50 && tris < 400,
    `${tris} triangles -- palm, four fingers, a thumb and a cuff`)

  left.computeBoundingBox()
  right.computeBoundingBox()
  const lb = left.boundingBox!
  const size = lb.getSize(new THREE.Vector3())
  // A human hand is roughly 95mm across the knuckles and 180mm heel to
  // fingertip. Anything outside this envelope is wrong in a way that is
  // obvious in a headset and invisible everywhere else.
  check("it is hand-sized, in metres",
    size.x > 0.07 && size.x < 0.16 && size.z > 0.10 && size.z < 0.22 && size.y < 0.08,
    `${(size.x * 1000).toFixed(0)} x ${(size.y * 1000).toFixed(0)} x ${(size.z * 1000).toFixed(0)} mm`)

  // The grip origin sits in the middle of a closed fist, so the palm must
  // straddle it rather than hang off it -- otherwise the hand pivots about
  // its wrist and swings like a flag when you turn the controller.
  check("the grip origin is inside the palm, not at the wrist",
    Math.abs((lb.min.z + lb.max.z) / 2) < size.z * 0.35 && lb.min.z < 0 && lb.max.z > 0,
    `z spans ${lb.min.z.toFixed(3)} to ${lb.max.z.toFixed(3)} -- the origin is enclosed`)

  // The thumb is the only asymmetric part, and it is what tells you at a
  // glance which hand you are looking at.
  const rb = right.boundingBox!
  check("left and right are mirror images, not the same hand twice",
    Math.abs(lb.min.x + rb.max.x) < 1e-5 && Math.abs(lb.max.x + rb.min.x) < 1e-5 && Math.abs(lb.min.x - rb.min.x) > 1e-4,
    `left x ${lb.min.x.toFixed(4)}..${lb.max.x.toFixed(4)} against right ${rb.min.x.toFixed(4)}..${rb.max.x.toFixed(4)}`)

  check("and it carries normals, so the facets can catch the light",
    left.attributes.normal != null && left.attributes.normal.count === left.attributes.position.count,
    `${left.attributes.normal?.count ?? 0} normals for ${left.attributes.position.count} vertices -- the scene has lights now precisely for these`)
}

// --- THE WRIST GATE ----------------------------------------------------
//
// The requirement was "when the left wrist rotates 30 or 45 degrees then a
// menu pops up", and the thing that makes such a gate good or unusable is
// whether it flickers. That cannot be checked in a browser here -- a real XR
// session cannot be driven headless in this project -- so it is checked as
// arithmetic or not at all.
{
  const FOREARM = [0, 0, 1] as const
  const PALM = [0, -1, 0] as const
  const q = (axis: THREE.Vector3, deg: number) =>
    new THREE.Quaternion().setFromAxisAngle(axis, (deg * Math.PI) / 180)
  const Z = new THREE.Vector3(0, 0, 1)
  const X = new THREE.Vector3(1, 0, 0)

  check("a level wrist reads zero roll",
    Math.abs(wristRoll(new THREE.Quaternion(), FOREARM, PALM)) < 1e-6,
    `${wristRoll(new THREE.Quaternion(), FOREARM, PALM).toFixed(6)} degrees -- palm down is the zero`)

  for (const deg of [20, 35, 45, 90]) {
    const got = Math.abs(wristRoll(q(Z, deg), FOREARM, PALM))
    check(`rolling ${deg} degrees about the forearm reads ${deg}`,
      Math.abs(got - deg) < 1e-4,
      `${got.toFixed(3)} degrees`)
  }

  // Rolling about a PERPENDICULAR axis is not a roll, and a naive
  // implementation reports one.
  check("but pitching the arm is not a roll",
    Math.abs(wristRoll(q(X, 40), FOREARM, PALM)) < 1e-4,
    `${wristRoll(q(X, 40), FOREARM, PALM).toFixed(4)} degrees for a 40 degree pitch -- the gate must not fire just because you raised your arm`)

  // THE GIMBAL TEST. An Euler-based implementation passes everything above and
  // fails this one, and "arm pointing down" is where an arm actually lives.
  {
    const pitched = q(X, -85).multiply(q(Z, 35))
    const got = Math.abs(wristRoll(pitched, FOREARM, PALM))
    check("and a 35 degree roll still reads 35 with the arm pointing down",
      Math.abs(got - 35) < 0.5,
      `${got.toFixed(2)} degrees at an 85 degree pitch -- an Euler decomposition degenerates here, which is why this is atan2 of a projection`)
  }

  // --- the state machine --------------------------------------------
  const IN = { held: 0, onDeg: 35, offDeg: 20, onDwellMs: 120, offDwellMs: 250 }
  const step = (s: GateState, roll: number, now: number, held = 0) =>
    nextGateState(s, { ...IN, roll, now, held })

  {
    // Crossing ON is not enough; it has to be held.
    let s = step(GATE_CLOSED, 40, 0)
    check("crossing the threshold does not open it immediately",
      !s.open,
      "the dwell has not elapsed -- a threshold swept through on the way somewhere else is not a request for a menu")
    s = step(s, 40, 119)
    check("...nor one millisecond early", !s.open, "119ms of a 120ms dwell")
    s = step(s, 40, 120)
    check("...and does once the dwell is met", s.open, "120ms held past 35 degrees")
  }

  // THE NO-FLICKER ASSERTIONS, which are two properties and not one. The
  // first version of this conflated them and asserted "exactly one transition"
  // for a wrist wobbling across the ON threshold -- and got zero, correctly:
  // 35 +/- 1.5 with a ~232ms period sits above 35 for only ~116ms at a time,
  // just under the 120ms dwell, so the roll genuinely never sustains. The
  // code was right and the expectation was wrong.
  {
    // Resting ON the boundary: whatever it decides, it must not FLAP.
    let s: GateState = GATE_CLOSED
    let transitions = 0
    let was = false
    for (let t = 0; t < 4000; t += 16) {
      s = step(s, 35 + Math.sin(t / 37) * 1.5, t)
      if (s.open !== was) { transitions++; was = s.open }
    }
    check("a wrist resting ON the threshold never flaps",
      transitions <= 1,
      `${transitions} transition(s) over 4s of +/-1.5 degree wobble straddling the boundary -- a single-threshold gate would toggle on every crossing, roughly 17 times here`)
  }

  {
    // Held clearly past it, with the same tremor: opens once, stays open.
    let s: GateState = GATE_CLOSED
    let transitions = 0
    let was = false
    for (let t = 0; t < 4000; t += 16) {
      s = step(s, 48 + Math.sin(t / 37) * 1.5, t)
      if (s.open !== was) { transitions++; was = s.open }
    }
    check("and a wrist held past it opens exactly once and stays open",
      transitions === 1 && s.open,
      `${transitions} transition over 4s at 48 +/- 1.5 degrees`)
  }

  {
    // The dead band: open, then come back to 25 degrees. 25 is below ON but
    // above OFF, so it must stay open indefinitely.
    let s: GateState = { open: true, since: null }
    for (let t = 0; t < 3000; t += 16) s = step(s, 25, t)
    check("and relaxing into the dead band leaves it open",
      s.open,
      "25 degrees is under the 35 that opens it but over the 20 that closes it, so nothing happens -- that gap is what tremor cannot cross")
  }

  {
    let s: GateState = { open: true, since: null }
    s = step(s, 10, 0)
    check("dropping below the close threshold does not close it at once", s.open, "the 250ms off-dwell")
    s = step(s, 10, 249)
    check("...nor early", s.open, "249ms of 250")
    s = step(s, 10, 250)
    check("...and does once the longer off-dwell is met",
      !s.open,
      "250ms, deliberately longer than the 120ms to open -- a menu that vanishes while you reach for a button is the worse failure")
  }

  {
    // THE GRAB COLLISION. Scaling the model with two hands IS a wrist roll.
    let s = step(GATE_CLOSED, 90, 0, 2)
    check("a two-handed grab cannot open the menu",
      !s.open,
      "90 degrees of roll with both grips held stays shut -- the two-handed scale gesture turns the model by the bearing between the hands, so without this the menu would open every time the survey was resized")
    s = step({ open: true, since: null }, 90, 100, 1)
    check("and starting a grab closes one that is already open",
      !s.open,
      "a menu left hanging through a manipulation would be in front of the thing being manipulated")
  }
}

// The menu's placement used to be tested here -- four assertions on a pure
// `menuPlacement(head, quaternion, distance, drop)`. Both the function and the
// tests are gone, and their absence is the fix rather than a gap in it: the
// panel is head-locked now, portalled into the camera by ScanMenuHost, so its
// pose IS the head's pose and there is no computation left to assert. The
// arithmetic those tests guarded -- discard pitch, keep yaw, never roll --
// only existed to stop a WORLD-placed panel lying on the floor, and a panel
// parented to the head inherits its orientation by definition.
//
// Deleting a passing test is usually wrong; deleting one whose subject no
// longer exists is the other half of deleting the subject.

// --- the CSV export generates its own header --------------------------
{
  const row: Sample = {
    at: 1, sinceSessionStartMs: 2, scan: "autzen", budget: 3, scaleMode: "table", ratio: 4,
    frames: 5, medianMs: 6, p95Ms: 7, worstMs: 8, dropped: 9, points: 10, nodes: 11,
    drawCalls: 12, programs: 13, framebuffer: [14, 15], foveation: 16, hz: 17, settled: true,
  }
  const csv = samplesToCsv([row])
  const [header, body] = csv.split("\n")
  check("the CSV header covers every field of a Sample",
    header.split(",").length === Object.keys(row).length,
    `${header.split(",").length} columns for ${Object.keys(row).length} fields -- derived from the row, so a new field cannot go missing`)
  check("the framebuffer pair survives as one cell",
    body.includes("14x15") && body.split(",").length === header.split(",").length,
    `${body.split(",").length} cells against ${header.split(",").length} headers -- a bare array would emit a comma and shift every column right`)
  check("an empty log exports nothing rather than a bare header",
    samplesToCsv([]) === "", `"${samplesToCsv([])}"`)
}

console.log(`\n  ${failures === 0 ? "all checks passed" : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
