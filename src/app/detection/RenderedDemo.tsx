"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Reconstruction3D } from "@/app/detection/Reconstruction3D"
import { trajectoryError } from "@/lib/sfm/align"
import { CvClient } from "@/lib/sfm/cvClient"
import type { Vec3 } from "@/lib/sfm/geometry"
import { reconstruct, type FrameFeatures, type ReconstructionState } from "@/lib/sfm/reconstruct"
import { renderSyntheticSequence, type Frame } from "@/lib/sfm/syntheticScene"

/** Structure from motion on frames rendered here, with the answer known.
 *
 *  NO PROSE. This route was a write-up ABOUT computer vision; it is the
 *  computer vision now. Everything on screen is the live state of a real
 *  pipeline and the only words are the ones naming what you are looking at.
 *
 *  WHAT IS ACTUALLY HAPPENING, left to right. OpenCV finds ORB corners in each
 *  rendered frame and describes them; OpenCV matches those descriptors between
 *  consecutive frames with a Lowe ratio test; the fundamental and essential
 *  matrices, the four-way pose decomposition and the triangulation are
 *  src/lib/sfm/geometry.ts, because the OpenCV.js build does not ship them;
 *  and every frame after the bootstrap pair is placed by OpenCV's
 *  `solvePnPRansac` against the points already reconstructed.
 *
 *  The camera poses are known, because the frames were rendered here -- so the
 *  estimated trajectory can be scored against the true one. The pipeline never
 *  sees a pose.
 */

type Stage = "booting" | "rendering" | "features" | "solving" | "done" | "failed"

interface FrameResult {
  points: Float32Array
  count: number
  ms: number
}

export function RenderedDemo({ onUseCamera }: { onUseCamera: () => void }) {
  const [stage, setStage] = useState<Stage>("booting")
  const [build, setBuild] = useState("")
  const [error, setError] = useState("")
  const [current, setCurrent] = useState(0)
  const [results, setResults] = useState<FrameResult[]>([])
  const [state, setState] = useState<ReconstructionState | null>(null)
  const [note, setNote] = useState("")
  const [truth, setTruth] = useState<Vec3[]>([])
  /** STATE, NOT `framesRef.current.length`.
   *
   *  A ref read during render is not a dependency of anything -- the count
   *  would be whatever it happened to be at the last render caused by
   *  something else, and with the React Compiler on, a render it memoises
   *  away would never observe the change at all. The progress line is exactly
   *  the thing that has to update. */
  const [frameCount, setFrameCount] = useState(0)

  const framesRef = useRef<Frame[]>([])
  const matchRef = useRef<Map<number, Int32Array>>(new Map())
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /** Paint a frame, its corners, and the matches into the next frame. */
  const paint = useCallback((index: number) => {
    const canvas = canvasRef.current
    const frame = framesRef.current[index]
    if (!canvas || !frame) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = frame.width
    canvas.height = frame.height
    ctx.putImageData(frame.pixels, 0, 0)

    const found = results[index]
    if (!found) return

    // `?overlay=0` draws the frame and nothing else.
    //
    // A development flag in the same spirit as `?menu=1` and `?budget=` on the
    // scan viewer, and it exists for one job: scripts/sfm-camera-fixture.mjs
    // scrubs this canvas to harvest the rendered frames into a video that is
    // then fed back in as a fake webcam. Harvesting them WITH the keypoint
    // circles drawn on would feed the tracker a few hundred high-contrast
    // marks that are not in the scene, which it would dutifully track.
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("overlay") === "0") return

    // Matches first, so the corner markers sit on top of their own lines.
    const pairs = matchRef.current.get(index)
    const next = results[index + 1]
    if (pairs && next) {
      ctx.strokeStyle = "rgba(255, 179, 122, 0.45)"
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let p = 0; p < pairs.length; p += 2) {
        const a = pairs[p]
        const b = pairs[p + 1]
        ctx.moveTo(found.points[a * 2], found.points[a * 2 + 1])
        ctx.lineTo(next.points[b * 2], next.points[b * 2 + 1])
      }
      ctx.stroke()
    }

    // Open circles, not filled dots: a filled marker hides the corner it is
    // marking, and the point is to see what OpenCV latched onto.
    ctx.strokeStyle = "rgba(127, 212, 193, 0.9)"
    ctx.lineWidth = 1.25
    for (let i = 0; i < found.count; i++) {
      ctx.beginPath()
      ctx.arc(found.points[i * 2], found.points[i * 2 + 1], 3.5, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, [results])

  useEffect(() => { paint(current) }, [current, paint])

  useEffect(() => {
    let cancelled = false
    const cv = new CvClient()

    const run = async () => {
      try {
        const info = await cv.ping()
        if (cancelled) return
        setBuild(info)

        setStage("rendering")
        await new Promise((r) => setTimeout(r, 0))
        const sequence = renderSyntheticSequence()
        if (cancelled) { sequence.dispose(); return }
        framesRef.current = sequence.frames
        setFrameCount(sequence.frames.length)
        setTruth(sequence.frames.map((f) => [f.truth.position.x, f.truth.position.y, f.truth.position.z] as Vec3))
        const intrinsics = sequence.intrinsics
        sequence.dispose()
        setCurrent(0)
        paint(0)

        setStage("features")
        const collected: FrameResult[] = []
        const features: FrameFeatures[] = []
        for (const frame of framesRef.current) {
          if (cancelled) return
          // A COPY to transfer: `features` detaches the buffer it is given,
          // and these frames are kept for scrubbing and redrawing.
          const copy = frame.pixels.data.buffer.slice(0)
          const r = await cv.features(copy, frame.width, frame.height, 1200)
          collected.push({ points: r.points, count: r.count, ms: r.ms })
          features.push({ points: r.points, descriptors: r.descriptors, cols: r.cols, count: r.count })
          setResults([...collected])
          setCurrent(frame.index)
        }

        if (cancelled) return
        setStage("solving")
        setCurrent(0)

        const solved = await reconstruct(cv, framesRef.current, features, intrinsics, {
          onMatches: (from, pairs) => {
            if (cancelled) return
            matchRef.current.set(from, pairs)
            // Follow the matching along, so the pane shows the pair being
            // worked on rather than sitting on frame 0 until it finishes.
            setCurrent(from)
          },
          onProgress: (s, what) => {
            if (cancelled) return
            setState(s)
            setNote(what)
          },
        })
        if (cancelled) return
        if (!solved) {
          // The honest failure. The commonest cause by far is no parallax --
          // a camera that rotated but never translated has no baseline and
          // nothing can be triangulated, however good the matching was.
          setError("no pair had enough parallax to triangulate")
          setStage("failed")
          return
        }
        setState(solved)
        setStage("done")
      } catch (e) {
        if (!cancelled) {
          setError(String(e))
          setStage("failed")
        }
      }
    }
    void run()

    return () => { cancelled = true; cv.dispose() }
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const meanMs = results.length ? results.reduce((a, r) => a + r.ms, 0) / results.length : 0
  const ate = state && truth.length
    ? trajectoryError(state.cameras.map((c) => c.centre), state.cameras.map((c) => truth[c.frame]))
    : null

  return (
    <div className="sfm-stage">
      <div className="sfm-split">
        <figure className="sfm-pane">
          <canvas ref={canvasRef} className="sfm-canvas" />
          <figcaption>
            {stage === "features" || stage === "done" || stage === "solving"
              ? "ORB corners · matches to the next frame"
              : "frames"}
          </figcaption>
        </figure>

        <figure className="sfm-pane">
          <div className="sfm-3d-wrap">
            <Reconstruction3D state={state} truth={truth} />
          </div>
          <figcaption>
            triangulated points · <span className="sfm-key sfm-key-est">estimated path</span>
            {ate && <> · <span className="sfm-key sfm-key-true">true path</span></>}
          </figcaption>
        </figure>
      </div>

      <div className="sfm-hud">
        <p className="sfm-step">
          {stage === "booting" && "loading OpenCV…"}
          {stage === "rendering" && "rendering the sequence…"}
          {stage === "features" && `finding corners — frame ${current + 1} of ${frameCount}`}
          {stage === "solving" && (note || "matching and triangulating…")}
          {stage === "done" && "reconstruction"}
          {stage === "failed" && "failed"}
        </p>
        {stage === "failed" && <p className="sfm-error">{error}</p>}

        <dl className="sfm-stats">
          {results.length > 0 && (
            <>
              <div><dt>frames</dt><dd>{results.length}</dd></div>
              <div><dt>corners / frame</dt><dd>{results[current]?.count ?? 0}</dd></div>
              <div><dt>ORB</dt><dd>{meanMs.toFixed(0)} ms</dd></div>
            </>
          )}
          {state && (
            <>
              <div><dt>cameras placed</dt><dd>{state.cameras.length}</dd></div>
              <div><dt>points</dt><dd>{state.points.length.toLocaleString()}</dd></div>
              <div><dt>reprojection</dt><dd>{state.reprojection.toFixed(2)} px</dd></div>
              <div><dt>parallax</dt><dd>{state.parallax.toFixed(1)}°</dd></div>
            </>
          )}
          {ate && (
            <div className="sfm-truth">
              <dt>path error vs truth</dt>
              <dd>{ate.percent.toFixed(2)}%</dd>
            </div>
          )}
        </dl>
        {build && <p className="sfm-build">{build}</p>}
      </div>

      <div className="sfm-live-controls">
        {/* The way across to the live mode. Offered from the rendered demo
            rather than replacing it: the rendered path is deterministic,
            always works, and is the one scored against ground truth, so it
            stays the thing a visitor lands on. */}
        {/* "Live camera", not "Use my camera" -- the live view has its own
            button with that label, and it is a SEPARATE click on purpose.
            getUserMedia spends the transient user activation, and asking for
            it from the click that merely switched modes would be asking
            across a remount. Two clicks, each doing one thing. */}
        <button type="button" className="sfm-button" onClick={onUseCamera}>
          Live camera &rarr;
        </button>
      </div>

      {results.length > 1 && stage !== "solving" && (
        <input
          className="sfm-scrub"
          type="range"
          min={0}
          max={results.length - 1}
          value={Math.min(current, results.length - 1)}
          onChange={(e) => setCurrent(Number(e.target.value))}
          aria-label="Frame"
        />
      )}
    </div>
  )
}
