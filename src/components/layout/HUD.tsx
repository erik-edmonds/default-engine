"use client"
import * as THREE from 'three'
import dynamic from 'next/dynamic'
import { useRef, createContext } from 'react'
import {  useFrame, useThree } from '@react-three/fiber'
import { Hud, PerspectiveCamera } from '@react-three/drei'
import { hovered, clicked, pointer } from '@/helpers/StateProvider'
import { useAtom, useSetAtom } from 'jotai'

//TODO: Move this to StateProvider.
export const BoxContext = createContext(null)
const OrbitCube = dynamic(() => import("@/components/models/Cube").then((mod) => mod.Cube), {
  ssr: false,
});

export function ViewCube({ renderPriority = 1, matrix = new THREE.Matrix4() }) {
  const mesh = useRef(null)
  const hover = useSetAtom(hovered)
  const dragged = useSetAtom(pointer)
  const [click, setClick] = useAtom(clicked)
  const { camera } = useThree()

  useFrame(() => {
    matrix.copy(camera.matrix).invert()
    mesh.current.quaternion.setFromRotationMatrix(matrix)
  })

  return (
    <Hud renderPriority={renderPriority} >
      <ambientLight intensity={Math.PI / 2} />
      <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
      <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
      <PerspectiveCamera makeDefault position={[0, 0, 1]} />
      <mesh ref={mesh} scale={0.009}
        onClick={(event) => setClick(!click)}
        onPointerOver={() => {
            hover(true)
        }}
        onPointerOut={() => hover(false)} 
        position={[0.7, -0.4, 0]}>
        <OrbitCube rotation={[0, Math.PI/2, 0]}/>
      </mesh>
      <ambientLight intensity={1} />
      <pointLight position={[200, 200, 100]} intensity={0.5} />
    </Hud>
  )
}

