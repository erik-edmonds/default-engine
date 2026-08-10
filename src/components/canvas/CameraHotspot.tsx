"use client"

import { useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Billboard } from "@react-three/drei"

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
  const [color, setColor] = useState("white")
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
        <mesh
          onClick={(e) => {
            e.stopPropagation()
            onClick()
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
            setColor("#d25a1a")
            document.body.style.cursor = "pointer"
          }}
          onPointerOut={() => {
            setHovered(false)
            setColor("white")
            document.body.style.cursor = "auto"
          }}
        >
          <circleGeometry args={[0.5, 40]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* depthTest disabled + a high renderOrder makes these draw over
            everything else in the scene regardless of what geometry sits
            between them and the camera -- markers are waypoints, not
            physical objects, so they shouldn't be able to hide behind a
            rock or island the way a real object would. */}
        <mesh raycast={() => null} renderOrder={999}>
          <ringGeometry args={[0.43, 0.44, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh raycast={() => null} renderOrder={999}>
          <circleGeometry args={[0.16, 40]} />
          <meshBasicMaterial color={color} transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} depthTest={false} />
        </mesh>
      </Billboard>
    </group>
  )
}
