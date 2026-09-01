import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instances, Instance, useGLTF } from '@react-three/drei'
import { useAtomValue, useSetAtom } from 'jotai'
import { Howl } from 'howler'
import { raining, sfxEnabled, thunder } from '@/helpers/StateProvider'
import { Rain } from '@/components/canvas/Rain'

const RAIN_HOLD_MS = 4000 // unchanged -- full-strength duration
const RAIN_FADE_MS = 2500 // how long the rain takes to ease out afterward
const RAIN_SOUND_VOLUME = 0.5

export function Clouds({ data, range }) {
  const { nodes, materials } = useGLTF('/models/cloud.glb')
  const [clicked, setClicked] = useState(false)
  const [fading, setFading] = useState(false)
  const setClick = useSetAtom(raining)
  // Same masterOn gating Speaker.tsx uses for music.mp3 -- respects the
  // SoundToggle mute switch instead of always playing regardless of it.
  const masterOn = useAtomValue(sfxEnabled)

  const [rainSound] = useState(() => new Howl({
    src: ['/sound/rain.wav'],
    volume: RAIN_SOUND_VOLUME,
    preload: false,
    // Deliberately NOT html5:true (unlike waves.mp3/music.mp3) -- that mode
    // exists to avoid a slow multi-second decode for large COMPRESSED
    // files, which doesn't apply to an uncompressed PCM .wav (near-instant
    // to decode regardless of size). html5 mode also pulls from a shared,
    // limited pool of <audio> elements across every Howl on the page;
    // under React StrictMode's dev-only double-mounting, that pool gets
    // exhausted by orphaned instances and a new html5 Howl can get stuck in
    // "loading" forever waiting for a free slot (observed live). Default
    // Web Audio API mode sidesteps the shared pool entirely.
  }))

  useEffect(() => {
    if (!clicked || !masterOn) {
      rainSound.pause()
      return
    }
    if (rainSound.state() === 'unloaded') rainSound.load()
    // Undoes the previous cycle's fade-to-0 (below) so a fresh cloud click
    // starts at full volume again instead of silently staying at 0.
    rainSound.volume(RAIN_SOUND_VOLUME)
    rainSound.play()
  }, [clicked, masterOn, rainSound])

  // Mirrors the visual rain's own fade (Rain.tsx's gsap opacity tween) so
  // the sound eases out over the same window instead of cutting off the
  // instant `clicked` flips false.
  useEffect(() => {
    if (fading) rainSound.fade(rainSound.volume(), 0, RAIN_FADE_MS)
  }, [fading, rainSound])

  // Same orphaned-Howl risk Speaker.tsx/SoundToggle.tsx guard against.
  useEffect(() => () => { rainSound.stop() }, [rainSound])

  useEffect(() => {
    if (!clicked) return
    const hold = setTimeout(() => {
      setFading(true)
      setClick(() => false) // atom flips now; RainScene starts its own CSS fade from here
    }, RAIN_HOLD_MS)
    return () => clearTimeout(hold)
  }, [clicked])

  useEffect(() => {
    if (!fading) return
    const fade = setTimeout(() => {
      setClicked(false)
      setFading(false)
    }, RAIN_FADE_MS)
    return () => clearTimeout(fade)
  }, [fading])

  return (
    <>
      <Instances range={range} material={materials.CloudMaterial} geometry={nodes.Cloud_0.geometry}>
        {data.map((props, i) => (
          <Cloud key={i} {...props} clicked={setClicked}/>
        ))}
      </Instances>
      {clicked && <Rain count={2000} fading={fading} fadeSeconds={RAIN_FADE_MS / 1000} />}
    </>
  )
}

function Cloud({ random, atom, clicked, color = new THREE.Color(), ...props }) {
  const ref = useRef()
  const [hovered, setHover] = useState(false)
  const setClick = useSetAtom(raining)
  const setThunder = useSetAtom(thunder)

  useFrame((state) => {
    const t = state.clock.getElapsedTime() + random * 10000
    ref.current.position.y = Math.sin(t / 1.5) / 2
    ref.current.scale.x = ref.current.scale.y = ref.current.scale.z = THREE.MathUtils.lerp(ref.current.scale.z, hovered ? 1.4 : 1, 0.1)
    ref.current.color.lerp(color.set(hovered ? '#b3b2b2' : 'white'), hovered ? 1 : 0.1)
  })
  return (
    <group {...props}>
      <Instance 
        ref={ref} 
        onPointerOver={(e) => (e.stopPropagation(), setHover(true))} 
        onPointerOut={(e) => setHover(false)}  
        onClick={() => {
          setClick(() => true)
          clicked(true)
          setThunder((c) => c + 1)
        }}/>
    </group>
  )
}
