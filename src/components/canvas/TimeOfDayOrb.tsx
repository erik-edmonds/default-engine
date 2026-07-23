"use client"

import { useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { PRESETS, TIME_OF_DAY_ORDER, type TimeOfDay } from "./environmentPresets"

const ORB_POSITION: [number, number, number] = [8, 9, -4]
const BOB_AMPLITUDE = 0.15
const BOB_SPEED = 0.8
const BASE_SCALE = 0.5
const HOVER_SCALE = 0.62

// The lighting toggle, rebuilt as an actual object in the scene instead of
// a DOM control sitting on top of it -- a small glowing orb near the sky
// that cycles day -> evening -> night on click and tints itself from the
// same live blend Environment.tsx drives, so it always shows (and glows
// with) the current light color rather than a generic UI accent.
export function TimeOfDayOrb({ current, onChange }: { current: TimeOfDay; onChange: (next: TimeOfDay) => void }) {
  const groupRef = useRef<THREE.Group>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const [hovered, setHovered] = useState(false)
  const seed = useMemo(() => Math.random() * Math.PI * 2, [])

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = ORB_POSITION[1] + Math.sin(state.clock.elapsedTime * BOB_SPEED + seed) * BOB_AMPLITUDE
      const targetScale = hovered ? HOVER_SCALE : BASE_SCALE
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15)
    }
    // Reads the orb's own color from the same preset the environment is
    // currently targeting -- not a separately-tweened copy, just directly
    // the resting color for `current`, since the orb only needs to reflect
    // where things are headed/settled, not replay the whole transition.
    if (materialRef.current) {
      materialRef.current.color.set(PRESETS[current].rimColor).multiplyScalar(1.8)
    }
  })

  const handleClick = () => {
    const index = TIME_OF_DAY_ORDER.indexOf(current)
    onChange(TIME_OF_DAY_ORDER[(index + 1) % TIME_OF_DAY_ORDER.length])
  }

  return (
    <group ref={groupRef} position={ORB_POSITION}>
      <mesh
        onClick={(e) => {
          e.stopPropagation()
          handleClick()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = "auto"
        }}
      >
        <sphereGeometry args={[1, 32, 32]} />
        {/* Pushed above 1.0 so it always trips the scene's Bloom
            threshold -- reads as a glowing light source, not a flat ball. */}
        <meshBasicMaterial ref={materialRef} toneMapped={false} />
      </mesh>
    </group>
  )
}
