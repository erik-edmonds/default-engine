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

const PARTICLE_COUNT_DESKTOP = 900
const PARTICLE_COUNT_COARSE = 350
const AMBER_LIGHT: [number, number, number] = [255, 179, 122] // #ffb37a
const AMBER_DEEP: [number, number, number] = [210, 90, 26] // #d25a1a
const GRADIENT_STEPS = 32
const BURST_DISTANCE = 220 // css px particles fly outward on burst
const STAMP_DURATION = 0.42 // seconds -- matches globals.css's .animate-stamp
const STAMP_EASE = "cubic-bezier(0.2, 0.8, 0.3, 1)" // same curve, for motion continuity with the hero name-stamp

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
    const radius = Math.sqrt(Math.random()) * 1.7 // uniform-density disc, ~1.7x the logo's own footprint
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

      const boxSize = Math.min(Math.min(w, h) * 0.34, 320)
      const originX = w / 2 - boxSize / 2
      const originY = h / 2 - boxSize / 2 - 24
      const centerX = w / 2
      const centerY = originY + boxSize / 2

      const t = performance.now() / 1000
      const jitterAmp = reducedMotion ? 0 : 5 * (1 - eased * 0.85)
      ctx.shadowBlur = isCoarsePointer ? 0 : 6

      for (let i = 0; i < particles.n; i++) {
        const jx = jitterAmp === 0 ? 0 : Math.sin(t * 0.6 + particles.phase[i]) * jitterAmp
        const jy = jitterAmp === 0 ? 0 : Math.cos(t * 0.5 + particles.phase[i] * 1.3) * jitterAmp
        const nx = particles.scatterX[i] + (particles.targetX[i] - particles.scatterX[i]) * eased
        const ny = particles.scatterY[i] + (particles.targetY[i] - particles.scatterY[i]) * eased

        let px = originX + nx * boxSize + jx
        let py = originY + ny * boxSize + jy
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

        const color = amberRamp[Math.round(particles.colorT[i] * (amberRamp.length - 1))]
        ctx.globalAlpha = alpha
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.beginPath()
        ctx.arc(px, py, particles.size[i], 0, Math.PI * 2)
        ctx.fill()
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
    }, [particles, amberRamp, isCoarsePointer, reducedMotion])

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
    }, [particles, amberRamp, isCoarsePointer, reducedMotion])

    const boxSizeCss = "min(34vmin, 320px)"
    const enterOpacity = (ready ? 1 : 0) * (1 - burstAmount)

    return (
      <div
        className="absolute inset-0 z-20"
        style={{ pointerEvents: "none", backgroundColor: `rgba(10, 10, 10, ${1 - burstAmount})` }}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div style={{ height: `calc(${boxSizeCss} / 2 + 28px)` }} />
          <div
            className="font-nunito tabular-nums text-3xl sm:text-4xl text-white tracking-tight"
            style={{ opacity: 1 - burstAmount, transition: "opacity 0.2s ease" }}
          >
            {displayPercent}%
          </div>
          <div
            className="font-nunito text-xs sm:text-sm uppercase tracking-[0.2em] mt-1"
            style={{ color: "#ffb37a", opacity: 0.8 * (1 - burstAmount), transition: "opacity 0.3s ease" }}
          >
            {statusFor(displayPercent)}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "calc(50% - 24px)",
            width: boxSizeCss,
            height: boxSizeCss,
            transform: "translate(-50%, -50%)",
            opacity: enterOpacity,
            pointerEvents: ready ? "auto" : "none",
            transition: "opacity 0.4s ease",
          }}
        >
          <button
            ref={enterButtonRef}
            type="button"
            aria-label="Enter site"
            onClick={onEnter}
            disabled={!ready}
            className={`h-full w-full rounded-full ${ready ? "loading-enter-pulse" : ""}`}
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(210,90,26,0.6)",
              boxShadow: "0 0 26px 4px rgba(210,90,26,0.5)",
              cursor: ready ? "pointer" : "default",
              // Themed in place of the browser's default blue focus ring,
              // matching the site's accent rather than clashing with it.
              outlineColor: "#ffb37a",
            }}
          />
        </div>
      </div>
    )
  }
)

LoadingScreen.displayName = "LoadingScreen"
