import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function FlyingDragonite(props) {
  const { nodes, materials } = useGLTF('/models/flying_dragonite.glb')
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Mesh_0.geometry}
        material={materials.Material_0}
      />
    </group>
  )
}

useGLTF.preload('/models/flying_dragonite.glb')