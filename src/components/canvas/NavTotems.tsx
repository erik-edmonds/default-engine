"use client"

import { useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

const UP_POSITION: [number, number, number] = [3.2, -0.4, 3.4]
const DOWN_POSITION: [number, number, number] = [3.2, -1.1, 3.4]
const WOOD_COLOR = "#6b4426"
const GLOW_UP = "#ffb347"
const GLOW_DOWN = "#4db8ff"
const BOB_AMPLITUDE = 0.06
const BOB_SPEED = 1.1

// Replaces the generic DOM up/down icon buttons with small carved-wood /
// glowing-stone totems standing in the scene next to the avatar -- no new
// sculpted asset is available this pass, so the "carved wood, glowing
// stone" look comes from primitive geometry (a wood-toned cylinder "totem"
// topped with a colored, bloom-triggering "stone") rather than a bespoke
// model. Same click handlers as before (handleUpClick/handleDownClick),
// just moved into the world.
function Totem({
  position,
  glowColor,
  seed,
  onClick,
  label,
}: {
  position: [number, number, number]
  glowColor: string
  seed: number
  onClick: () => void
  label: string
}) {
  const groupRef = useRef<THREE.Group>(null)
  const glowRef = useRef<THREE.MeshBasicMaterial>(null)
  const [hovered, setHovered] = useState(false)

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * BOB_SPEED + seed) * BOB_AMPLITUDE
      const targetScale = hovered ? 1.15 : 1
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.2)
    }
    if (glowRef.current) {
      glowRef.current.color.set(glowColor).multiplyScalar(hovered ? 2.4 : 1.6)
    }
  })

  return (
    <group
      ref={groupRef}
      position={position}
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
      <mesh castShadow receiveShadow position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.11, 0.14, 0.32, 8]} />
        <meshStandardMaterial color={WOOD_COLOR} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.06, 0]} aria-label={label}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshBasicMaterial ref={glowRef} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function NavTotems({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <>
      <Totem position={UP_POSITION} glowColor={GLOW_UP} seed={0} onClick={onUp} label="Pan camera up" />
      <Totem position={DOWN_POSITION} glowColor={GLOW_DOWN} seed={2.4} onClick={onDown} label="Pan camera down" />
    </>
  )
}
