"use client"

import { useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Billboard } from "@react-three/drei"

// Same idle-bob + hover-scale convention as TimeOfDayOrb.tsx/NavTotems.tsx --
// a per-instance random phase (seed) so multiple hotspots don't bob in
// lockstep, imperative ref mutation every frame rather than React state.
const BOB_AMPLITUDE = 0.12
const BOB_SPEED = 0.9
const BASE_SCALE = 1
const HOVER_SCALE = 1.25

export function CameraHotspot({
  position,
  onClick,
}: {
  position: [number, number, number]
  onClick: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const seed = useMemo(() => Math.random() * Math.PI * 2, [])
  const scratchScale = useRef(new THREE.Vector3())

  useFrame((state) => {
    if (!groupRef.current) return
    groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * BOB_SPEED + seed) * BOB_AMPLITUDE
    const targetScale = hovered ? HOVER_SCALE : BASE_SCALE
    groupRef.current.scale.lerp(scratchScale.current.set(targetScale, targetScale, targetScale), 0.15)
  })

  return (
    <group ref={groupRef} position={position}>
      <Billboard>
        {/* A single invisible disc covering the whole icon handles hit
            testing -- ringGeometry is an annulus with a hole in the
            middle, so a click dead-center (right on the dot) would
            otherwise miss the ring's own handler entirely. */}
        <mesh
          onClick={(e) => {
            e.stopPropagation()
            onClick()
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
          <circleGeometry args={[0.5, 40]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh raycast={() => null}>
          <ringGeometry args={[0.34, 0.46, 40]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh raycast={() => null}>
          <circleGeometry args={[0.16, 40]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}
