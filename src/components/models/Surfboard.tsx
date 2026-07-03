import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Surfboard(props) {
  const { nodes, materials } = useGLTF('/models/surfboard.glb')
  return (
    <group {...props} dispose={null}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Cube_0.geometry}
          material={materials.Material}
          position={[0, 0, 0.089]}
          rotation={[0, 0, Math.PI / 2]}
          scale={[1.376, 0.126, 4.396]}> 
          <meshStandardMaterial color="red" />
        </mesh>
      </group>
    </group>
  )
}

useGLTF.preload('/models/surfboard.glb')