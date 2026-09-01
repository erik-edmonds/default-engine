"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { Seagull } from "@/components/models/Seagull"

const FLOCK_COUNT = 5
const SCALE = 0.1

// Roughly centered on the home island (where the palm tree/camp sits, see
// Scene.tsx), a band comfortably above its tree canopy but below the
// decorative high cloud layer at y=15.
const CENTER_X_RANGE: [number, number] = [-10, 6]
const CENTER_Z_RANGE: [number, number] = [-14, 6]
const ALTITUDE_RANGE: [number, number] = [4, 8]
const RADIUS_RANGE: [number, number] = [4, 8]
const SPEED_RANGE: [number, number] = [0.06, 0.12]
const VERTICAL_AMPLITUDE_RANGE: [number, number] = [0.4, 1.2]

function randRange([min, max]: [number, number]) {
  return min + Math.random() * (max - min)
}

interface BirdParams {
  centerX: number
  centerZ: number
  centerY: number
  radiusX: number
  radiusZ: number
  speed: number
  // z's own orbit frequency relative to x's -- deliberately off a clean
  // 1:1 ratio so the path traces an organic, slowly-precessing loop
  // instead of a perfect (and obviously repeating) ellipse.
  freqRatio: number
  phase: number
  vAmp: number
  vSpeed: number
  vPhase: number
}

function makeBirdParams(): BirdParams {
  return {
    centerX: randRange(CENTER_X_RANGE),
    centerZ: randRange(CENTER_Z_RANGE),
    centerY: randRange(ALTITUDE_RANGE),
    radiusX: randRange(RADIUS_RANGE),
    radiusZ: randRange(RADIUS_RANGE),
    speed: randRange(SPEED_RANGE),
    freqRatio: 0.55 + Math.random() * 0.3,
    phase: Math.random() * Math.PI * 2,
    vAmp: randRange(VERTICAL_AMPLITUDE_RANGE),
    vSpeed: randRange(SPEED_RANGE) * 2,
    vPhase: Math.random() * Math.PI * 2,
  }
}

function flightPosition(p: BirdParams, t: number, out: THREE.Vector3) {
  out.set(
    p.centerX + Math.cos(t * p.speed + p.phase) * p.radiusX,
    p.centerY + Math.sin(t * p.vSpeed + p.vPhase) * p.vAmp,
    p.centerZ + Math.sin(t * p.speed * p.freqRatio + p.phase) * p.radiusZ
  )
}

function FlyingSeagull({ params }: { params: BirdParams }) {
  const group = useRef<THREE.Group>(null)
  // Scratch vectors, reused every frame rather than reallocated.
  const here = useMemo(() => new THREE.Vector3(), [])
  const ahead = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime
    flightPosition(params, t, here)
    flightPosition(params, t + 0.5, ahead) // a moment further along the same path, to face the bird toward its own direction of travel
    g.position.copy(here)
    g.lookAt(ahead)
  })

  return (
    <group ref={group}>
      <Seagull scale={SCALE} />
    </group>
  )
}

// 4-5 seagulls wandering smooth, non-synchronized loops above the home
// island's trees. Each bird already auto-plays its own "Flying" wing-flap
// action (see Seagull.tsx) independent of this component -- this only
// drives *where* each one is and which way it's facing.
export function SeagullFlock({ count = FLOCK_COUNT }: { count?: number }) {
  const birds = useMemo(() => Array.from({ length: count }, makeBirdParams), [count])
  return (
    <>
      {birds.map((params, i) => (
        <FlyingSeagull key={i} params={params} />
      ))}
    </>
  )
}
