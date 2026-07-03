import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Chair(props) {
  const { nodes, materials } = useGLTF('/models/chair.glb')
  return (
    <group {...props} dispose={null}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.MADERAS_0.geometry}
          material={materials.Material}
          scale={[1, 1, 1.899]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.TELA_0.geometry}
          material={materials.Root}
          position={[0, -0.307, 0.738]}
          rotation={[-0.542, 0, 0]}
          scale={[0.799, 0.064, 1.932]}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/models/chair.glb')