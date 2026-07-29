import { useRef, useEffect } from 'react'
import { useGLTF,useAnimations, Clone } from '@react-three/drei'

export function GreenTree(props) {
  const group = useRef()
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