import React, { useRef, useEffect, useState } from 'react'
import * as THREE from "three"
import { useGLTF } from '@react-three/drei'
import { useFrame } from "@react-three/fiber"
import { Howl } from "howler"


export function Speaker(props) {
  const [sound, setSound] = useState(false);
  const [hovered, setHover] = useState(false)
  const { nodes, materials } = useGLTF('/models/speaker.glb')
  const hover = useRef(false)
  // Lazy useState initializer, not a plain const: the old `const song = new
  // Howl(...)` recreated a fresh, never-played Howl instance on every
  // render. Since a brand new instance always reports playing()===false,
  // the effect below kept re-entering its "start playing" branch and
  // calling setState from inside itself -- an infinite render loop
  // (confirmed via "Maximum update depth exceeded" crashes once the parent
  // scene mounts eagerly). The initializer only runs once on mount, and we
  // never call the setter, so `song` stays referentially stable.
  const [song] = useState(() => new Howl({
    src: ['/sound/music.mp3'],
    volume: 0.5,
    autoplay: false
  }))

  useFrame((state) => {
    hover.current.scale.x = hover.current.scale.y = hover.current.scale.z = THREE.MathUtils.lerp(hover.current.scale.z, hovered ? 55 : 45, 0.1)
  })

  // One-way sync (state -> audio), not a loop: this only reacts to `sound`
  // changing (from the click handler below), it never calls setSound
  // itself, so it can't re-trigger.
  useEffect(() => {
    if (sound) song.play()
    else song.pause()
  }, [sound, song])

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

