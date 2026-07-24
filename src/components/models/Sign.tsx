import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Sign(props) {
  const { nodes, materials } = useGLTF('/models/sign.glb')
  return (
    <group {...props} dispose={null}>
      <group scale={100}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Sign7_1.geometry}
          material={materials['Dark Wood']}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Sign7_2.geometry}
          material={materials['Light Wood']}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Sign7_3.geometry}
          material={materials.Herbs}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/models/sign.glb')