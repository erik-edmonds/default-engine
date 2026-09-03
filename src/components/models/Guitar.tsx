import React, { useRef, useEffect, useState } from 'react'
import * as THREE from "three"
import { useGLTF, useCursor } from '@react-three/drei'
import { Howl } from "howler"
import { useAtom, useAtomValue } from 'jotai'
import { musicEnabled, sfxEnabled } from '@/helpers/StateProvider'
import { useShadows } from '@/helpers/useShadows'

export function Guitar(props) {
  // `sound` is this prop's own intent ("I want music playing"); the master
  // switch (SoundToggle.tsx) independently gates whether that's actually
  // audible -- see the comment on musicEnabled in StateProvider.tsx.
  const [sound, setSound] = useAtom(musicEnabled);
  const masterOn = useAtomValue(sfxEnabled);
  const [hovered, setHover] = useState(false)
  const { nodes, materials } = useGLTF('/models/guitarra.glb')
  const group = useRef<THREE.Group>(null)
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
    } else if (song.playing()) {
      // Guarded on playing(): pausing a Howl that never started still makes
      // Howler touch its <audio> element, which aborts an in-flight range
      // request and logs net::ERR_ABORTED. Same reasoning as SoundToggle.tsx.
      song.pause()
    }
  }, [sound, masterOn, song])

  // Without this, a route change away from this page (diving underwater
  // navigates to /portfolio, which unmounts everything here) leaves this
  // Howl instance orphaned and still playing -- nothing left in the tree
  // references it, but Howler's underlying audio node lives independently
  // of React and keeps going until told to stop. Navigating back home then
  // mounts a fresh Guitar with a fresh Howl on top of the still-playing
  // orphan, audible as doubled music.
  useEffect(() => () => { if (song.playing()) song.stop() }, [song])

  useShadows(group)

  return (
    <group
      ref={group}
      {...props}
      dispose={null}
      onClick={() => setSound(!sound)}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Cube_0.geometry}
          material={materials['Material.001']}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/models/guitarra.glb')
