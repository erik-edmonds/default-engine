import { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function Avatar(props) {
  const group = useRef()
  const { nodes, materials, animations } = useGLTF('/models/Base/GLB/base.glb')
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

useGLTF.preload('/models/Base/GLB/base.glb')