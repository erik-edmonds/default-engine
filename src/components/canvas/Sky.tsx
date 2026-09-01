import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instances, Instance, useGLTF } from '@react-three/drei'
import { useSetAtom } from 'jotai'
import { raining } from '@/helpers/StateProvider'
import { Rain } from '@/components/canvas/Rain'

const RAIN_HOLD_MS = 4000 // unchanged -- full-strength duration
const RAIN_FADE_MS = 2500 // how long the rain takes to ease out afterward

export function Clouds({ data, range }) {
  const { nodes, materials } = useGLTF('/models/cloud.glb')
  const [clicked, setClicked] = useState(false)
  const [fading, setFading] = useState(false)
  const setClick = useSetAtom(raining)

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
          clicked(true)}
          }/>
    </group>
  )
}
