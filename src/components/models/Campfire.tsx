import { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function Campfire(props) {
  const group = useRef()
  const { nodes, materials, animations } = useGLTF('/models/campfire.glb')
  animations[0].name = 'Fire'
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions['Fire']?.reset().play()
  }, [])
  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <group name="root">
            <group name="GLTF_SceneRootNode" rotation={[Math.PI / 2, 0, 0]}>
              <group name="Stones_0">
                <mesh
                  name="Object_4"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_4.geometry}
                  material={materials.stone}
                />
              </group>
              <group name="logs_1">
                <mesh
                  name="Object_6"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_6.geometry}
                  material={materials.wood}
                />
              </group>
              <group name="Fire_2" scale={[1.014, 1, 1]}>
                <mesh
                  name="Object_8"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_8.geometry}
                  material={materials.Fire}
                />
                <mesh
                  name="Object_9"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_9.geometry}
                  material={materials.Fire1}
                />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/campfire.glb')