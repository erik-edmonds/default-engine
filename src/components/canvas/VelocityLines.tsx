"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { skyScroll } from "@/helpers/skyScroll"
import { flightBasis, makeFlightBasis, placeInFlightFrame } from "@/config/flightFrame"
import { corridorOrigin } from "@/config/skyJourney"
import {
  CORRIDOR_TRAVEL_PER_OFFSET,
  STREAK_COUNT,
  STREAK_FULL_SPEED,
  STREAK_MAX_LENGTH,
  STREAK_RADIUS,
  STREAK_SPAN,
} from "@/config/paperSky"

/** The speed streaks -- the white lines that make the sky read as travelled at
 *  pace rather than drifted through.
 *
 *  One InstancedMesh, so the whole field is a single draw call whatever
 *  STREAK_COUNT says. Each instance is a unit quad scaled along Z into a
 *  streak, laid out in a cylinder around the corridor axis.
 *
 *  Everything about them is driven by skyScroll.speed, which is why they sell
 *  motion: at rest they are not drawn at all, and their length and opacity both
 *  grow with how fast you are actually scrolling. A constant starfield of
 *  streaks reads as decoration; one that appears when you move and thins out
 *  when you stop reads as speed.
 *
 *  They travel with the scroll like the props do, and wrap on the same modulo,
 *  so a streak is never seen to appear or disappear -- it is always somewhere
 *  in the cylinder. */
export function VelocityLines() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  // Created lazily in the frame loop, not by useMemo.
  //
  // flightBasis() WRITES into this object every frame, and a value produced by
  // useMemo arrives through render -- mutating it is what
  // react-hooks/immutability objects to. A ref filled on first use is only ever
  // touched from the frame callback, which is where it belongs.
  const basisRef = useRef<ReturnType<typeof makeFlightBasis> | null>(null)
  const originRef = useRef<{ x: number; y: number; z: number } | null>(null)

  /** Fixed per-instance scatter, generated once. */
  const seeds = useMemo(() => {
    const out: { angle: number; radius: number; phase: number; length: number }[] = []
    for (let i = 0; i < STREAK_COUNT; i++) {
      // Golden-angle spiral rather than pure random: it fills the cylinder
      // evenly instead of leaving the clumps and gaps that uniform random
      // sampling gives at this count.
      const angle = i * 2.399963
      const t = (i + 0.5) / STREAK_COUNT
      out.push({
        angle,
        radius: STREAK_RADIUS[0] + Math.sqrt(t) * (STREAK_RADIUS[1] - STREAK_RADIUS[0]),
        phase: t * STREAK_SPAN,
        // Varied so the field has depth rather than reading as one comb.
        length: 0.45 + ((i * 7919) % 100) / 100 * 0.55,
      })
    }
    return out
  }, [])

  useFrame(() => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) return

    const speed = Math.abs(skyScroll.speed)
    const intensity = THREE.MathUtils.clamp(speed / STREAK_FULL_SPEED, 0, 1)

    // Below a tenth of full speed there is nothing to convey; drawing faint
    // streaks over a still sky just dirties it.
    if (intensity < 0.1) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    material.opacity = 0.5 * intensity

    const travelled = skyScroll.display * CORRIDOR_TRAVEL_PER_OFFSET
    const direction = Math.sign(skyScroll.speed) || 1
    const basis = flightBasis(skyScroll.display, (basisRef.current ??= makeFlightBasis()))

    for (let i = 0; i < STREAK_COUNT; i++) {
      const seed = seeds[i]
      // Same wrap as the props: a modulo, so scrolling backwards behaves.
      const ahead = ((seed.phase - travelled) % STREAK_SPAN + STREAK_SPAN) % STREAK_SPAN - STREAK_SPAN * 0.5
      // In the FLIGHT FRAME, like the props. Placed in world Z they kept
      // pointing down world -Z while the camera banked away from it, so the
      // speed lines stopped agreeing with the direction of travel -- the same
      // fault the corridor had.
      placeInFlightFrame(
        basis,
        corridorOrigin(skyScroll.display, (originRef.current ??= { x: 0, y: 0, z: 0 })),
        ahead,
        Math.cos(seed.angle) * seed.radius,
        Math.sin(seed.angle) * seed.radius,
        dummy.position,
      )
      // Aligned with the heading, so the streak lies along travel however far
      // the flight has turned.
      dummy.rotation.set(0, basis.heading, 0)
      // Stretched along the travel axis only. The streak is the smear of a
      // point passing the camera, so its length is the distance it covers in
      // roughly one frame of perceived motion -- hence scaling with speed.
      dummy.scale.set(0.06, 0.06, STREAK_MAX_LENGTH * seed.length * intensity * direction)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, STREAK_COUNT]} frustumCulled={false}>
      {/* A unit box rather than a line: lines cannot be thickened reliably
          across platforms (WebGL ignores lineWidth almost everywhere), and a
          thin box instances just as cheaply. */}
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#ffffff"
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  )
}
