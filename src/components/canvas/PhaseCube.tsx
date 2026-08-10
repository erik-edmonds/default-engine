"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import gsap from "gsap"

import { TIME_OF_DAY_ORDER, TRANSITION_SECONDS, phaseIndex, nextPhase, forwardSteps, type TimeOfDay } from "./environmentPresets"
import { tweenDuration } from "@/helpers/motion"

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

function CubeMesh({ meshRef, targetRotationRef }: { meshRef: React.RefObject<THREE.Mesh | null>; targetRotationRef: React.RefObject<number> }) {
  const [textures] = useState(buildFaceTextures)
  const materials = useMemo(() => buildFaceMaterials(textures), [textures])

  // Reads the live ref rather than a frozen prop, so this is correct
  // whichever way the mount-order race goes against the parent's own
  // phase-driven effect below (a parent-side effect can't guarantee
  // meshRef.current is set yet, since <Canvas> is a separate reconciler
  // root) -- if the parent's effect already ran and found meshRef null (so
  // it skipped tweening), this picks up the target angle it computed; if
  // this runs first, the parent's next effect run tweens from here.
  useEffect(() => {
    if (meshRef.current) meshRef.current.rotation.y = targetRotationRef.current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    for (const t of Object.values(textures)) t.dispose()
    for (const m of materials) m.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <mesh ref={meshRef} material={materials}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  )
}

export interface PhaseCubeProps {
  /** The phase the cube should be showing/rotating toward. Always controlled. */
  phase: TimeOfDay
  /** Seconds for the rotation into `phase` -- ~3 for a click, ~120 for the
   *  ambient auto-cycle. Must be the same value handed to Environment/
   *  OceanWater for this same change, or the cube and scene drift apart. */
  transitionSeconds: number
  /** Fired on click. The cube doesn't advance itself -- the parent owns the
   *  cycle and feeds the result back via `phase`. */
  onAdvance?: () => void
  size?: number
}

export default function PhaseCube({ phase, transitionSeconds, onAdvance, size = 56 }: PhaseCubeProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  // Quarter-turns taken since mount, monotonically increasing. The rotation
  // target is always this ABSOLUTE angle, never a relative "+=90deg": once a
  // slow (2-minute) rotation tween can be interrupted mid-flight by a click
  // (see overwrite:true below), a relative tween resuming from wherever it
  // got killed would leave the cube permanently off-axis from the face it
  // claims to show, with the error compounding on every future interruption.
  // An absolute target self-corrects instead.
  const stepsRef = useRef(phaseIndex(phase))
  const targetRotationRef = useRef(stepsRef.current * (Math.PI / 2))
  const phaseRef = useRef(phase)
  const [busy, setBusy] = useState(false)
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (phase === phaseRef.current) return
    const from = TIME_OF_DAY_ORDER[((stepsRef.current % 4) + 4) % 4]
    phaseRef.current = phase
    stepsRef.current += forwardSteps(from, phase)
    targetRotationRef.current = stepsRef.current * (Math.PI / 2)

    const mesh = meshRef.current
    // Can be null if this effect beats CubeMesh's own mount effect across
    // the Canvas's separate reconciler root -- CubeMesh applies
    // targetRotationRef itself in that case, so nothing more to do here.
    if (!mesh) return

    if (transitionSeconds <= 0) {
      gsap.killTweensOf(mesh.rotation)
      mesh.rotation.y = targetRotationRef.current
      return
    }
    gsap.to(mesh.rotation, {
      y: targetRotationRef.current,
      duration: tweenDuration(transitionSeconds),
      ease: "power2.inOut",
      // Without this, an interrupting fast tween finishing while a slow
      // one still has time left hands control back to the slow tween,
      // visibly dragging the cube back toward the phase just skipped.
      overwrite: true,
    })
  }, [phase, transitionSeconds])

  const current = phase
  const next = nextPhase(phase)

  const handleClick = useCallback(() => {
    if (busy) return
    setBusy(true)
    onAdvance?.()
    // Fixed to the click duration on purpose -- using the transitionSeconds
    // prop would lock the button out for the full 2 minutes of an
    // auto-transition. This is now just a UX rate-limit, not a correctness
    // requirement (absolute rotation + overwrite:true means rapid clicks
    // re-target cleanly either way).
    const lockMs = tweenDuration(TRANSITION_SECONDS) * 1000
    busyTimer.current = setTimeout(() => setBusy(false), lockMs)
  }, [busy, onAdvance])

  useEffect(() => () => { if (busyTimer.current) clearTimeout(busyTimer.current) }, [])

  return (
    <button
      type="button"
      onClick={handleClick}
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
        <CubeMesh meshRef={meshRef} targetRotationRef={targetRotationRef} />
      </Canvas>
    </button>
  )
}
