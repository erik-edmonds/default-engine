"use client"

import { useEffect, useRef, useState } from "react"
import { useAtomValue } from "jotai"
import { CameraShake, type ShakeController } from "@react-three/drei"
import gsap from "gsap"
import * as THREE from "three"
import { thunder } from "@/helpers/StateProvider"

// A strike is two flashes, not one: the leader stroke, then a return stroke
// about two seconds later. Both the light and the shake key off these.
const SECOND_STRIKE_S = 2

// How long the shake rig stays mounted. Must outlast the SECOND strike's own
// decay or the camera is left permanently tilted -- see the long comment on
// the <CameraShake> below. decayRate 0.55 takes intensity 1 -> 0 in ~1.82s,
// so 2000 + 1820 = 3820, rounded up.
const SHAKE_MS = SECOND_STRIKE_S * 1000 + 1900

// Direction for the flash's directional component -- up and behind the high
// cloud group (Scene.tsx mounts it at [20, 15, -20]), so the strike rakes the
// island from above/behind rather than lighting it flat from the camera.
const FLASH_LIGHT_POSITION: [number, number, number] = [18, 34, -26]

// Cool white-blue. Lightning is roughly 20,000K -- much bluer than any of
// Environment.tsx's four key lights, which is part of why a strike reads as
// an intrusion rather than as the sun briefly getting brighter.
const FLASH_COLOR = "#dbe6ff"

// Mounted once for the whole scene (not per-Clouds-instance) -- a thunder
// strike is a whole-scene effect regardless of which cloud group fired it.
export function Thunder() {
  const count = useAtomValue(thunder)
  const ambientRef = useRef<THREE.AmbientLight>(null)
  const dirRef = useRef<THREE.DirectionalLight>(null)
  const shakeRef = useRef<ShakeController | undefined>(undefined)
  const [striking, setStriking] = useState(false)

  useEffect(() => {
    // Same "counter atom starts at 0, only >0 means a real trigger fired"
    // convention as goHomeRequest in page.tsx -- skips the initial mount.
    if (count === 0) return

    setStriking(true)
    const timer = setTimeout(() => setStriking(false), SHAKE_MS)

    // Built fresh per burst rather than hoisted: gsap timelines carry their
    // own playhead, so reusing one across triggers would need an explicit
    // restart anyway, and the targets are refs that could in principle change.
    const flash = () => {
      const targets = [ambientRef.current, dirRef.current].filter(Boolean)
      // A real lightning strike reads as a quick double-flash, not one blunt
      // pulse -- spike, brief dip, dimmer second spike, then fade out. The
      // ambient and directional lights are tweened together at different
      // scales so the strike has shape without the directional overpowering
      // Environment.tsx's own key.
      return gsap
        .timeline()
        .set(targets, { intensity: 0 })
        .to(targets, { intensity: (i: number) => (i === 0 ? 2.6 : 4.2), duration: 0.05, ease: "power1.out" })
        .to(targets, { intensity: (i: number) => (i === 0 ? 0.4 : 0.6), duration: 0.12, ease: "power1.in" })
        .to(targets, { intensity: (i: number) => (i === 0 ? 1.8 : 2.9), duration: 0.05, ease: "power1.out" })
        .to(targets, { intensity: 0, duration: 0.5, ease: "power2.in" })
    }

    // One master timeline drives both flashes AND both shake pokes, so the
    // light and the camera can't drift apart -- they're on the same clock,
    // not on two independent setTimeouts.
    //
    // The t=0 poke only matters for a strike that lands while a previous one
    // is still shaking (the rig is already mounted, so its intensity prop
    // won't re-apply). On a fresh strike shakeRef is still null here -- the
    // rig mounts on the re-render setStriking() just scheduled -- and the
    // first burst is carried by <CameraShake intensity={1}> instead. Between
    // the two, neither path depends on whether React commits before gsap's
    // next tick.
    const master = gsap
      .timeline()
      .add(flash(), 0)
      .add(flash(), SECOND_STRIKE_S)
      .call(() => shakeRef.current?.setIntensity(1), [], 0)
      // The return stroke is the dimmer of the two, so its jolt is smaller.
      .call(() => shakeRef.current?.setIntensity(0.85), [], SECOND_STRIKE_S)

    return () => {
      clearTimeout(timer)
      master.kill()
      gsap.killTweensOf([ambientRef.current, dirRef.current])
    }
  }, [count])

  return (
    <>
      {/* Deliberately separate from Environment.tsx's own day/night lights
          -- three.js lights combine additively, so these just add a
          temporary boost on top without touching that system at all. The
          ambient carries the raw brightness; the directional gives it a
          direction so forms still read as shaped during the flash instead of
          going flat. It stays castShadow={false}: a second shadow map for
          two frames of payoff isn't worth the per-frame cost of maintaining
          it for the other 99.9% of the time. */}
      <ambientLight ref={ambientRef} color={FLASH_COLOR} intensity={0} />
      <directionalLight ref={dirRef} color={FLASH_COLOR} intensity={0} position={FLASH_LIGHT_POSITION} />

      {/* ONE shake rig for the whole two-strike event, poked twice, rather
          than one mounted per burst.
          Why it's mounted at all rather than left in the tree permanently:
          the main camera is driven entirely by imperative GSAP writes
          (CameraController.tsx) with no active OrbitControls/shared
          `controls` object on this canvas, so CameraShake's rotation
          baseline -- captured once on mount, refreshed only from a controls
          "change" event that never fires here -- would go stale the moment
          the camera moves.
          Why only one for both bursts: CameraShake *writes* camera.rotation
          every frame as baseline + offset, and unmounting mid-decay simply
          stops, leaving the camera at whatever offset the last frame had. A
          second mount would then capture that drift as its own baseline and
          compound it. One baseline, and a SHAKE_MS long enough for `decay`
          to actually reach zero, means the camera lands back exactly where
          it started. (The old 1000ms window with decayRate 0.65 cut off at
          intensity 0.35, so every strike left a small permanent tilt.) */}
      {striking && (
        <CameraShake
          ref={shakeRef}
          intensity={1}
          maxYaw={0.075}
          maxPitch={0.06}
          maxRoll={0.045}
          yawFrequency={1.4}
          pitchFrequency={1.3}
          rollFrequency={1.05}
          decay
          decayRate={0.55}
        />
      )}
    </>
  )
}
