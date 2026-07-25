import * as THREE from 'three'
import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instances, Instance, useGLTF } from '@react-three/drei'
import { Rain } from "@/components/canvas/Rain"
import { useSetAtom } from 'jotai'
import { raining } from '@/components/layout/StateProvider'

export function Clouds({ data, range }) {
  const { nodes, materials } = useGLTF('/models/cloud.glb')
  const [clicked, setClicked] = useState(false)
  const setClick = useSetAtom(raining)

  useEffect(() => {
    if (clicked) {
      const timer = setTimeout(() => {
        setClicked(false)
        setClick(() => false)
      }, 4000) 
    }
  }, [clicked])

  return (
    <>
      <Instances range={range} material={materials.CloudMaterial} geometry={nodes.Cloud_0.geometry}>
        {data.map((props, i) => (
          <Cloud key={i} {...props} clicked={setClicked}/>
        ))}
      </Instances>
      {clicked && <Rain count={2000} />}
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
