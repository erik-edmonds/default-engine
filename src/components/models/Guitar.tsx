import React, { useRef, useEffect, useState } from 'react'
import * as THREE from "three"
import { useGLTF } from '@react-three/drei'
import { useCursorHover } from '@/helpers/useCursorHover'
import { Howl } from "howler"
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { musicEnabled, sfxEnabled, soundOffNudge } from '@/helpers/StateProvider'
import { useShadows } from '@/helpers/useShadows'
import { MAGNETIC_SNAP_RADIUS, activateTarget, registerMagneticTarget, type MagneticTarget } from '@/helpers/cursor'

/** Props pull less than navigation targets -- they're discoveries, not the
 *  route through the scene, so the cursor should notice them without being
 *  captured by them. The guitar is also small on screen, which is exactly the
 *  case magnetism helps with. */
const PROP_MAGNETIC_STRENGTH = 0.8
const PROP_MAGNETIC_RADIUS = 110

export function Guitar(props) {
  // `sound` is this prop's own intent ("I want music playing"); the master
  // switch (SoundToggle.tsx) independently gates whether that's actually
  // audible -- see the comment on musicEnabled in StateProvider.tsx.
  const [sound, setSound] = useAtom(musicEnabled);
  const masterOn = useAtomValue(sfxEnabled);
  const nudgeSoundOff = useSetAtom(soundOffNudge);
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

  useCursorHover(hovered)

  // What a click on the guitar does, in one place so the direct click and the
  // cursor's assisted click can't drift apart. Held in a ref so the magnetic
  // target registers once rather than re-registering on every `sound` change.
  const activateRef = useRef<() => void>(() => {})
  activateRef.current = () => {
    setSound(!sound)
    // Everything this prop does is audible, so with the master switch off
    // clicking it looks broken -- the intent is recorded and nothing happens.
    // Point at the control that fixes it. Only on the way ON: clicking to turn
    // music off while muted needs no explanation.
    if (!masterOn && !sound) nudgeSoundOff((n) => n + 1)
  }

  const magnet = useRef<MagneticTarget | null>(null)
  useEffect(() => {
    if (!group.current) return
    const target: MagneticTarget = {
      object: group.current,
      type: 'interactive',
      strength: PROP_MAGNETIC_STRENGTH,
      radius: PROP_MAGNETIC_RADIUS,
      snapRadius: MAGNETIC_SNAP_RADIUS * 0.7,
      isEnabled: () => true,
      activate: () => activateRef.current(),
    }
    magnet.current = target
    return registerMagneticTarget(target)
  }, [])
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
      onClick={(e) => {
        // r3f dispatches a click to EVERY interactive object the ray crosses,
        // nearest first -- not just the front-most one. So without this, a
        // click aimed at anything that happens to line up with the guitar
        // toggles the music too, and pops the "turn on sound" callout for a
        // click the user never aimed here. Only act when the guitar is what
        // was actually hit first.
        if (e.intersections[0]?.eventObject !== e.eventObject) return
        e.stopPropagation()
        // Through the registry so this and the cursor's assisted click share
        // one debounce -- a click that satisfies both must still toggle once.
        if (magnet.current) activateTarget(magnet.current)
        else activateRef.current()
      }}
      // Same nearest-hit rule for the cursor, so the pointer only promises the
      // guitar where clicking it will actually do something.
      onPointerOver={(e) => setHover(e.intersections[0]?.eventObject === e.eventObject)}
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
