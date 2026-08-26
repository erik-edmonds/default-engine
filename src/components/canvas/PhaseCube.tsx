"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import gsap from "gsap"

import { TIME_OF_DAY_ORDER, TRANSITION_SECONDS, phaseIndex, forwardSteps, type TimeOfDay } from "./environmentPresets"
import { tweenDuration } from "@/helpers/motion"
import { useSfx } from "@/helpers/useSfx"

// Same glyph shapes Dial.tsx used to draw as SVG, redrawn as canvas-2D paths
// so they can be baked into a CanvasTexture per cube face. Coordinates are a
// straight copy of Dial's old 24x24-viewBox attributes -- the canvas is
// scaled to that same 24-unit space once up front so every draw call below
// is numerically identical to the SVG it replaces.
const ICON_COLOR: Record<TimeOfDay, string> = {
  night: "#B5D4F4",
  dawn: "#F0997B",
  day: "#ff8c18",
  evening: "#eb6f17",
}
const FACE_BG = "#132038"

function paintGlyph(ctx: CanvasRenderingContext2D, phase: TimeOfDay) {
  ctx.fillStyle = FACE_BG
  ctx.fillRect(0, 0, 24, 24)
  const c = ICON_COLOR[phase]
  ctx.fillStyle = c
  ctx.strokeStyle = c

  if (phase === "night") {
    ctx.beginPath(); ctx.arc(12, 12, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = "#85B7EB"
    ctx.globalAlpha = 0.6
    ctx.beginPath(); ctx.arc(15.5, 9.5, 1.6, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 0.5
    ctx.beginPath(); ctx.arc(9.5, 14, 1.1, 0, Math.PI * 2); ctx.fill()
    ctx.globalAlpha = 1
    return
  }

  if (phase === "dawn") {
    ctx.fillStyle = "#B5D4F4"
    ctx.beginPath(); ctx.arc(12, 12, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(12, 12, 8, -Math.PI / 2, Math.PI / 2); ctx.fill()
    return
  }

  if (phase === "day") {
    ctx.beginPath(); ctx.arc(12, 12, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 1.8
    ctx.lineCap = "round"
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      ctx.beginPath()
      ctx.moveTo(12 + Math.cos(a) * 6.5, 12 + Math.sin(a) * 6.5)
      ctx.lineTo(12 + Math.cos(a) * 8, 12 + Math.sin(a) * 8)
      ctx.stroke()
    }
    return
  }

  // evening
  ctx.beginPath(); ctx.arc(12, 13, 5, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = 1.8
  ctx.lineCap = "round"
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(12 + Math.cos(a) * 7.5, 13 + Math.sin(a) * 7.5)
    ctx.lineTo(12 + Math.cos(a) * 9, 13 + Math.sin(a) * 9)
    ctx.stroke()
  }
  ctx.globalAlpha = 0.5
  ctx.lineWidth = 1.6
  ctx.beginPath(); ctx.moveTo(3, 20); ctx.lineTo(21, 20); ctx.stroke()
  ctx.globalAlpha = 1
}

function buildFaceTextures(): Record<TimeOfDay, THREE.CanvasTexture> {
  const textures = {} as Record<TimeOfDay, THREE.CanvasTexture>
  for (const phase of TIME_OF_DAY_ORDER) {
    const canvas = document.createElement("canvas")
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext("2d")!
    ctx.scale(128 / 24, 128 / 24)
    paintGlyph(ctx, phase)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    textures[phase] = tex
  }
  return textures
}

// Box face order is [+x, -x, +y, -y, +z, -z]. This mini-scene's camera
// sits on +Z looking toward the origin (no rotation set, so R3F's default
// lookAt applies), so the face actually visible at any given rotation.y=θ
// is whichever local face's normal currently points toward world +Z.
// Working that out for a plain Y-axis rotation (local axis -> world
// direction at angle θ): local +Z -> world +Z at θ=0, local -X -> world +Z
// at θ=90deg, local -Z -> world +Z at θ=180deg, local +X -> world +Z at
// θ=270deg. So the front-facing index sequence as rotation accumulates by
// +90deg per click is [4, 1, 5, 0] (+Z, -X, -Z, +X) -- that's the order
// TIME_OF_DAY_ORDER's 4 phases need to land in, not the material array's
// own index order. Getting this wrong (an earlier version just used
// TIME_OF_DAY_ORDER's own order as the array order) meant every click
// advanced the *scene* correctly but showed an unrelated face, drifting
// further out of sync with each click. The two caps (+y/-y, never
// front-facing at this fixed near-level framing) just reuse "dawn".
function buildFaceMaterials(textures: Record<TimeOfDay, THREE.CanvasTexture>) {
  const mat = (phase: TimeOfDay) => new THREE.MeshBasicMaterial({ map: textures[phase] })
  return [
    mat("night"), // +x -- front-facing at θ=270deg (3 clicks from dawn)
    mat("day"), // -x -- front-facing at θ=90deg (1 click from dawn)
    mat("dawn"), // +y cap
    mat("dawn"), // -y cap
    mat("dawn"), // +z -- front-facing at θ=0
    mat("evening"), // -z -- front-facing at θ=180deg (2 clicks from dawn)
  ]
}

function CubeMesh({ setMeshRef }: { setMeshRef: (instance: THREE.Mesh | null) => void }) {
  const [textures] = useState(buildFaceTextures)
  const materials = useMemo(() => buildFaceMaterials(textures), [textures])

  useEffect(() => () => {
    for (const t of Object.values(textures)) t.dispose()
    for (const m of materials) m.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // `setMeshRef` (a callback, not a plain ref object -- see the parent's
  // own comment on it) fires the instant this mesh actually attaches,
  // however late that is relative to the parent's own phase-driven effect.
  // <Canvas> is a SEPARATE react-three-fiber reconciler root, mounted
  // asynchronously (WebGL context creation etc.) -- there's no guarantee
  // it's ready by the time the parent's effect first runs, and no reliable
  // fixed delay to wait either.
  return (
    <mesh ref={setMeshRef} material={materials}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  )
}

export interface PhaseCubeProps {
  /** The phase the cube should start FROM if it's mounting into an
   *  already-in-progress transition (the common case -- see
   *  useTimeOfDayCycle.ts). Equals `phase` for a no-op/instant snap. */
  from: TimeOfDay
  /** The phase the cube should be showing/rotating toward. Always controlled. */
  phase: TimeOfDay
  /** Seconds for the rotation into `phase` -- ~3 for a click, ~90 for the
   *  ambient auto-cycle. Must be the same value handed to Environment/
   *  OceanWater for this same change, or the cube and scene drift apart. */
  transitionSeconds: number
  /** Fired on click. The cube doesn't advance itself -- the parent owns the
   *  cycle and feeds the result back via `phase`. */
  onAdvance?: () => void
  size?: number
}

export default function PhaseCube({ from, phase, transitionSeconds, onAdvance, size = 56 }: PhaseCubeProps) {
  const meshRef = useRef<THREE.Mesh | null>(null)
  // Quarter-turns taken since mount, monotonically increasing. Starts at
  // `from`, not `phase` -- otherwise, mounting mid-transition (the common
  // case; see useTimeOfDayCycle.ts), the cube would silently start already
  // facing `phase` with nothing to rotate, instead of animating in from
  // where it should actually be starting.  The rotation target is always
  // this ABSOLUTE angle, never a relative "+=90deg": once a slow (~90s)
  // rotation tween can be interrupted mid-flight by a click (see
  // overwrite:true below), a relative tween resuming from wherever it got
  // killed would leave the cube permanently off-axis from the face it
  // claims to show, with the error compounding on every future
  // interruption. An absolute target self-corrects instead.
  const stepsRef = useRef(phaseIndex(from))
  // The rotation the CURRENT transition starts from -- distinct from
  // targetRotationRef (below) on purpose. See applyRotation's own comment
  // for why a late-mounting mesh must snap here first, not straight to the
  // target.
  const fromRotationRef = useRef(stepsRef.current * (Math.PI / 2))
  const targetRotationRef = useRef(stepsRef.current * (Math.PI / 2))
  const phaseRef = useRef(from)
  const [busy, setBusy] = useState(false)
  const play = useSfx()
  // The actual re-entrancy guard `handleClick` checks -- `busy` (React
  // state) is NOT safe for this by itself: setBusy(true) only schedules a
  // re-render, it doesn't synchronously change `busy` in the current
  // closure, so two click events arriving before that re-render commits
  // (a genuine double-click, or two events the browser/OS coalesces close
  // together) can BOTH see the same stale busy=false and both fire --
  // observed live as a single click producing two back-to-back advances
  // (e.g. day->evening immediately overwritten by evening->night before
  // the first tween ever painted a frame, reading as a single jump
  // straight from day to night with evening never visible). A ref updates
  // immediately, with no render in between, so it can't be raced this way.
  // `busy` (state) is kept only for the cursor-style visual, which has no
  // correctness requirement on exactly when it updates.
  const busyRef = useRef(false)
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // What the cube actually LOOKS like right now, for the aria-label -- see
  // that label's own comment below. Starts at `from` since that's genuinely
  // still on screen until the rotation tween below finishes.
  const [settledPhase, setSettledPhase] = useState<TimeOfDay>(from)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Actually moves the mesh: snap to fromRotationRef (in case it isn't
  // already there -- see the mesh-ready callback below), then tween to
  // targetRotationRef. Pulled out of the tracking effect below so it can
  // ALSO run the moment a late-attaching mesh becomes available (see
  // setMeshRef), using whatever fromRotationRef/targetRotationRef the
  // tracking effect has ALREADY correctly computed by then, even if it ran
  // several phase changes ago while mesh was still null.
  const applyRotation = useCallback(() => {
    const mesh = meshRef.current
    if (!mesh) return
    if (transitionSeconds <= 0) {
      gsap.killTweensOf(mesh.rotation)
      mesh.rotation.y = targetRotationRef.current
      return
    }
    // Always start from fromRotationRef, not wherever mesh.rotation.y
    // currently happens to be (e.g. 0, on a brand new mesh that's never had
    // a rotation applied) -- otherwise a late-attaching mesh would tween
    // from the wrong place, or (worse) instantly jump because gsap has
    // nothing to interpolate from a mismatched starting value.
    mesh.rotation.y = fromRotationRef.current
    // Same auto/click split as Environment.tsx/OceanWater.ts: linear during
    // the unattended auto-cycle so the cube reads as constantly, smoothly
    // turning in sync with the sky rather than easing to a near-stop at
    // every phase boundary; eased only for the short, standalone click skip.
    const auto = transitionSeconds !== TRANSITION_SECONDS
    gsap.to(mesh.rotation, {
      y: targetRotationRef.current,
      duration: tweenDuration(transitionSeconds),
      ease: auto ? "none" : "power2.inOut",
      // Without this, an interrupting fast tween finishing while a slow
      // one still has time left hands control back to the slow tween,
      // visibly dragging the cube back toward the phase just skipped.
      overwrite: true,
    })
  }, [transitionSeconds])

  // Fires the instant the cube's mesh actually attaches -- see CubeMesh's
  // own comment on why this can't be assumed to happen before the effect
  // below first runs. Re-running applyRotation here (using whatever
  // fromRotationRef/targetRotationRef are CURRENT at that moment, not
  // whatever they were back when the tracking effect first computed them)
  // is what makes the cube correct regardless of how late <Canvas> mounts:
  // it snaps straight to the right starting face, then tweens on from
  // there, instead of a brand-new mesh silently defaulting to rotation 0
  // (dawn) or however the tracking effect's own snap/tween attempt landed
  // when it ran against a still-null mesh.
  const setMeshRef = useCallback((instance: THREE.Mesh | null) => {
    meshRef.current = instance
    if (instance) applyRotation()
  }, [applyRotation])

  useEffect(() => {
    if (phase === phaseRef.current) return
    phaseRef.current = phase

    // Self-correct stepsRef against `from` (the hook's own authoritative
    // "phase we're coming from" for this transition -- see
    // useTimeOfDayCycle.ts) before using it, instead of trusting stepsRef's
    // own derived phase unconditionally. Without this, stepsRef could stay
    // permanently wrong from a single bad mount: it's seeded once from the
    // `from` prop at mount (see its useRef initializer above), but if THIS
    // component's first render happens to land before page.tsx's resetTo()
    // corrects the SSR-safe "day" placeholder to the real clock hour --a
    // real race, since child effects run before parent effects in the same
    // commit, and resetTo lives in a parent effect -- stepsRef gets seeded
    // from that wrong placeholder. Every later transition only ever
    // advanced stepsRef relative to ITS OWN previous value, with nothing to
    // ever notice or fix the initial error: the cube (and, via
    // settledPhase below, the aria-label) would silently stay one or more
    // phases off from the real time of day for the rest of the session.
    // Resyncing to `from` here -- which the hook always keeps correct --
    // whenever they've drifted apart closes that permanently.
    const stepsPhase = TIME_OF_DAY_ORDER[((stepsRef.current % 4) + 4) % 4]
    if (stepsPhase !== from) {
      const laps = Math.floor(stepsRef.current / 4)
      stepsRef.current = laps * 4 + phaseIndex(from)
    }
    fromRotationRef.current = stepsRef.current * (Math.PI / 2)

    stepsRef.current += forwardSteps(from, phase)
    targetRotationRef.current = stepsRef.current * (Math.PI / 2)

    // Tracks when the rotation tween below ACTUALLY finishes, which is not
    // the same moment the next auto-advance is scheduled for: a click's own
    // tween completes in TRANSITION_SECONDS (~3s), but the phase then holds
    // for CLICK_DWELL_SECONDS longer (~8s more) before auto-progression
    // resumes -- see useTimeOfDayCycle.ts's holdSeconds. For the bulk of
    // that hold, the cube has ALREADY visually finished turning to `phase`;
    // it just isn't advancing further yet. Without this, `settledPhase`
    // would only ever be driven by `from`/`phase` directly, which is right
    // for the slow auto-cycle (where the ~90s tween genuinely dominates)
    // but backwards for a click: the label would keep calling the
    // ALREADY-ARRIVED-AT phase "changing to" for most of the hold, while
    // the cube's face (and the sky/water, on the exact same
    // TRANSITION_SECONDS duration) had already settled there.
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    const settleMs = transitionSeconds > 0 ? tweenDuration(transitionSeconds) * 1000 : 0
    if (settleMs <= 0) {
      setSettledPhase(phase)
    } else {
      setSettledPhase(from)
      settleTimerRef.current = setTimeout(() => setSettledPhase(phase), settleMs)
    }

    // No-ops (returns immediately) if mesh is still null -- see
    // setMeshRef's own comment for how that case is covered instead.
    applyRotation()
    // `from` always changes in lockstep with `phase` (see
    // useTimeOfDayCycle.ts -- every setTransition call sets both together),
    // so this never fires on a `from`-only change; listed because the
    // effect now reads it.
  }, [phase, from, transitionSeconds, applyRotation])

  // `phase` is the LIVE TARGET of the in-flight transition, not necessarily
  // what the scene currently looks like -- `settledPhase` (updated by the
  // timer above once the tween actually finishes) is. `phase` remains
  // correct as "changing to": once settledPhase catches up to it there's
  // nothing left in flight, so `current === next` briefly and the label
  // reads e.g. "Time of day: evening. Change to evening." until the NEXT
  // transition starts -- expected, not a bug (nothing else meaningfully
  // describes "arrived, nothing pending yet").
  const current = settledPhase
  const next = phase

  const handleClick = useCallback(() => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    onAdvance?.()
    // Fixed to the click duration on purpose -- using the transitionSeconds
    // prop would lock the button out for the full 2 minutes of an
    // auto-transition. This is now just a UX rate-limit, not a correctness
    // requirement (absolute rotation + overwrite:true means rapid clicks
    // re-target cleanly either way).
    const lockMs = tweenDuration(TRANSITION_SECONDS) * 1000
    busyTimer.current = setTimeout(() => {
      busyRef.current = false
      setBusy(false)
    }, lockMs)
  }, [onAdvance])

  useEffect(() => () => {
    if (busyTimer.current) clearTimeout(busyTimer.current)
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
  }, [])

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => { if (!busy) play("click") }}
      aria-label={`Time of day: ${current}. Change to ${next}.`}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.25)",
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(6px)",
        cursor: busy ? "default" : "pointer",
        padding: 0,
        overflow: "hidden",
        outlineOffset: 2,
      }}
    >
      <Canvas
        aria-hidden="true"
        gl={{ alpha: true }}
        camera={{ position: [0, 0, 2.1], fov: 35 }}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <CubeMesh setMeshRef={setMeshRef} />
      </Canvas>
    </button>
  )
}
