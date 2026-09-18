import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { useRef, useEffect } from 'react'
import { useAnimations, Clone } from '@react-three/drei'
import { useGLTF } from '@/helpers/useGLTF'

export function GreenTree(props: ThreeElements['group']) {
  const group = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF('/models/green_tree.glb')
  animations[0].name = 'Shaking'
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions['Shaking']?.reset().play()
  }, [])
  return (
    <group ref={group} {...props} dispose={null}>
      <Clone object={scene} />
    </group>
  )
}

useGLTF.preload('/models/green_tree.glb')