"use client"

import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls,  Environment } from '@react-three/drei'
import { ViewCube } from '@/components/layout/HUD'

export default function Page() {
  return (
    <Canvas style={{ width: "100vw", height: "100vh" }}>
      <ambientLight intensity={0.5 * Math.PI} />
      <Torus scale={1.75} />
      <ViewCube />
      <OrbitControls />
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