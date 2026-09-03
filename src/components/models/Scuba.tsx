import { useRef } from 'react'
import type * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

import { useShadows } from '@/helpers/useShadows'

export function Scuba(props) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials } = useGLTF('/models/Avatars/scuba.glb')
  useShadows(group)
  return (
    <group ref={group} {...props} dispose={null}>
      <skinnedMesh
        geometry={nodes.Mesh_0.geometry}
        material={materials['Material.001']}
        skeleton={nodes.Mesh_0.skeleton}
      />
      <primitive object={nodes.root} />
    </group>
  )
}