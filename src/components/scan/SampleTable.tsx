"use client"

import { useState, useSyncExternalStore } from "react"
import { useAtomValue } from "jotai"

import { xrArmed } from "@/helpers/xr"
import {
  clearSamples,
  samplesServerSnapshot,
  samplesSnapshot,
  samplesToCsv,
  subscribeSamples,
} from "@/helpers/sampleLog"

/** The log, in the DOM, the moment the session ends.
 *
 *  This is the phase's deliverable. Everything else — the rig, the budget
 *  button, the wrist panel — exists so that this table has rows in it.
 *
 *  SHOWN ON EXIT RATHER THAN BEHIND A CONTROL, because the moment you take a
 *  headset off is the moment you want the numbers and the moment you are
 *  least likely to go looking for them. It appears only when there is
 *  something to show, so the desktop viewer is unaffected.
 */
export function SampleTable() {
  const armed = useAtomValue(xrArmed)
  const rows = useSyncExternalStore(subscribeSamples, samplesSnapshot, samplesServerSnapshot)
  /** Dismissal recorded as a ROW COUNT, not a boolean.
   *
   *  Derived rather than reset by an effect: a later sample makes the count
   *  differ and the table comes back on its own, so closing it does not
   *  suppress the next session's results and nothing has to watch `armed` to
   *  undo a flag. */
  const [dismissedAt, setDismissedAt] = useState(-1)
  const [copied, setCopied] = useState(false)

  // Hidden during a session because the DOM is not composited into the
  // headset at all -- there is nothing to hide from, but React should not be
  // rendering a thirteen-column table on the frame thread either.
  if (armed || rows.length === 0 || rows.length === dismissedAt) return null

  // Newest first: the last thing measured is the thing being thought about.
  const shown = [...rows].reverse()

  return (
    <section className="scan-samples" aria-label="Measured frame times">
      <header className="scan-samples-head">
        <h2>Frame times</h2>
        <p>
          {rows.length} sample{rows.length === 1 ? "" : "s"}, each a settled ten-second window at one
          setting. Milliseconds, not frames per second — the compositor pins the displayed rate to a
          divisor of the panel rate, so an app at 13.9 ms and one at 2 ms both report the same number.
        </p>
        <div className="scan-samples-actions">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(samplesToCsv(rows)).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }}
          >
            {copied ? "Copied" : "Copy CSV"}
          </button>
          <button type="button" onClick={() => clearSamples()}>Clear log</button>
          <button type="button" onClick={() => setDismissedAt(rows.length)}>Close</button>
        </div>
      </header>
      {/* Its own scroll container: eighteen columns will not fit a phone and
          the page body must never scroll sideways. */}
      <div className="scan-samples-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Worn</th>
              <th scope="col">Budget</th>
              <th scope="col">Scale</th>
              <th scope="col">Median</th>
              <th scope="col">p95</th>
              <th scope="col">Worst</th>
              <th scope="col">Over</th>
              <th scope="col">On screen</th>
              <th scope="col">Nodes</th>
              <th scope="col">Draws</th>
              <th scope="col">Eye</th>
              <th scope="col">Fov.</th>
              <th scope="col">Hz</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.at}-${i}`} className={r.settled ? undefined : "scan-samples-unsettled"}>
                {/* THE THERMAL COLUMN. A budget that passes cold and fails
                    after ten minutes is the failure mode the plan calls out,
                    and this is the only column that can tell you which one
                    you are reading. */}
                <td>{(r.sinceSessionStartMs / 60000).toFixed(1)}m</td>
                <td>{r.budget.toLocaleString()}</td>
                <td>{r.scaleMode === "life" ? "1:1" : `1:${r.ratio}`}</td>
                <td>{r.medianMs.toFixed(1)}</td>
                <td>{r.p95Ms.toFixed(1)}</td>
                <td>{r.worstMs.toFixed(1)}</td>
                <td>{r.dropped}</td>
                <td>{r.points.toLocaleString()}</td>
                <td>{r.nodes}</td>
                <td>{r.drawCalls}</td>
                <td>{r.framebuffer[0] ? `${r.framebuffer[0]}×${r.framebuffer[1]}` : "—"}</td>
                <td>{r.foveation.toFixed(2)}</td>
                <td>{r.hz || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="scan-samples-note">
        A greyed row was cut short and its p95 is read off too few frames. “Over” counts frames that
        took more than 1.5× the refresh slot.
      </p>
    </section>
  )
}
