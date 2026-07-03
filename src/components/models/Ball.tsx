import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Ball(props) {
  const { nodes, materials } = useGLTF('/models/ball.glb')
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Object_2.geometry}
        material={materials['Materil.031']}
        rotation={[-Math.PI / 2, -0.477, -0.793]}
      />
    </group>
  )
}

useGLTF.preload('/models/ball.glb')