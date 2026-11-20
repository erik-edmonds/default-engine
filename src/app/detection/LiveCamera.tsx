"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { ArLayer } from "@/app/detection/ArLayer"
import { SceneFallback } from "@/components/layout/SceneFallback"
import { FrameTimes } from "@/helpers/frameStats"
import { useCamera, useCameraAvailability } from "@/helpers/useCamera"
import { useCoarsePointer } from "@/helpers/useCoarsePointer"
import { CvClient } from "@/lib/sfm/cvClient"
import type { Intrinsics, Pose, Vec3 } from "@/lib/sfm/geometry"
import { intrinsicsFromFov, LiveSlam, type SlamStatus } from "@/lib/sfm/liveSlam"

/** Structure from motion on whatever you point at it.
 *
 *  TRACKING RESOLUTION IS NOT DISPLAY RESOLUTION. The video is shown at
 *  whatever the camera gives; the pixels handed to OpenCV are a downscaled
 *  copy. Corner tracking does not get better above a few hundred pixels across
 *  and every pixel costs time in a WASM build, so this is the single biggest
 *  lever on whether the thing runs at a usable rate on a phone.
 */

/** 480x360 on a laptop, smaller on a phone -- which has both a slower WASM
 *  runtime and a thermal budget it will quietly take back. */
const TRACK_WIDTH_DESKTOP = 480
const TRACK_WIDTH_MOBILE = 384

interface Live {
  status: SlamStatus
  /** Milliseconds a frame, median and p95. Never FPS: see frameStats.ts, which
   *  argues the case at length. A mean folds the spikes that actually hurt
   *  into a baseline nothing ever ran at. */
  medianMs: number
  p95Ms: number
}

export function LiveCamera({ onExit }: { onExit: () => void }) {
  const availability = useCameraAvailability()
  const coarse = useCoarsePointer()
  const { start, stop, active, problem, busy } = useCamera()

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const grabRef = useRef<HTMLCanvasElement | null>(null)
  const slamRef = useRef<LiveSlam | null>(null)
  const cvRef = useRef<CvClient | null>(null)
  const timesRef = useRef(new FrameTimes())
  const runningRef = useRef(false)
  const anchorRef = useRef<Vec3 | null>(null)
  const lastPointsRef = useRef<{ points: Float32Array; ids: Int32Array }>({
    points: new Float32Array(0),
    ids: new Int32Array(0),
  })

  const [live, setLive] = useState<Live | null>(null)
  const [anchor, setAnchor] = useState<Vec3 | null>(null)
  const [anchorScale, setAnchorScale] = useState(0.5)
  const [intrinsics, setIntrinsics] = useState<Intrinsics | null>(null)
  /** Size of the frames handed to the tracker. STATE, not a ref read during
   *  render: the AR canvas needs it to shape its frustum. */
  const [trackSize, setTrackSize] = useState<{ width: number; height: number } | null>(null)
  /** Whatever killed the frame loop, if anything did. */
  const [failure, setFailure] = useState<string | null>(null)
  /** The solved pose, published to the AR layer BY REF.
   *
   *  It changes at camera rate. Putting it in state would re-render this
   *  component and the whole AR tree for every frame the tracker solves --
   *  which is the thing scanStats.ts argues against at length: a readout must
   *  not perturb the loop it is reporting on. ArLayer reads this inside
   *  useFrame, which is outside render and therefore the right place. */
  const poseRef = useRef<Pose | null>(null)





  // Declared in dependency order -- drawOverlay, then pump, then begin --
  // because a useCallback referencing one declared below it is a temporal
  // dead zone the React Compiler lint rejects outright, not a style note.
  const drawOverlay = useCallback((result: { points: Float32Array; ids: Int32Array }) => {
    const canvas = overlayRef.current
    const grab = grabRef.current
    const slam = slamRef.current
    if (!canvas || !grab || !slam) return
    if (canvas.width !== grab.width) {
      canvas.width = grab.width
      canvas.height = grab.height
    }
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < result.ids.length; i++) {
      // Teal once a point has a 3D position, dim while it is only being
      // followed -- so the map filling in is visible on the image itself.
      const anchored = slam.points.has(result.ids[i])
      ctx.fillStyle = anchored ? "rgba(127, 212, 193, 0.95)" : "rgba(231, 237, 243, 0.35)"
      ctx.fillRect(result.points[i * 2] - 1.5, result.points[i * 2 + 1] - 1.5, 3, 3)
    }
  }, [])

  /** One frame: grab, track, solve, draw. */
  const pump = useCallback(() => {
    const video = videoRef.current
    const grab = grabRef.current
    const slam = slamRef.current
    if (!video || !grab || !slam) return

    let inFlight = false
    let last = performance.now()
    let lastReadout = 0

    const step = async () => {
      if (!runningRef.current) return
      if (video.readyState < 2 || inFlight) {
        requestAnimationFrame(step)
        return
      }
      inFlight = true
      const ctx = grab.getContext("2d", { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(video, 0, 0, grab.width, grab.height)
      const image = ctx.getImageData(0, 0, grab.width, grab.height)

      // Colour is sampled BEFORE the buffer is transferred: after the post it
      // is detached and reading it throws.
      const sample = (x: number, y: number): [number, number, number] => {
        const px = Math.max(0, Math.min(grab.width - 1, Math.round(x)))
        const py = Math.max(0, Math.min(grab.height - 1, Math.round(y)))
        const o = (py * grab.width + px) * 4
        return [image.data[o] / 255, image.data[o + 1] / 255, image.data[o + 2] / 255]
      }
      const copy = image.data.buffer.slice(0)

      try {
        const result = await slam.frame(copy, grab.width, grab.height, sample)
        lastPointsRef.current = result
        drawOverlay(result)
      } catch (error) {
        // A worker that died takes the loop with it rather than spinning --
        // but it SAYS SO. Swallowing this silently left the camera running,
        // the video playing and the readout permanently empty, which looks
        // exactly like a hang and is the hardest kind of failure to chase.
        runningRef.current = false
        setFailure(String(error))
        return
      }

      const now = performance.now()
      const dt = now - last
      last = now
      // The same 500 ms guard FrameMeter uses: a backgrounded tab resuming is
      // a pause, not a slow frame, and one of them owns the p95 for the next
      // thousand frames.
      if (dt < 500) timesRef.current.push(dt)

      poseRef.current = slam.pose

      // FOUR TIMES A SECOND, not every frame. FrameMeter publishes its readout
      // at READOUT_HZ for exactly this reason: these numbers are for a human
      // to read, and a React commit per tracked frame costs more than the
      // tracking it is describing.
      if (now - lastReadout >= 250) {
        lastReadout = now
        setLive({
          status: slam.status(),
          medianMs: timesRef.current.percentile(0.5),
          p95Ms: timesRef.current.percentile(0.95),
        })
      }

      inFlight = false
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [drawOverlay])

  /** Drop an object where you are pointing.
   *
   *  The centre of the frame, at the depth of the mapped points nearest it --
   *  a median rather than a mean, because one badly triangulated point behind
   *  the wall would otherwise drag the anchor through it. */
  const place = useCallback(() => {
    const slam = slamRef.current
    const grab = grabRef.current
    if (!slam || !grab || slam.state !== "locked") return
    const { points, ids } = lastPointsRef.current
    const cx = grab.width / 2
    const cy = grab.height / 2
    const near: { d: number; X: Vec3 }[] = []
    for (let i = 0; i < ids.length; i++) {
      const X = slam.points.get(ids[i])
      if (!X) continue
      const d = Math.hypot(points[i * 2] - cx, points[i * 2 + 1] - cy)
      near.push({ d, X })
    }
    if (near.length < 4) return
    near.sort((a, b) => a.d - b.d)
    const chosen = near.slice(0, Math.min(24, near.length))
    const mid = (f: (p: Vec3) => number) => {
      const v = chosen.map((c) => f(c.X)).sort((a, b) => a - b)
      return v[v.length >> 1]
    }
    const at: Vec3 = [mid((p) => p[0]), mid((p) => p[1]), mid((p) => p[2])]
    anchorRef.current = at
    setAnchor(at)
  }, [])

  const begin = useCallback(() => {
    const trackWidth = coarse ? TRACK_WIDTH_MOBILE : TRACK_WIDTH_DESKTOP
    // Synchronously inside the click: getUserMedia spends the user
    // activation, and a call made after an await is refused. useEnterXr.ts
    // documents the identical rule for requestSession.
    void start({ width: 1280, height: 720 }).then((opened) => {
      if (!opened) return
      const video = videoRef.current
      if (!video) return
      video.srcObject = opened.stream
      void video.play().catch(() => {})

      const aspect = opened.height / opened.width
      const w = trackWidth
      const h = Math.round(trackWidth * aspect)

      const grab = document.createElement("canvas")
      grab.width = w
      grab.height = h
      grabRef.current = grab
      setTrackSize({ width: w, height: h })

      // `?fov=` overrides the assumption, the same runtime-knob idiom as
      // ?budget= on the scan viewer.
      const requested = Number(new URLSearchParams(window.location.search).get("fov"))
      const k = intrinsicsFromFov(w, h, Number.isFinite(requested) && requested > 20 ? requested : 60)
      setIntrinsics(k)

      const cv = new CvClient()
      cvRef.current = cv
      slamRef.current = new LiveSlam(cv, k)
      timesRef.current.reset()
      runningRef.current = true
      pump()
    })
  }, [coarse, start, pump])

  useEffect(() => {
    return () => {
      runningRef.current = false
      cvRef.current?.dispose()
      stop()
    }
  }, [stop])

  // --- the honest refusals -------------------------------------------------
  if (availability.kind === "insecure") {
    return (
      <SceneFallback
        title="The camera needs a secure page"
        detail="Browsers only hand out a camera over HTTPS, or on localhost. This page is plain http, so navigator.mediaDevices does not exist here at all — it is not a permission you can grant. Open the deployed site, or reach this machine on localhost."
        action="Back to the demo"
        onAction={onExit}
      />
    )
  }
  if (availability.kind === "unsupported") {
    return (
      <SceneFallback
        title="No camera API here"
        detail="This browser does not expose getUserMedia, so there is no way to open a camera from the page."
        action="Back to the demo"
        onAction={onExit}
      />
    )
  }

  const status = live?.status
  const locked = status?.state === "locked"

  return (
    <div className="sfm-live">
      {/* playsInline is load-bearing on iOS: without it Safari takes the
          stream fullscreen in its own player and the page never sees it. */}
      <video ref={videoRef} className="sfm-live-video" playsInline muted autoPlay />
      <canvas ref={overlayRef} className="sfm-live-overlay" />
      {intrinsics && trackSize && (
        <ArLayer
          poseRef={poseRef}
          anchor={anchor}
          anchorScale={anchorScale}
          k={intrinsics}
          width={trackSize.width}
          height={trackSize.height}
        />
      )}

      <div className="sfm-live-hud">
        <p className="sfm-step">{status?.hint ?? (busy ? "starting the camera…" : "camera")}</p>
        {problem && <p className="sfm-error" role="status">{problem}</p>}
        {failure && <p className="sfm-error" role="status">{failure}</p>}
        {status && (
          <dl className="sfm-stats">
            <div><dt>tracked</dt><dd>{status.tracked}</dd></div>
            <div><dt>paired</dt><dd>{status.paired}</dd></div>
            <div><dt>anchored</dt><dd>{status.anchored}</dd></div>
            <div><dt>map</dt><dd>{status.mapped.toLocaleString()}</dd></div>
            <div><dt>parallax</dt><dd>{status.parallax.toFixed(1)}°</dd></div>
            <div><dt>frame</dt><dd>{live?.medianMs.toFixed(1)} ms</dd></div>
            <div><dt>p95</dt><dd>{live?.p95Ms.toFixed(1)} ms</dd></div>
          </dl>
        )}
      </div>

      <div className="sfm-live-controls">
        {!active && (
          <button type="button" className="sfm-button" onClick={begin} disabled={busy}>
            {busy ? "Starting…" : "Use my camera"}
          </button>
        )}
        {active && (
          <>
            <button type="button" className="sfm-button" onClick={place} disabled={!locked}>
              {anchor ? "Move it here" : "Place an object"}
            </button>
            {anchor && (
              <input
                className="sfm-live-scale"
                type="range"
                min={0.05}
                max={1.2}
                step={0.01}
                value={anchorScale}
                onChange={(e) => setAnchorScale(Number(e.target.value))}
                aria-label="Object size (the scale is arbitrary)"
              />
            )}
            <button
              type="button"
              className="sfm-button"
              onClick={() => {
                slamRef.current?.reset()
                anchorRef.current = null
                setAnchor(null)
              }}
            >
              Re-seed
            </button>
          </>
        )}
        <button type="button" className="sfm-button sfm-button-quiet" onClick={onExit}>
          Back
        </button>
      </div>
    </div>
  )
}
