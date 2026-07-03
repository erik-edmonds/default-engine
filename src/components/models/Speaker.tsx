import React, { useRef, useEffect, useState } from 'react'
import * as THREE from "three"
import { useGLTF } from '@react-three/drei'
import { useFrame } from "@react-three/fiber"
import { Howl } from "howler"

function toggle(song) {
  if (song.playing()) {
    song.pause();
  } else {
    song.play();
  }
}

export function Speaker(props) {
  const [sound, setSound] = useState(false);
  const [hovered, setHover] = useState(false)
  const { nodes, materials } = useGLTF('/models/speaker.glb')
  const ref = useRef()
  const hover = useRef(false)
  
  useFrame((state) => {
    hover.current.scale.x = hover.current.scale.y = hover.current.scale.z = THREE.MathUtils.lerp(hover.current.scale.z, hovered ? 75 : 65, 0.1)
  })
  
  useEffect(() => {
    const song = new Howl({
      src: ['/sound/music.mp3'],
      loop: true,
      volume: 0.5,
    });
    toggle(song, setSound)
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

