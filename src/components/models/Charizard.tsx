import type { ThreeElements } from '@react-three/fiber'
import React, { useRef } from 'react'
import { useGLTF } from '@/helpers/useGLTF'

export function Charizard(props: ThreeElements['group']) {
  const { nodes, materials } = useGLTF('/models/charizard.glb')
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

useGLTF.preload('/models/charizard.glb')
