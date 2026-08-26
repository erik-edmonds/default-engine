import React, { useRef, useEffect, useState } from 'react'
import * as THREE from "three"
import { useGLTF, useCursor } from '@react-three/drei'
import { useFrame } from "@react-three/fiber"
import { Howl } from "howler"
import { useAtom, useAtomValue } from 'jotai'
import { musicEnabled, sfxEnabled } from '@/helpers/StateProvider'


export function Speaker(props) {
  // `sound` is this prop's own intent ("I want music playing"); the master
  // switch (SoundToggle.tsx) independently gates whether that's actually
  // audible -- see the comment on musicEnabled in StateProvider.tsx.
  const [sound, setSound] = useAtom(musicEnabled);
  const masterOn = useAtomValue(sfxEnabled);
  const [hovered, setHover] = useState(false)
  const { nodes, materials } = useGLTF('/models/speaker.glb')
  const hover = useRef(false)
  const [song] = useState(() => new Howl({
    src: ['/sound/music.mp3'],
    volume: 0.5,
    autoplay: false,
    preload: false,
    // Same fix as waves.mp3 in SoundToggle.tsx -- at 96MB, Howler's default
    // decode-the-whole-file-first mode means a multi-second wait before any
    // sound; html5: true streams instead, starting almost immediately.
    html5: true,
  }))

  useCursor(hovered)
  useEffect(() => {
    if (sound && masterOn) {
      if (song.state() === "unloaded") song.load()
      song.play()
    } else {
      song.pause()
    }
  }, [sound, masterOn, song])

  // Without this, a route change away from this page (diving underwater
  // navigates to /portfolio, which unmounts everything here) leaves this
  // Howl instance orphaned and still playing -- nothing left in the tree
  // references it, but Howler's underlying audio node lives independently
  // of React and keeps going until told to stop. Navigating back home then
  // mounts a fresh Speaker with a fresh Howl on top of the still-playing
  // orphan, audible as doubled music.
  useEffect(() => () => { song.stop() }, [song])

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

