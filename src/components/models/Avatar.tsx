import { useRef, useEffect } from 'react'
import { useGLTF, useFBX, useAnimations } from '@react-three/drei'

export function Avatar(props) {
  const group = useRef()
  const model = useFBX('/models/idle.fbx')
  const { animations } = useFBX('/models/idle.fbx')
  animations[0].name = 'Idle'
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions['Idle']?.reset().play()
  }, [])

  return (
    <primitive ref={group} object={model} {...props} dispose={null} />
  )
}

useFBX.preload('/models/idle.fbx')