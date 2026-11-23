"use client"

import { MeshDistortMaterial } from "@react-three/drei"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import * as THREE from "three"

import {
  MAGNETIC_RADIUS,
  MAGNETIC_SNAP_RADIUS,
  activateTarget,
  registerMagneticTarget,
  type MagneticTarget,
} from "@/helpers/cursor"
import { opticsRun } from "@/helpers/optics"
import { useCursorHover } from "@/helpers/useCursorHover"
import { useSfx } from "@/helpers/useSfx"

/** The glowing sphere on the pier, and the thing that will house the AI.
 *
 *  NO TRANSFORM OF ITS OWN. Hologram wraps this in a group and that group
 *  carries position and scale, so BeaconCompanion has one node to fly and this
 *  file stays about what the beacon IS rather than where it is. */
type BeaconProps = {
  /** Where a click goes when the call site has nothing better. Kept for
   *  /Blob, which renders a Hologram with no behaviour attached. */
  route?: string
  /** What a click actually does. Given one, `route` is never read.
   *
   *  Behaviour belongs at the call site for the same reason position does:
   *  Scene.tsx fires the optics run, /Blob pushes a route, and neither has to
   *  know about the other. */
  onActivate?: () => void
}

/** Weak on purpose. The beacon is a large, close target that the pointer
 *  reaches easily, and a full-strength magnet on something this big drags the
 *  cursor off the hotspot rings behind it. */
const BEACON_MAGNETIC_STRENGTH = 0.7

const IDLE_COLOR = "#1fb2f5"
const HOVER_COLOR = "#ff7d1c"

export function Beacon({ route = "/", onActivate }: BeaconProps) {
  const router = useRouter()
  const mesh = useRef<THREE.Mesh>(null)
  const play = useSfx()

  const [pointerOver, setPointerOver] = useState(false)
  const [magnetHeld, setMagnetHeld] = useState(false)
  // TWO WAYS TO BE HOVERED, unioned, for the reason CameraHotspot.tsx:104-122
  // sets out: r3f's raycast is exact but CameraLook's parallax carries a
  // target away from where you aimed, so the magnet's 62px lock is usually
  // what actually fires.
  const hovered = pointerOver || magnetHeld

  // Replaces drei's useCursor, which this file was the last holdout for.
  // drei's writes document.body.style.cursor, which is invisible here (the
  // scene draws its own cursor) and actively harmful (an inline style on
  // <body> beats the rule that hides the native one).
  useCursorHover(hovered, "interactive")

  // Publish it for the lure ring on the pier, which lives in a frame callback
  // and tightens under the cursor. An effect rather than a write during
  // render: this is state crossing out of React, and writing it while
  // rendering is the "cannot modify during render" rule the compiler lint
  // enforces elsewhere in this project.
  useEffect(() => {
    opticsRun.hovered = hovered
    return () => {
      opticsRun.hovered = false
    }
  }, [hovered])

  /** The registered target, kept so the JSX click can route through it. */
  const magnet = useRef<MagneticTarget | null>(null)

  useEffect(() => {
    const object = mesh.current
    if (!object) return
    const target: MagneticTarget = {
      object,
      type: "interactive",
      strength: BEACON_MAGNETIC_STRENGTH,
      radius: MAGNETIC_RADIUS,
      snapRadius: MAGNETIC_SNAP_RADIUS,
      isEnabled: () => true,
      // The click sound lives HERE, not in the JSX handler, so an assisted
      // click sounds identical to a direct one -- CameraHotspot.tsx:158-176
      // records why the two drifting apart was worth fixing.
      activate: () => {
        play("click")
        if (onActivate) onActivate()
        else router.push(route)
      },
      onLockChange: setMagnetHeld,
    }
    magnet.current = target
    const unregister = registerMagneticTarget(target)
    return () => {
      magnet.current = null
      unregister()
    }
    // Re-registered when any of these change rather than read through a ref
    // written during render. The churn is nil in practice: `play` changes only
    // when sound is switched on, and the call sites pass module-level
    // handlers, so these identities are stable for the session.
  }, [play, onActivate, route, router])

  return (
    <mesh
      ref={mesh}
      onClick={(event) => {
        event.stopPropagation()
        // Routed THROUGH the registry rather than calling the handler
        // directly, so a direct click and an assisted one share the single
        // ACTIVATE_DEBOUNCE_MS window and a click that lands both ways fires
        // once. The fallback covers the frame before registration completes.
        const target = magnet.current
        if (target) activateTarget(target)
        else {
          play("click")
          if (onActivate) onActivate()
          else router.push(route)
        }
      }}
      onPointerOver={() => setPointerOver(true)}
      onPointerOut={() => setPointerOver(false)}
    >
      <sphereGeometry args={[1, 64, 64]} />
      <MeshDistortMaterial
        roughness={0.5}
        speed={5}
        color={hovered ? HOVER_COLOR : IDLE_COLOR}
        emissive={hovered ? HOVER_COLOR : IDLE_COLOR}
        emissiveIntensity={7}
      />
    </mesh>
  )
}
