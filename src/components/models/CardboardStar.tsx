import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function CardboardStar(props: React.ComponentProps<'group'>) {
  const { nodes, materials } = useGLTF('/models/cardboard_star.glb')
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.mesh_0.geometry}
        material={nodes.mesh_0.material}
      />
    </group>
  )
}

useGLTF.preload('/models/cardboard_star.glb')