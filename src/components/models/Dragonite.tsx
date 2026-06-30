import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Dragonite(props) {
  const { nodes, materials } = useGLTF('/models/dragonite.glb')
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

useGLTF.preload('/models/dragonite.glb')