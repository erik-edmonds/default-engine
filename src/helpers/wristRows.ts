import { DROP_FACTOR, frameBudgetMs } from "@/helpers/frameStats"
import type { scanStats } from "@/helpers/scanStats"
import { XR_TARGET_HZ } from "@/config/xrScan"

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
  "",
  "eye",
  "foveation",
  "refresh",
  "draws",
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
    `${(s.pointSize * s.pixelRatio).toFixed(1)} px`,
    "",
    s.framebuffer[0] ? `${s.framebuffer[0]}x${s.framebuffer[1]}` : "—",
    s.foveation.toFixed(2),
    `${s.hz || 0} Hz`,
    `${s.drawCalls}`,
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
