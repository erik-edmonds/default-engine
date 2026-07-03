import { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Moon(props) {
  const { nodes } = useGLTF('/models/moon.glb')
  return (
    <group {...props} dispose={null}>
        <mesh
            castShadow
            receiveShadow
            geometry={nodes.Object_4.geometry}
            rotation={[Math.PI / 2, 0, 0]}> 
            <meshStandardMaterial attach="material" emissiveIntensity={10}/>
        </mesh>
    </group>
  )
}

useGLTF.preload('/models/moon.glb')