import { useCursor, MeshDistortMaterial } from '@react-three/drei'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export const Beacon = ({ route = '/', ...props }) => {
  const router = useRouter()
  const [hovered, hover] = useState(false)
  useCursor(hovered)
  return (
    <mesh
      onClick={() => router.push(route)}
      onPointerOver={() => hover(true)}
      onPointerOut={() => hover(false)}
      {...props}>
      <sphereGeometry args={[1, 64, 64]} />
      <MeshDistortMaterial roughness={0.5} speed={5} color={hovered ? '#ff7d1c' : '#1fb2f5'} emissive={hovered ? '#ff7d1c' : '#1fb2f5'} emissiveIntensity={7} />
    </mesh>
  )
}