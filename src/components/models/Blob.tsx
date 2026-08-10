"use client"

import { useState } from 'react'
import { useCursor, MeshDistortMaterial } from '@react-three/drei'
import { useRouter } from 'next/navigation'

export const Blob = ({ distort, speed,  ...props }) => {
  const router = useRouter()
  const [hovered, hover] = useState(false)
  useCursor(hovered)
  return (
    <mesh
      onPointerOver={() => hover(true)}
      onPointerOut={() => hover(false)}
      {...props}>
      <sphereGeometry args={[1, 24, 8]} scale={[1.5, 0.5, 1.5]} />
      
      <MeshDistortMaterial 
        distort={distort} 
        speed={speed} 
        flatShading={true} 
        color="#c5d3d7"
        roughness={1.0}
        metalness={0.0}
      />
    </mesh>
  )
}