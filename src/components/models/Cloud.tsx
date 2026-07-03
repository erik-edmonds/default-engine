import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Cloud(props) {
  const { nodes, materials } = useGLTF('/models/cloud.glb')
  return (
    <group {...props} dispose={null}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Cloud_0.geometry}
          material={materials.CloudMaterial}
          scale={0.865}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/models/cloud.glb')