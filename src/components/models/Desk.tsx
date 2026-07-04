import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { easing } from 'maath'
import { Charizard } from "@/components/models/Charizard"

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
      <Charizard scale={1} position={[-2,-1,2]} rotation={[0,-Math.PI/4,0]}/>
      <group position={[-0.002, 0, -1.731]} rotation={[-Math.PI / 2, 0, 1.768]}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Object_4.geometry}
            material={materials['Material.001']}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Object_4001.geometry}>
            <meshStandardMaterial color={"white"} emissive={"white"} emissiveIntensity={1}  />
          </mesh>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/desk.glb')