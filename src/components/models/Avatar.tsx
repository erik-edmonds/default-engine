import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { useRef, useEffect } from 'react'
import { useAnimations } from '@react-three/drei'
import { useGLTF } from '@/helpers/useGLTF'

export function Avatar(props: ThreeElements['group']) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials, animations } = useGLTF('/models/Avatars/base.glb')
  animations[0].name = "Idle"
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions["Idle"]?.reset().play()
  }, [])
  return (
    <group ref={group} {...props} dispose={null}>
      <group>
        <skinnedMesh
          name="Skinned_Mesh_0"
          geometry={nodes.Skinned_Mesh_0.geometry}
          material={materials.Material_1}
          skeleton={nodes.Skinned_Mesh_0.skeleton}>
          <primitive object={nodes.root} />
        </skinnedMesh>
      </group>
    </group>
  )
}

useGLTF.preload('/models/Avatars/base.glb')