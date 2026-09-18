import type { ThreeElements } from '@react-three/fiber'
import { useRef } from 'react'
import type * as THREE from 'three'
import { useGLTF } from '@/helpers/useGLTF'

import { useShadows } from '@/helpers/useShadows'

export function Scuba(props: ThreeElements['group']) {
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