"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import gsap from "gsap"
import { prefersReducedMotion, tweenDuration } from "@/helpers/motion"
import { sampleLogoPoints } from "@/components/layout/logoSamples"

// The loading screen: a field of glowing amber dots, scattered like a data/
// embedding plot, resolves into the site's own logo mark (see
// logoSamples.ts) as real asset-load progress climbs -- a classifier
// converging on an answer, not a generic spinner. Deliberately a plain DOM
// + 2D <canvas> overlay, not a second WebGL/R3F canvas: its only inputs
// each frame are a scalar (progress) and elapsed time, never the real
// scene's camera/geometry/depth buffer, so there's nothing here that can
// drift out of sync with the 3D scene the way the previous LiDAR-scan
// title screen repeatedly did.

const PARTICLE_COUNT_DESKTOP = 1600
const PARTICLE_COUNT_COARSE = 500
const SCATTER_RADIUS = 4.0 // multiple of the logo's own footprint particles start scattered across
const AMBER_LIGHT: [number, number, number] = [255, 179, 122] // #ffb37a
const AMBER_DEEP: [number, number, number] = [210, 90, 26] // #d25a1a
const GRADIENT_STEPS = 32
const BURST_DISTANCE = 220 // css px particles fly outward on burst
const STAMP_DURATION = 0.42 // seconds -- matches globals.css's .animate-stamp
const STAMP_EASE = "cubic-bezier(0.2, 0.8, 0.3, 1)" // same curve, for motion continuity with the hero name-stamp
const DESKTOP_DOT_BLUR = 3 // down from an earlier 6 -- crisper dots, since the connection graph now carries more of the visual richness

// Nearest-neighbor connection graph: each particle links to its 2-3 closest
// neighbors (by real, unclamped distance), redrawn continuously. A uniform
// spatial grid keeps this cheap (avoids an O(n^2) pairwise scan every
// frame) -- see rebuildGrid/findNeighbors below. The grid's own box is
// deliberately *tighter* than the particles' full scatter radius, and only
// used to pick which cell a particle buckets into (never for the actual
// distance/line-drawing math, which always uses true position). That one
// choice is what makes the "chaotic web while scattered, clean mesh once
// converged" effect happen for free: scattered particles clamp to the same
// border cells regardless of how far apart they really are, so their
// (true-distance) connections read as long, crossing lines; once particles
// land inside the box, clamping becomes a no-op and the graph naturally
// tightens into an accurate nearest-neighbor mesh tracing the logo.
const NEIGHBOR_COUNT = 3
const CONNECTION_GRID_SIZE = 24
const CONNECTION_GRID_MIN = -0.2
const CONNECTION_GRID_MAX = 1.2
const NEIGHBOR_REBUILD_INTERVAL_MS = 90
const LINE_TIER_THRESH = [0.05, 0.15] // normalized-space distance breakpoints
const LINE_TIER_ALPHA = [0.5, 0.25, 0.1]
const LINE_TIER_WIDTH = [1.1, 0.8, 0.6] // css px

const STATUS_WORDS: { at: number; text: string }[] = [
  { at: 0, text: "Scanning" },
  { at: 35, text: "Extracting Features" },
  { at: 70, text: "Classifying" },
  { at: 100, text: "Ready" },
]

function statusFor(progress: number) {
  let word = STATUS_WORDS[0].text
  for (const s of STATUS_WORDS) if (progress >= s.at) word = s.text
  return word
}

function buildAmberRamp(steps: number): string[] {
  const ramp: string[] = []
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const r = Math.round(AMBER_LIGHT[0] + (AMBER_DEEP[0] - AMBER_LIGHT[0]) * t)
    const g = Math.round(AMBER_LIGHT[1] + (AMBER_DEEP[1] - AMBER_LIGHT[1]) * t)
    const b = Math.round(AMBER_LIGHT[2] + (AMBER_DEEP[2] - AMBER_LIGHT[2]) * t)
    ramp.push(`rgb(${r}, ${g}, ${b})`)
  }
  return ramp
}

function smoothstep(t: number) {
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c)
}

interface Particles {
  n: number
  scatterX: Float32Array
  scatterY: Float32Array
  targetX: Float32Array
  targetY: Float32Array
  size: Float32Array
  phase: Float32Array
  colorT: Float32Array
}

function buildParticles(count: number): Particles {
  const targets = sampleLogoPoints(count)
  const n = targets.length
  const scatterX = new Float32Array(n)
  const scatterY = new Float32Array(n)
  const targetX = new Float32Array(n)
  const targetY = new Float32Array(n)
  const size = new Float32Array(n)
  const phase = new Float32Array(n)
  const colorT = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(Math.random()) * SCATTER_RADIUS // uniform-density disc
    scatterX[i] = 0.5 + Math.cos(angle) * radius
    scatterY[i] = 0.5 + Math.sin(angle) * radius
    targetX[i] = targets[i].x
    targetY[i] = targets[i].y
    size[i] = 1 + Math.random() * 1.6
    phase[i] = Math.random() * Math.PI * 2
    // Particles converging near the glyph's own center trend toward the
    // lighter end of the gradient, edges toward the deeper end -- a subtle
    // inner-glow read once resolved, instead of noisy random color.
    colorT[i] = Math.min(1, Math.hypot(targets[i].x - 0.5, targets[i].y - 0.5) * 2.2)
  }
  return { n, scatterX, scatterY, targetX, targetY, size, phase, colorT }
}

const EMPTY_PARTICLES: Particles = {
  n: 0,
  scatterX: new Float32Array(0),
  scatterY: new Float32Array(0),
  targetX: new Float32Array(0),
  targetY: new Float32Array(0),
  size: new Float32Array(0),
  phase: new Float32Array(0),
  colorT: new Float32Array(0),
}

interface ConnectionState {
  gridSize: number
  cellCount: Int32Array
  cellStart: Int32Array
  writeCursor: Int32Array
  cellOf: Int32Array
  cellParticles: Int32Array
  neighborIndex: Int32Array // -1 = no neighbor in that slot
  neighborDistSq: Float32Array
  currentX: Float32Array // this frame's drawn position -- shared between the line and dot passes
  currentY: Float32Array
}

function buildConnectionState(n: number): ConnectionState {
  const G = CONNECTION_GRID_SIZE
  return {
    gridSize: G,
    cellCount: new Int32Array(G * G),
    cellStart: new Int32Array(G * G + 1),
    writeCursor: new Int32Array(G * G),
    cellOf: new Int32Array(n),
    cellParticles: new Int32Array(n),
    neighborIndex: new Int32Array(n * NEIGHBOR_COUNT).fill(-1),
    neighborDistSq: new Float32Array(n * NEIGHBOR_COUNT),
    currentX: new Float32Array(n),
    currentY: new Float32Array(n),
  }
}

function clampCellIndex(v: number, gridSize: number): number {
  const t = (v - CONNECTION_GRID_MIN) / (CONNECTION_GRID_MAX - CONNECTION_GRID_MIN)
  const c = Math.floor(Math.min(1, Math.max(0, t)) * gridSize)
  return c >= gridSize ? gridSize - 1 : c
}

// Bucket-sort (linked-cell-list) grid rebuild -- O(n + gridSize^2), no
// per-call allocation. Only run on a cadence (see drawFrame), not every
// frame; positions still animate smoothly every frame regardless.
function rebuildGrid(particles: Particles, conn: ConnectionState, eased: number) {
  const G = conn.gridSize
  conn.cellCount.fill(0)

  for (let i = 0; i < particles.n; i++) {
    const nx = particles.scatterX[i] + (particles.targetX[i] - particles.scatterX[i]) * eased
    const ny = particles.scatterY[i] + (particles.targetY[i] - particles.scatterY[i]) * eased
    const cell = clampCellIndex(ny, G) * G + clampCellIndex(nx, G)
    conn.cellOf[i] = cell
    conn.cellCount[cell]++
  }

  conn.cellStart[0] = 0
  for (let c = 0; c < G * G; c++) conn.cellStart[c + 1] = conn.cellStart[c] + conn.cellCount[c]

  conn.writeCursor.set(conn.cellStart.subarray(0, G * G))
  for (let i = 0; i < particles.n; i++) {
    const cell = conn.cellOf[i]
    conn.cellParticles[conn.writeCursor[cell]++] = i
  }
}

// K=3 nearest-neighbor search via a 3x3 cell scan around each particle's own
// bucket -- a running 3-slot insertion, no allocation. Always compares true
// (unclamped) positions, even though bucketing used clamped ones.
function findNeighbors(particles: Particles, conn: ConnectionState, eased: number) {
  const G = conn.gridSize
  for (let i = 0; i < particles.n; i++) {
    const nxi = particles.scatterX[i] + (particles.targetX[i] - particles.scatterX[i]) * eased
    const nyi = particles.scatterY[i] + (particles.targetY[i] - particles.scatterY[i]) * eased
    const cxi = clampCellIndex(nxi, G)
    const cyi = clampCellIndex(nyi, G)

    let b0i = -1, b0d = Infinity
    let b1i = -1, b1d = Infinity
    let b2i = -1, b2d = Infinity

    for (let dcy = -1; dcy <= 1; dcy++) {
      const ccy = cyi + dcy
      if (ccy < 0 || ccy >= G) continue
      for (let dcx = -1; dcx <= 1; dcx++) {
        const ccx = cxi + dcx
        if (ccx < 0 || ccx >= G) continue
        const cell = ccy * G + ccx
        const start = conn.cellStart[cell]
        const end = conn.cellStart[cell + 1]
        for (let s = start; s < end; s++) {
          const j = conn.cellParticles[s]
          if (j === i) continue
          const nxj = particles.scatterX[j] + (particles.targetX[j] - particles.scatterX[j]) * eased
          const nyj = particles.scatterY[j] + (particles.targetY[j] - particles.scatterY[j]) * eased
          const dx = nxi - nxj
          const dy = nyi - nyj
          const d = dx * dx + dy * dy
          if (d < b2d) {
            if (d < b0d) { b2i = b1i; b2d = b1d; b1i = b0i; b1d = b0d; b0i = j; b0d = d }
            else if (d < b1d) { b2i = b1i; b2d = b1d; b1i = j; b1d = d }
            else { b2i = j; b2d = d }
          }
        }
      }
    }

    const base = i * NEIGHBOR_COUNT
    conn.neighborIndex[base] = b0i; conn.neighborDistSq[base] = b0d
    conn.neighborIndex[base + 1] = b1i; conn.neighborDistSq[base + 1] = b1d
    conn.neighborIndex[base + 2] = b2i; conn.neighborDistSq[base + 2] = b2d
  }
}

const LINE_COLOR = `rgb(${AMBER_LIGHT[0]}, ${AMBER_LIGHT[1]}, ${AMBER_LIGHT[2]})`

// Exactly 3 stroke() calls total (not per particle/edge) -- every candidate
// edge is bucketed by true distance into one of 3 tiers, each accumulated
// into a single path first. No shadowBlur on lines, on any tier: crisp flat
// lines read as "computed structure," deliberately contrasting the dots'
// own soft glow ("raw data") -- and keeps this the cheap part of the frame.
function drawConnections(ctx: CanvasRenderingContext2D, particles: Particles, conn: ConnectionState) {
  ctx.strokeStyle = LINE_COLOR
  ctx.shadowBlur = 0
  const t0 = LINE_TIER_THRESH[0] * LINE_TIER_THRESH[0]
  const t1 = LINE_TIER_THRESH[1] * LINE_TIER_THRESH[1]

  for (let tier = 0; tier < 3; tier++) {
    ctx.beginPath()
    for (let i = 0; i < particles.n; i++) {
      const base = i * NEIGHBOR_COUNT
      for (let k = 0; k < NEIGHBOR_COUNT; k++) {
        const j = conn.neighborIndex[base + k]
        if (j < 0) continue
        const d = conn.neighborDistSq[base + k]
        const edgeTier = d < t0 ? 0 : d < t1 ? 1 : 2
        if (edgeTier !== tier) continue
        ctx.moveTo(conn.currentX[i], conn.currentY[i])
        ctx.lineTo(conn.currentX[j], conn.currentY[j])
      }
    }
    ctx.globalAlpha = LINE_TIER_ALPHA[tier]
    ctx.lineWidth = LINE_TIER_WIDTH[tier]
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

export interface LoadingScreenHandle {
  burst: () => Promise<void>
}

interface LoadingScreenProps {
  progress: number
  isCoarsePointer: boolean
  onEnter: () => void
}

export const LoadingScreen = forwardRef<LoadingScreenHandle, LoadingScreenProps>(
  ({ progress, isCoarsePointer, onEnter }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const enterButtonRef = useRef<HTMLButtonElement>(null)
    const reducedMotion = useMemo(() => prefersReducedMotion(), [])
    const particleCount = isCoarsePointer ? PARTICLE_COUNT_COARSE : PARTICLE_COUNT_DESKTOP
    // buildParticles rasterizes to an offscreen <canvas> (via
    // sampleLogoPoints), which only exists in a browser -- guarded so this
    // doesn't crash Next.js's server-side prerender of this "use client"
    // component. Never influences SSR'd/hydrated JSX (only later imperative
    // canvas painting), so there's no hydration-mismatch risk in the client
    // recomputing real particles where the server had none.
    const particles = useMemo(
      () => (typeof document === "undefined" ? EMPTY_PARTICLES : buildParticles(particleCount)),
      [particleCount]
    )
    const amberRamp = useMemo(() => buildAmberRamp(GRADIENT_STEPS), [])
    const connections = useMemo(() => buildConnectionState(particles.n), [particles])
    const lastGridRebuildTimeRef = useRef(0)
    // Cut, not degraded, on coarse pointer -- matches this codebase's
    // existing perf-tier convention (ContactShadows/N8AO in page.tsx).
    const showConnections = !isCoarsePointer

    const progressRef = useRef(progress)
    useEffect(() => {
      progressRef.current = progress
    }, [progress])

    const [displayPercent, setDisplayPercent] = useState(0)
    // Lerp-chased toward the real `progress` prop, not read/set directly --
    // this is also what drives dot convergence and Enter-readiness (see
    // below), so all three (dots, counter, button) always stay in sync with
    // each other even when the real underlying asset load finishes near-
    // instantly (e.g. cached/local assets), rather than the button
    // appearing the instant `progress` hits 100 while the counter is still
    // visibly catching up from a lower number.
    const smoothProgressRef = useRef(0)
    const [burstAmount, setBurstAmount] = useState(0)
    const burstingRef = useRef(false)
    const burstAmountRef = useRef(0)
    const [readyState, setReadyState] = useState(false)
    // Reduced motion skips the lerp/rAF loop entirely (see below), so its
    // readiness tracks raw progress directly instead of the smoothed ref.
    const ready = reducedMotion ? progress >= 100 : readyState

    useEffect(() => {
      if (ready) enterButtonRef.current?.focus()
    }, [ready])

    // Reduced motion: the percentage is real information, not decorative
    // motion, so it still updates live -- just without the lerp-chase used
    // below for the animated case.
    useEffect(() => {
      if (!reducedMotion) return
      setDisplayPercent(Math.round(progress))
    }, [reducedMotion, progress])

    const drawFrame = (eased: number, burst: number) => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!canvas || !ctx) return
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.clearRect(0, 0, w, h)

      const boxSize = Math.min(Math.min(w, h) * 0.136, 128)
      const originX = w / 2 - boxSize / 2
      const originY = h / 2 - boxSize / 2 - 24
      const centerX = w / 2
      const centerY = originY + boxSize / 2

      const t = performance.now() / 1000
      // Scaled to boxSize (not a fixed px value) so jitter stays visually
      // proportional regardless of how large the logo renders.
      const jitterAmp = reducedMotion ? 0 : boxSize * 0.016 * (1 - eased * 0.85)
      ctx.shadowBlur = isCoarsePointer ? 0 : DESKTOP_DOT_BLUR

      const posScratch: [number, number] = [0, 0]
      const computePosition = (i: number) => {
        const jx = jitterAmp === 0 ? 0 : Math.sin(t * 0.6 + particles.phase[i]) * jitterAmp
        const jy = jitterAmp === 0 ? 0 : Math.cos(t * 0.5 + particles.phase[i] * 1.3) * jitterAmp
        const nx = particles.scatterX[i] + (particles.targetX[i] - particles.scatterX[i]) * eased
        const ny = particles.scatterY[i] + (particles.targetY[i] - particles.scatterY[i]) * eased
        posScratch[0] = originX + nx * boxSize + jx
        posScratch[1] = originY + ny * boxSize + jy
      }

      const drawDot = (px: number, py: number, i: number, alpha: number) => {
        const color = amberRamp[Math.round(particles.colorT[i] * (amberRamp.length - 1))]
        ctx.globalAlpha = alpha
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.beginPath()
        ctx.arc(px, py, particles.size[i], 0, Math.PI * 2)
        ctx.fill()
      }

      if (!showConnections || burst > 0) {
        // Bursting or coarse-pointer: identical to the pre-connections
        // code path -- no grid rebuild, no line drawing, ever, on either.
        for (let i = 0; i < particles.n; i++) {
          computePosition(i)
          let px = posScratch[0]
          let py = posScratch[1]
          let alpha = 1
          if (burst > 0) {
            const dx = px - centerX
            const dy = py - centerY
            const dist = Math.hypot(dx, dy) || 0.001
            const extra = burst * BURST_DISTANCE
            px = centerX + (dx / dist) * (dist + extra)
            py = centerY + (dy / dist) * (dist + extra)
            alpha = 1 - burst
          }
          drawDot(px, py, i, alpha)
        }
      } else {
        for (let i = 0; i < particles.n; i++) {
          computePosition(i)
          connections.currentX[i] = posScratch[0]
          connections.currentY[i] = posScratch[1]
        }

        const now = performance.now()
        if (now - lastGridRebuildTimeRef.current >= NEIGHBOR_REBUILD_INTERVAL_MS) {
          rebuildGrid(particles, connections, eased)
          findNeighbors(particles, connections, eased)
          lastGridRebuildTimeRef.current = now
        }

        drawConnections(ctx, particles, connections)
        ctx.shadowBlur = isCoarsePointer ? 0 : DESKTOP_DOT_BLUR // drawConnections resets this; restore for dots

        for (let i = 0; i < particles.n; i++) {
          drawDot(connections.currentX[i], connections.currentY[i], i, 1)
        }
      }
      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
    }

    useImperativeHandle(ref, () => ({
      burst: () =>
        new Promise<void>((resolve) => {
          burstingRef.current = true
          const state = { t: 0 }
          gsap.to(state, {
            t: 1,
            duration: tweenDuration(STAMP_DURATION),
            ease: STAMP_EASE,
            onUpdate: () => {
              burstAmountRef.current = state.t
              setBurstAmount(state.t)
              // No persistent rAF loop runs in reduced motion, so onUpdate
              // is the only per-frame hook available to draw the burst.
              if (reducedMotion) drawFrame(1, state.t)
            },
            onComplete: () => resolve(),
          })
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [reducedMotion])

    // Canvas sizing -- devicePixelRatio capped at 2, matching the dpr={[1,2]}
    // already used on the site's real R3F canvases -- draws in CSS-px
    // coordinates thereafter.
    useEffect(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!canvas || !ctx) return
      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = window.innerWidth * dpr
        canvas.height = window.innerHeight * dpr
        canvas.style.width = `${window.innerWidth}px`
        canvas.style.height = `${window.innerHeight}px`
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        drawFrame(reducedMotion ? 1 : smoothstep(smoothProgressRef.current / 100), burstAmountRef.current)
      }
      resize()
      window.addEventListener("resize", resize)
      return () => window.removeEventListener("resize", resize)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [particles, amberRamp, connections, isCoarsePointer, reducedMotion])

    // Continuous animation loop -- normal (non-reduced-motion) case only.
    // `progress` is read from a ref, not a dependency, so this loop never
    // tears down/rebuilds on the frequent useProgress ticks that fire while
    // assets stream in.
    useEffect(() => {
      if (reducedMotion) return
      let raf = 0
      let lastTime = performance.now()
      const tick = (now: number) => {
        // Time-delta, not frame-count, based -- an exponential decay toward
        // the real progress value that reaches ~99%+ in a consistent ~1.5s
        // of real time regardless of actual frame rate (a throttled/janky
        // tab shouldn't make this convergence take longer in wall-clock
        // terms, it should just render fewer, larger steps of the same
        // real-time curve).
        const dt = Math.min((now - lastTime) / 1000, 0.1)
        lastTime = now
        const factor = 1 - Math.exp(-3 * dt)
        smoothProgressRef.current += (progressRef.current - smoothProgressRef.current) * factor

        const eased = burstingRef.current ? 1 : smoothstep(smoothProgressRef.current / 100)
        drawFrame(eased, burstAmountRef.current)

        const rounded = Math.round(smoothProgressRef.current)
        setDisplayPercent((prev) => (prev === rounded ? prev : rounded))
        if (smoothProgressRef.current >= 99.5) setReadyState((prev) => (prev ? prev : true))

        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [particles, amberRamp, connections, isCoarsePointer, reducedMotion])

    const boxSizeCss = "min(13.6vmin, 128px)"
    const enterOpacity = (ready ? 1 : 0) * (1 - burstAmount)

    return (
      <div
        className="absolute inset-0 z-20"
        style={{ pointerEvents: "none", backgroundColor: `rgba(10, 10, 10, ${1 - burstAmount})` }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ opacity: ready ? 0 : 1, transition: "opacity 0.6s ease" }}
        />
        {/* Once the point cloud resolves, cross-fade from the dot/line
            rendering into the real vector mark -- "raw data" settling into
            a clean, confident answer, the same read the connection graph
            is already going for. Sits behind the Enter button so its
            frosted glass still overlays it, same as the dots did before. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(50% - 24px)",
            width: boxSizeCss,
            height: boxSizeCss,
            transform: "translate(-50%, -50%)",
            opacity: ready ? 1 - burstAmount : 0,
            transition: "opacity 0.6s ease",
            pointerEvents: "none",
            filter: "drop-shadow(0 0 12px rgba(255,179,122,0.55))",
          }}
        >
          <svg width="100%" height="100%" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
            <g fill="#ffb37a">
              <path d="M70 10 L114 35 L70 60 Z" />
              <path d="M117 40 L117 96 L70 67 Z" />
              <path d="M114 102 L70 128 L70 74 Z" />
              <path d="M22 35 L65 10 L64 60 Z" />
              <g transform="translate(45,0) rotate(30)">
                <rect x="8" y="58" width="42" height="6" rx="4" />
                <rect x="21" y="73" width="35" height="6" rx="4" />
                <rect x="27" y="88" width="42" height="6" rx="4" />
              </g>
            </g>
          </svg>
        </div>
        {/* Percentage/status readout -- parked at the bottom of the screen,
            clear of the dot/line network above, and fades out once ready
            rather than staying visible alongside the Enter pill. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: "6%",
            transform: "translateX(-50%)",
            textAlign: "center",
            opacity: ready ? 0 : 1 - burstAmount,
            pointerEvents: "none",
            transition: "opacity 0.4s ease",
          }}
        >
          <div className="font-nunito tabular-nums text-xl sm:text-2xl text-white tracking-tight">
            {displayPercent}%
          </div>
          <div className="font-nunito text-[10px] sm:text-xs uppercase tracking-[0.2em] mt-1" style={{ color: "#ffb37a" }}>
            {statusFor(displayPercent)}
          </div>
        </div>
        {/* The real click target once resolved -- the logo/circle above is
            purely decorative now; entering the site is driven by this text,
            not by clicking the mark. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: `calc(50% - 24px + ${boxSizeCss} / 2 + 24px)`,
            transform: "translateX(-50%)",
            opacity: enterOpacity,
            pointerEvents: ready ? "auto" : "none",
            transition: "opacity 0.5s ease",
          }}
        >
          <button
            ref={enterButtonRef}
            type="button"
            aria-label="Enter site"
            onClick={onEnter}
            disabled={!ready}
            className="font-nunito uppercase tracking-[0.2em] text-sm sm:text-base text-white px-8 py-3"
            style={{
              cursor: ready ? "pointer" : "default",
              // No pill/border/glow left to frame this -- just the word
              // itself, so the browser's own default focus rectangle (this
              // button is auto-focused once ready) is suppressed too rather
              // than left as the last remaining bit of chrome.
              outline: "none",
            }}
          >
            Enter
          </button>
        </div>
        {/* Decorative glass frame around the resolved logo -- no longer
            interactive; the Enter pill above is the real button now. The
            breathing pulse lives on an inner element (see below) so its own
            scale-based keyframe never fights this div's centering transform
            -- a CSS animation's keyframe values win the cascade over inline
            styles for whichever properties they declare, so animating scale
            directly on a translate(-50%,-50%)-centered element would replace
            that centering transform outright. */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(50% - 24px)",
            width: boxSizeCss,
            height: boxSizeCss,
            transform: "translate(-50%, -50%)",
            opacity: enterOpacity,
            pointerEvents: "none",
            transition: "opacity 0.4s ease",
          }}
        >
          <div
            className={ready ? "loading-enter-pulse" : ""}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: "9999px",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(210,90,26,0.6)",
              boxShadow: "0 0 26px 4px rgba(210,90,26,0.5)",
            }}
          />
        </div>
      </div>
    )
  }
)

LoadingScreen.displayName = "LoadingScreen"
