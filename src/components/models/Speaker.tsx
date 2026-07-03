import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Speaker(props) {
  const { nodes, materials } = useGLTF('/models/speaker.glb')
  
  return (
    <group {...props} dispose={null}>
      <group scale={0.01}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.speaker_combined_MAT_speaker1_0.geometry}
          material={materials.MAT_speaker1}/>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.speaker_combined_MAT_speaker1_0001.geometry}>
            <meshStandardMaterial color={"#ff9e32"} emissive={"#ff7d1c"} emissiveIntensity={10}  />
        </mesh>
      </group>
    </group>
  )
}

useGLTF.preload('/models/speaker.glb')

