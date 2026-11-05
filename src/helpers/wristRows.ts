import { DROP_FACTOR, frameBudgetMs } from "@/helpers/frameStats"
import type { scanStats } from "@/helpers/scanStats"
import { XR_TARGET_HZ } from "@/config/xrScan"
import { COLOR_MODE_LABELS, GROUND_CLASS, HAG_BANDS, NOISE_CLASS } from "@/config/asprs"

/** The wrist panel's rows, as data rather than as JSX.
 *
 *  SEPARATED FROM THE COMPONENT so the one invariant that can silently ruin
 *  the panel is testable without a headset. The labels and the values are two
 *  different troika objects sharing a line height — see the note in
 *  WristPanel — which means a mismatch in their row COUNTS does not throw,
 *  does not warn, and does not look broken: every row below the mismatch
 *  simply shows the wrong label, and you read "p95: 31" off a line that is
 *  actually the draw-call count. In a headset, mid-measurement, that is a
 *  wrong number that looks exactly like a right one.
 *
 *  A component cannot be imported by `node --experimental-strip-types` (JSX,
 *  and three pulls in WebGL), so as long as this lived inside the component
 *  the invariant could only be checked by eye. Here it is one assertion.
 */

type Readout = typeof scanStats

/** Left column. Fixed, rendered once, never updated. */
export const WRIST_ROWS = [
  "median",
  "p95",
  "worst",
  "dropped",
  "",
  "budget",
  "on screen",
  "nodes",
  "fetched",
  "",
  "scale",
  "point",
  "colour",
  "",
  // WHAT THE PIPELINE MADE OF IT. Proportions over the RESIDENT SET, so they
  // move as you look around -- whole-file figures belong in scan_stats, where
  // they are computed over every point instead of over a view. Ground and
  // canopy are the two numbers an agricultural QA pass is actually reading,
  // and noise is on the panel because a classifier that has quietly thrown
  // half the scan into class 7 looks fine until you check.
  "ground",
  "canopy",
  "noise",
  "tallest",
  "",
  "eye",
  "foveation",
  "refresh",
  "draws",
  "",
  // THE TUNING ROW. Which grip-space axis is the forearm cannot be determined
  // away from the hardware, so the gate's live measurement is on the panel:
  // turn your wrist, watch the number, and set WRIST_MENU_ON_DEG to whatever
  // the comfortable position actually reads. Without it the threshold is a
  // guess checked by trial and error.
  "roll",
] as const

/** What the model is actually at, after the rig and then the hands.
 *
 *  `1:1` only when it really is life size; a grabbed-and-stretched 1:1 model
 *  is not 1:1 any more and saying so would be the most misleading thing on
 *  the panel. */
export function effectiveRatio(s: Readout): string {
  const base = s.scaleMode === "life" ? 1 : s.ratio
  const ratio = base / (s.userScale || 1)
  // Exactly life size reads "1:1", not "1:1.0". It is the one value on this
  // panel anyone will look for, and a trailing decimal on it makes a number
  // that is exactly right look approximate.
  if (Math.abs(ratio - 1) < 0.05) return "1:1"
  if (ratio > 1) return `1:${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio)}`
  // Bigger than life size, which two hands can easily do at tabletop.
  const up = 1 / ratio
  return `${up < 10 ? up.toFixed(1) : Math.round(up)}:1`
}

/** Point size in DEVICE pixels, as a range across the resident set. */
export function pointSizeRange(s: Readout): string {
  const lo = s.pointSize * s.pixelRatio
  const hi = s.pointSizeMax * s.pixelRatio
  if (lo <= 0 && hi <= 0) return "—"
  if (Math.abs(hi - lo) < 0.05) return `${lo.toFixed(1)} px`
  return `${lo.toFixed(1)}–${hi.toFixed(1)} px`
}

/** Share of the resident points carrying any of `codes`, as a percentage.
 *
 *  Returns an em dash rather than "0.0%" for an empty cloud, because zero
 *  percent ground and no data at all are very different things to be looking
 *  at while deciding whether a pipeline run worked. */
export function classShare(s: Readout, codes: readonly number[]): string {
  let total = 0
  for (let i = 0; i < s.classHistogram.length; i++) total += s.classHistogram[i]
  if (total === 0) return "—"
  let n = 0
  for (const c of codes) n += s.classHistogram[c] ?? 0
  return `${((n / total) * 100).toFixed(1)}%`
}

/** The vegetation classes, taken from the bands the pipeline assigns rather
 *  than restated, so "canopy" on the panel means exactly what the pipeline
 *  called vegetation. */
const CANOPY_CLASSES = HAG_BANDS.map((b) => b.class)

/** Split the rows into balanced columns, breaking ONLY on a spacer.
 *
 *  THE READOUT ALREADY OVERFLOWED BEFORE THIS PHASE ADDED A ROW, which is
 *  worth recording because it was invisible: at 19 rows of 17px with a 3px gap
 *  the column needs about 442 uikit px and the panel leaves 427, so the last
 *  row was clipped -- and the last row is `roll`, the live wrist angle the
 *  thresholds are supposed to be tuned against. A number you cannot see is
 *  worse than no number, and nothing about it looked broken.
 *
 *  Two columns fix it with room to spare and also make better use of a panel
 *  that is 806px wide and was spending 520 of them on one narrow list.
 *
 *  Breaking only on a spacer keeps the groups intact: a column that started
 *  mid-group would read as though the heading above it applied. Returns
 *  INDICES, not strings, so labels and values cannot drift apart -- the same
 *  concern the row-count invariant at the top of this file exists for. */
export function wristColumns(rowCount: number, spacers: readonly number[]): number[][] {
  if (rowCount === 0) return [[]]
  const midpoint = rowCount / 2
  let breakAt = -1
  for (const i of spacers) {
    if (breakAt === -1 || Math.abs(i - midpoint) < Math.abs(breakAt - midpoint)) breakAt = i
  }
  // No spacer at all: one column is the honest answer rather than a split
  // through the middle of a group.
  if (breakAt === -1) return [Array.from({ length: rowCount }, (_, i) => i)]
  const left: number[] = []
  const right: number[] = []
  for (let i = 0; i < rowCount; i++) {
    // The spacer itself is dropped: it was separating groups within one
    // column, and the column break now does that job.
    if (i === breakAt) continue
    ;(i < breakAt ? left : right).push(i)
  }
  return [left, right]
}

/** Indices of the spacer rows, derived rather than hand-listed so inserting a
 *  row cannot leave this stale. */
export const WRIST_SPACERS: readonly number[] = WRIST_ROWS.reduce<number[]>(
  (acc, label, i) => (label === "" ? [...acc, i] : acc),
  [],
)

/** Right column, in the same order. One string per label.
 *
 *  Pure in `s`: everything it needs is on the readout, so a test can hand it
 *  a synthetic one and check the formatting exactly. */
export function wristValues(s: Readout): string[] {
  const hz = s.hz || XR_TARGET_HZ
  const budgetMs = frameBudgetMs(hz)
  const f = s.frames
  const ms = (v: number) => (v > 0 ? `${v.toFixed(1)} ms` : "—")
  return [
    ms(f.percentile(0.5)),
    ms(f.percentile(0.95)),
    ms(f.percentile(1)),
    // Against the slot, so "3 / 13.9" reads as three frames over budget.
    `${f.droppedAbove(budgetMs * DROP_FACTOR)} / ${budgetMs.toFixed(1)}`,
    "",
    s.budget.toLocaleString(),
    s.cloud.points.toLocaleString(),
    `${s.cloud.nodes}${s.cloud.loading ? ` +${s.cloud.loading}` : ""}`,
    `${(s.cloud.bytes / 1e6).toFixed(0)} MB`,
    "",
    // The EFFECTIVE scale: the rig's, divided by whatever the hands have
    // done since. Rounded to something readable rather than exact -- nobody
    // needs 1:383.7.
    effectiveRatio(s),
    // DEVICE pixels, which is not what the material says. three multiplies
    // pointsMaterial.size by the renderer's pixel ratio, and in a session it
    // sets that ratio to 1 — so a 1.6 that is 3.2px on a retina monitor is
    // 1.6px worn, under the shimmer floor.
    //
    // A RANGE, because the size is now computed per node from the octree's
    // spacing rather than being one constant. Collapsed to a single figure
    // when the resident set happens to be one depth, which is what it is
    // before the first refinement lands.
    pointSizeRange(s),
    COLOR_MODE_LABELS[s.colorMode],
    "",
    classShare(s, [GROUND_CLASS]),
    classShare(s, CANOPY_CLASSES),
    classShare(s, [NOISE_CLASS]),
    // In METRES, converted from file units, because "tallest: 94" is unusable
    // when the file is in feet and the bands that produced it were in metres.
    s.hasHag ? `${(s.hagMax * s.unitsToMetres).toFixed(1)} m` : "—",
    "",
    s.framebuffer[0] ? `${s.framebuffer[0]}x${s.framebuffer[1]}` : "—",
    s.foveation.toFixed(2),
    `${s.hz || 0} Hz`,
    `${s.drawCalls}`,
    "",
    `${s.wristRoll >= 0 ? "" : "-"}${Math.abs(s.wristRoll).toFixed(0)}\u00b0`,
  ]
}

/** The bindings, as they appear at the foot of the panel.
 *
 *  ON THE PANEL, NOT IN A README. Nothing about a thumbstick or a grip button
 *  announces itself, and a headset has no tooltips, no hover and no help menu
 *  -- a control nobody can discover is a control that does not exist, which is
 *  exactly how a viewer with locomotion and a two-handed grab can still be
 *  reported as doing nothing. Seven lines, always visible, costs one static
 *  troika object built once.
 *
 *  Paired as label/binding so the same two-column trick the numbers use keeps
 *  them aligned. */
export const WRIST_BINDINGS: readonly (readonly [string, string])[] = [
  ["stick", "walk"],
  ["R stick", "turn / height"],
  ["grip", "move it"],
  ["2 grips", "size + turn"],
  ["B", "table / 1:1"],
  ["A / X", "budget"],
  ["Y", "reset"],
] as const
