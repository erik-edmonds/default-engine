import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { easing } from 'maath'

export function Desk(props) {
    const { nodes, materials } = useGLTF('/models/desk.glb')
    const desk = useRef()
    const frameCount = useRef(0);
    useFrame((state, delta) => {
        const time = state.clock.getElapsedTime() + Math.random() * 10000
        frameCount.current += 1;
        if (frameCount.current % 3 !== 0) return;
        if (desk.current) {
            easing.dampE(desk.current.rotation, [Math.cos(time / 4) * 0.1, Math.sin(time / 4) * 0.1, Math.cos(time / 1.5) * 0.1], 0.25, delta)
    }
})
  return (
    <group ref={desk} {...props} dispose={null}>
      <group position={[-0.002, 0, -1.731]} rotation={[-Math.PI / 2, 0, 1.768]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Object_4.geometry}
          material={materials.Material}
          rotation={[Math.PI / 2, 0, 0]}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/models/desk.glb')