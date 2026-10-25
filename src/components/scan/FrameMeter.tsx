"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { DROP_FACTOR, frameBudgetMs } from "@/helpers/frameStats"
import { recordSample, type Sample } from "@/helpers/sampleLog"
import { scanStats } from "@/helpers/scanStats"
import { SAMPLE_SETTLE_MS, SAMPLE_WINDOW_MS, WRIST_PANEL_HZ, XR_TARGET_HZ } from "@/config/xrScan"

/** Reused, because this is read inside a frame callback. */
const drawingSize = new THREE.Vector2()

/** The instrument. Measures every frame, publishes four times a second, and
 *  writes a row to the log once a window has settled.
 *
 *  THE ONLY WRITER to `scanStats`' renderer-derived fields, so the panel can
 *  be a pure reader and nothing has to agree about who owns what.
 *
 *  Renders nothing and TAKES NO FRAME PRIORITY, which is load-bearing rather
 *  than incidental: fiber draws only while `state.internal.priority` is 0, so
 *  a `useFrame(fn, 1)` anywhere in this Canvas would silently stop the
 *  automatic render and the headset would open on black. The whole reason
 *  `ScanXrSetup` can be thirty lines instead of `XrTransition`'s hundred and
 *  seventy is that nothing on this route takes a priority. Adding one here
 *  would quietly undo that.
 *
 *  Measures on the desktop too — the numbers are directly comparable and it
 *  costs a subtraction — but RECORDS only in a session. A desktop row in the
 *  log would be a 120 Hz monitor's frame times filed next to a headset's, and
 *  the table's whole job is to be read later by someone who was not there.
 */
export function FrameMeter({ scan }: { scan: string }) {
  const gl = useThree((s) => s.gl)
  const last = useRef(0)
  const nextPublish = useRef(0)
  /** When the current window opened, and what it is a window OF. A change to
   *  the key restarts the window: the frames after a budget step measure the
   *  step. */
  const window_ = useRef({ start: 0, key: "", settledAt: 0, frames: 0 })
  const sessionStart = useRef(0)

  // Reset the clocks when a session begins or ends, so `sinceSessionStartMs`
  // is time worn rather than time since the page loaded.
  useEffect(() => {
    const onStart = () => {
      sessionStart.current = performance.now()
      scanStats.frames.reset()
      window_.current = { start: 0, key: "", settledAt: 0, frames: 0 }
    }
    const onEnd = () => {
      sessionStart.current = 0
    }
    gl.xr.addEventListener("sessionstart", onStart)
    gl.xr.addEventListener("sessionend", onEnd)
    return () => {
      gl.xr.removeEventListener("sessionstart", onStart)
      gl.xr.removeEventListener("sessionend", onEnd)
    }
  }, [gl])

  useFrame(() => {
    const now = performance.now()

    // --- every frame: one subtraction and one store ---------------------
    //
    // performance.now() deltas rather than fiber's `delta`, which is derived
    // from its own Clock and is the time since fiber last ran its loop. In a
    // session the loop is driven by the XR frame callback, so the two agree —
    // but only incidentally, and this is the measurement.
    if (last.current !== 0) {
      const dt = now - last.current
      // Guard the first frame after a tab or session resumes: a 4000 ms gap
      // is not a dropped frame, it is a pause, and one of them in the ring
      // owns the p95 for the next sixteen seconds.
      if (dt < 500) scanStats.frames.push(dt)
    }
    last.current = now

    if (now < nextPublish.current) return
    nextPublish.current = now + 1000 / WRIST_PANEL_HZ

    // --- four times a second: publish the renderer's own view -----------
    const presenting = gl.xr.isPresenting
    const size = gl.getDrawingBufferSize(drawingSize)
    scanStats.framebuffer = [size.x, size.y]
    scanStats.drawCalls = gl.info.render.calls
    scanStats.programs = gl.info.programs?.length ?? 0
    // READ, NEVER ASSUMED. three initialises `foveation` to 1.0 and the
    // runtime may clamp it; the panel shows what came back.
    scanStats.pixelRatio = gl.getPixelRatio()
    scanStats.foveation = presenting ? (gl.xr.getFoveation() ?? 0) : 0
    const session = gl.xr.getSession()
    scanStats.hz = presenting ? (session?.frameRate ?? 0) : 0

    if (!presenting) return

    // --- and keep the sample window -------------------------------------
    const key = `${scanStats.budget}|${scanStats.scaleMode}`
    const w = window_.current
    if (key !== w.key) {
      // The setting changed. Everything measured so far belonged to the old
      // one and the window restarts, settling first.
      window_.current = { start: now, key, settledAt: now + SAMPLE_SETTLE_MS, frames: 0 }
      scanStats.frames.reset()
      return
    }
    if (now < w.settledAt) {
      scanStats.frames.reset()
      return
    }
    if (now - w.settledAt < SAMPLE_WINDOW_MS) return

    // A full settled window. File it and open the next one at the same
    // setting, so a budget left alone for a while produces a row every ten
    // seconds and the thermal drift is visible as a column rather than
    // inferred.
    const budgetMs = frameBudgetMs(scanStats.hz || XR_TARGET_HZ)
    const frames = scanStats.frames.count
    const row: Sample = {
      at: Date.now(),
      sinceSessionStartMs: Math.round(sessionStart.current ? now - sessionStart.current : 0),
      scan,
      budget: scanStats.budget,
      scaleMode: scanStats.scaleMode,
      ratio: scanStats.ratio,
      frames,
      medianMs: +scanStats.frames.percentile(0.5).toFixed(2),
      p95Ms: +scanStats.frames.percentile(0.95).toFixed(2),
      worstMs: +scanStats.frames.percentile(1).toFixed(2),
      dropped: scanStats.frames.droppedAbove(budgetMs * DROP_FACTOR),
      points: scanStats.cloud.points,
      nodes: scanStats.cloud.nodes,
      drawCalls: scanStats.drawCalls,
      programs: scanStats.programs,
      framebuffer: [size.x, size.y],
      foveation: +scanStats.foveation.toFixed(2),
      hz: scanStats.hz,
      // A window can come up short if frames were skipped by the 500 ms
      // guard above. Kept, because a stuttering window is data, but marked so
      // nobody reads a p95 off forty frames.
      settled: frames > 300,
    }
    recordSample(row)
    window_.current = { start: now, key, settledAt: now, frames: 0 }
    scanStats.frames.reset()
  })

  return null
}
