"use client"

import { useAtomValue } from "jotai"

import { useEnterXr } from "@/helpers/useEnterXr"
import { useXrSupport } from "@/helpers/useXrSupport"
import { xrPhase } from "@/helpers/xr"

/** The way into the headset from the scan viewer.
 *
 *  DOM, not in-scene: `requestSession` needs transient user activation, and
 *  the whole point of `useEnterXr` is that it asks for the session
 *  synchronously inside the click. A world-space button would have to route
 *  through state first and spend the activation.
 *
 *  Renders NOTHING without a headset -- `useXrSupport` is three-state and
 *  only `true` shows a control. A greyed-out "VR unsupported" button on the
 *  laptop of someone who came to look at a point cloud is noise; the scan is
 *  usable on a monitor and says so.
 */
export function EnterVrButton() {
  const supported = useXrSupport()
  const phase = useAtomValue(xrPhase)
  const { enter, problem } = useEnterXr()

  if (supported !== true) return null
  const busy = phase !== "idle"

  return (
    <div className="scan-vr">
      <button type="button" className="scan-vr-button" onClick={enter} disabled={busy}>
        {busy ? "Starting…" : "View in VR"}
      </button>
      {problem && (
        <span className="scan-vr-problem" role="status">
          {problem}
        </span>
      )}
    </div>
  )
}
