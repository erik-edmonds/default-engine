import React, { useRef } from 'react'
import * as THREE from "three"
import { useGLTF } from '@react-three/drei'
import { useShadows } from '@/helpers/useShadows'

// Decorative only. The music toggle (the musicEnabled atom, the music.mp3
// Howl, the hover cursor) used to live here and now lives on Guitar.tsx --
// there's only ever one thing driving that atom, so it moved wholesale rather
// than being duplicated.
export function Speaker(props) {
  const { nodes, materials } = useGLTF('/models/speaker.glb')
  const group = useRef<THREE.Group>(null)

  useShadows(group)

  return (
    <group ref={group} {...props} dispose={null}>
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
