import React, { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function BrownTree(props) {
  const group = useRef()
  const { nodes, materials, animations } = useGLTF('/models/brown_tree.glb')
  animations[0].name = "Swaying"
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    actions["Swaying"]?.reset().play()
  }, [])
  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
          <group name="0cdba446f36743fd9fec518dbad903c8fbx" rotation={[Math.PI / 2, 0, 0]}>
            <group name="Object_2">
              <group name="RootNode">
                <group name="Tree_T_orange_1" rotation={[Math.PI / 2, 0, 0]}>
                  <group name="Object_5">
                    <primitive object={nodes._rootJoint} />
                    <skinnedMesh
                      name="Object_7"
                      geometry={nodes.Object_7.geometry}
                      material={materials.Tree_T_orange}
                      skeleton={nodes.Object_7.skeleton}
                    />
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/brown_tree.glb')