import { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Sun(props) {
  const { nodes, materials } = useGLTF('/models/sun.glb')
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Object_4.geometry}
        material={materials.lambert2SG}
        rotation={[Math.PI / 2, 0, 0]}>
      </mesh>
    </group>
  )
}

useGLTF.preload('/sun.glb')