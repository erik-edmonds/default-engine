"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import gsap from "gsap"

import { TIME_OF_DAY_ORDER, type TimeOfDay } from "./environmentPresets"
import { prefersReducedMotion, tweenDuration } from "@/helpers/motion"

// Same glyph shapes Dial.tsx used to draw as SVG, redrawn as canvas-2D paths
// so they can be baked into a CanvasTexture per cube face. Coordinates are a
// straight copy of Dial's old 24x24-viewBox attributes -- the canvas is
// scaled to that same 24-unit space once up front so every draw call below
// is numerically identical to the SVG it replaces.
const ICON_COLOR: Record<TimeOfDay, string> = {
  night: "#B5D4F4",
  dawn: "#F0997B",
  day: "#EF9F27",
  evening: "#D85A30",
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
    ctx.beginPath(); ctx.arc(12, 12, 6.5, 0, Math.PI * 2); ctx.fill()
    ctx.lineWidth = 1.8
    ctx.lineCap = "round"
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4
      ctx.beginPath()
      ctx.moveTo(12 + Math.cos(a) * 9.5, 12 + Math.sin(a) * 9.5)
      ctx.lineTo(12 + Math.cos(a) * 11.5, 12 + Math.sin(a) * 11.5)
      ctx.stroke()
    }
    return
  }

  // evening
  ctx.beginPath(); ctx.arc(12, 13, 6, 0, Math.PI * 2); ctx.fill()
  ctx.lineWidth = 1.8
  ctx.lineCap = "round"
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i * Math.PI) / 4
    ctx.beginPath()
    ctx.moveTo(12 + Math.cos(a) * 8.5, 13 + Math.sin(a) * 8.5)
    ctx.lineTo(12 + Math.cos(a) * 10.5, 13 + Math.sin(a) * 10.5)
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

// Box face order is [+x, -x, +y, -y, +z, -z]. The 4 side faces carry one
// phase glyph each, in TIME_OF_DAY_ORDER around the Y axis; the two caps
// (+y/-y, never front-facing at this fixed near-level framing) just reuse
// the "day" face so the material array stays fully populated.
function buildFaceMaterials(textures: Record<TimeOfDay, THREE.CanvasTexture>) {
  const [dawn, day, evening, night] = TIME_OF_DAY_ORDER.map((p) => textures[p])
  const mat = (map: THREE.CanvasTexture) => new THREE.MeshBasicMaterial({ map })
  return [mat(day), mat(evening), mat(dawn), mat(dawn), mat(dawn), mat(night)]
}

function CubeMesh({ meshRef }: { meshRef: React.RefObject<THREE.Mesh | null> }) {
  const [textures] = useState(buildFaceTextures)
  const materials = useMemo(() => buildFaceMaterials(textures), [textures])

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
  /** Controlled phase. Omit to let the cube own its state. */
  phase?: TimeOfDay
  /** Starting phase when uncontrolled. */
  defaultPhase?: TimeOfDay
  onPhaseChange?: (next: TimeOfDay) => void
  /** Must match the scene transition -- import both from one constant. */
  durationMs?: number
  size?: number
}

export default function PhaseCube({
  phase,
  defaultPhase = "night",
  onPhaseChange,
  durationMs = 1200,
  size = 56,
}: PhaseCubeProps) {
  const controlled = phase !== undefined

  const [steps, setSteps] = useState(() => TIME_OF_DAY_ORDER.indexOf(controlled ? phase! : defaultPhase))
  const [busy, setBusy] = useState(false)
  const meshRef = useRef<THREE.Mesh>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!controlled) return
    const target = TIME_OF_DAY_ORDER.indexOf(phase!)
    setSteps((s) => s + ((target - (s % 4) + 4) % 4))
  }, [controlled, phase])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const index = ((steps % 4) + 4) % 4
  const current = TIME_OF_DAY_ORDER[index]
  const next = TIME_OF_DAY_ORDER[(index + 1) % 4]

  const ms = prefersReducedMotion() ? 0 : tweenDuration(durationMs / 1000) * 1000

  const advance = useCallback(() => {
    if (busy) return
    setBusy(true)
    setSteps((s) => s + 1)
    onPhaseChange?.(TIME_OF_DAY_ORDER[(((steps + 1) % 4) + 4) % 4])
    if (meshRef.current) {
      if (ms === 0) {
        meshRef.current.rotation.y += Math.PI / 2
      } else {
        gsap.to(meshRef.current.rotation, { y: "+=" + Math.PI / 2, duration: ms / 1000, ease: "power2.inOut" })
      }
    }
    timer.current = setTimeout(() => setBusy(false), ms)
  }, [busy, ms, onPhaseChange, steps])

  return (
    <button
      type="button"
      onClick={advance}
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
        <CubeMesh meshRef={meshRef} />
      </Canvas>
    </button>
  )
}
