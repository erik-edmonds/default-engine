import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Scuba(props) {
  const { nodes, materials } = useGLTF('/models/scuba.glb')
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

useGLTF.preload('/models/scuba.glb')