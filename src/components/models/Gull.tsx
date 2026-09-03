import React, { useRef, useEffect } from 'react'
import type * as THREE from 'three'
import { useGLTF, useAnimations } from '@react-three/drei'

import { useShadows } from '@/helpers/useShadows'

export function Gull(props) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials, animations } = useGLTF('/models/gull.glb')
  animations[0].name = "Flying"
  animations[1].name = "Idle"
  const { actions } = useAnimations(animations, group)
  useShadows(group)
  useEffect(() => {
    actions["Idle"]?.reset().play()
  }, [])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
          <group
            name="a3820fbbc3764edba45b891abe217cd9fbx"
            rotation={[Math.PI / 2, 0, 0]}
            scale={100}>
            <group name="Object_2">
              <group name="RootNode">
                <group name="Bird1010" rotation={[-Math.PI / 2, 0, 0]} />
                <group name="Bird1010_Rig" scale={0.01}>
                  <group name="Object_6">
                    <primitive object={nodes._rootJoint} />
                    <skinnedMesh
                      name="Object_9"
                      geometry={nodes.Object_9.geometry}
                      material={materials.Bird1010_Textured}
                      skeleton={nodes.Object_9.skeleton}
                    />
                    <group name="Object_8" rotation={[-Math.PI / 2, 0, 0]} />
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

useGLTF.preload('/models/gull.glb')