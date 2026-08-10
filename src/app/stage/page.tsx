"use client"

import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls,  Environment } from '@react-three/drei'
import { ViewCube } from '@/components/layout/HUD'
import { Pokeball } from '@/components/models/Pokeball'
export default function Page() {
  return (
    <Canvas camera={{ position: [0,0,0], rotation: [0,0,0], fov: 45 }}style={{ width: "100vw", height: "100vh" }}>
      <ambientLight intensity={0.5 * Math.PI} />
      <group position={[0, 0, -15]}>
        <Pokeball />
      </group>
      <Torus />
      <Environment preset="city" />
    </Canvas>
  )
}

function Torus(props) {
  const [hovered, hover] = useState(false)
  return (
    <mesh onPointerOver={(e) => hover(true)} onPointerOut={(e) => hover(false)} {...props}>
      <torusGeometry args={[1, 0.25, 32, 100]} />
      <meshStandardMaterial color={hovered ? 'hotpink' : 'orange'} />
    </mesh>
  )
}