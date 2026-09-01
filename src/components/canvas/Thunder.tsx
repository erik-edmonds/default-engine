"use client"

import { useEffect, useRef, useState } from "react"
import { useAtomValue } from "jotai"
import { CameraShake } from "@react-three/drei"
import gsap from "gsap"
import * as THREE from "three"
import { thunder } from "@/helpers/StateProvider"

// How long the camera keeps shaking after a strike -- long enough for
// CameraShake's own `decay` to settle it back to (approximately) zero
// before this unmounts, short enough that it reads as tied to the flash
// rather than lingering.
const SHAKE_MS = 1000

// Mounted once for the whole scene (not per-Clouds-instance) -- a thunder
// strike is a whole-scene effect regardless of which cloud group fired it.
export function Thunder() {
  const count = useAtomValue(thunder)
  const lightRef = useRef<THREE.AmbientLight>(null)
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    // Same "counter atom starts at 0, only >0 means a real trigger fired"
    // convention as goHomeRequest in page.tsx -- skips the initial mount.
    if (count === 0) return
    const light = lightRef.current
    if (!light) return
    // A real lightning strike reads as a quick double-flash, not one blunt
    // pulse -- spike, brief dip, dimmer second spike, then fade out.
    gsap.killTweensOf(light)
    gsap.timeline()
      .set(light, { intensity: 0 })
      .to(light, { intensity: 2.6, duration: 0.05, ease: "power1.out" })
      .to(light, { intensity: 0.4, duration: 0.12, ease: "power1.in" })
      .to(light, { intensity: 1.8, duration: 0.05, ease: "power1.out" })
      .to(light, { intensity: 0, duration: 0.5, ease: "power2.in" })

    setShaking(true)
    const timer = setTimeout(() => setShaking(false), SHAKE_MS)
    return () => clearTimeout(timer)
  }, [count])

  return (
    <>
      {/* Deliberately separate from Environment.tsx's own day/night lights
          -- three.js lights combine additively, so this just adds a
          temporary boost on top without touching that system at all. */}
      <ambientLight ref={lightRef} intensity={0} />
      {/* Mounted only for the shake window itself, not left permanently in
          the tree: the main camera is driven entirely by imperative GSAP
          writes (CameraController.tsx) with no active OrbitControls/shared
          `controls` object on this canvas, so CameraShake's rotation
          baseline (captured once on mount, refreshed only from a controls
          "change" event that never fires here) would go stale the moment
          the camera moves. Mounting fresh each strike captures whatever
          the camera's current rotation is as its own baseline every time;
          `decay` settles it back out before the timer above unmounts it. */}
      {shaking && (
        <CameraShake
          maxYaw={0.05}
          maxPitch={0.04}
          maxRoll={0.03}
          yawFrequency={1.2}
          pitchFrequency={1.1}
          rollFrequency={0.9}
          intensity={1}
          decay
          decayRate={0.65}
        />
      )}
    </>
  )
}
