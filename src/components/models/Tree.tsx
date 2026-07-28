import React, { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function Tree(props) {
  const group = useRef()
  const { nodes, materials, animations } = useGLTF('/models/tree.glb')
  animations[0].name = 'Sway'
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    actions["Sway"]?.reset().play()
  }, [])
  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
          <group name="root">
            <group name="GLTF_SceneRootNode" rotation={[Math.PI / 2, 0, 0]}>
              <group name="clay-palm-tree_14">
                <group name="GLTF_created_0">
                  <primitive object={nodes.GLTF_created_0_rootJoint} />
                  <skinnedMesh
                    name="Object_7"
                    geometry={nodes.Object_7.geometry}
                    material={materials['MAT4K.002']}
                    skeleton={nodes.Object_7.skeleton}
                  />
                  <group name="palm-mesh_13" />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/tree.glb')