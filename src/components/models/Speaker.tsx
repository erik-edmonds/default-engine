import React, { useRef, useEffect, useState } from 'react'
import * as THREE from "three"
import { useGLTF } from '@react-three/drei'
import { useFrame } from "@react-three/fiber"
import { Howl } from "howler"


export function Speaker(props) {
  const [sound, setSound] = useState(false);
  const [hovered, setHover] = useState(false)
  const { nodes, materials } = useGLTF('/models/speaker.glb')
  const ref = useRef()
  const hover = useRef(false)
  const song = new Howl({
      src: ['/sound/music.mp3'],
      loop: true,
      volume: 0.5,
    });

  useFrame((state) => {
    hover.current.scale.x = hover.current.scale.y = hover.current.scale.z = THREE.MathUtils.lerp(hover.current.scale.z, hovered ? 55 : 45, 0.1)
  })
  
  useEffect(() => {
    if (!song.playing()) {
    song.play();
    setSound(true);
  } else {
    song.pause();
    setSound(false);
  }
  }, [sound])
      
  return (
    <group ref={hover} {...props} dispose={null} 
      onClick={() => {
          setSound(!sound)
        }
      }
      onPointerOver={(e) => {
          setHover(true)
        }
      }
      onPointerOut={(e) => {
          setHover(false)
        }
      }>
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

