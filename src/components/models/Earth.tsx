import { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function Earth(props) {
  const group = useRef()
  const { nodes, materials, animations } = useGLTF('/models/earth.glb')
  animations[0].name = "Spin"
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    actions["Spin"]?.reset().play()
  }, [])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
          <group
            name="578a67fb859c4432ad395a9d408af1e7fbx"
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.01}>
            <group name="Object_2">
              <group name="RootNode">
                <group name="Earth" rotation={[-Math.PI / 2, 0, 0.681]} scale={358.622}>
                  <mesh
                    name="Earth_Ice_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Earth_Ice_0.geometry}
                    material={materials.material}
                  />
                  <mesh
                    name="Earth_Water_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Earth_Water_0.geometry}
                    material={materials.Water}
                  />
                  <mesh
                    name="Earth_Sand_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Earth_Sand_0.geometry}
                    material={materials.Sand}
                  />
                  <mesh
                    name="Earth_Grass_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Earth_Grass_0.geometry}
                    material={materials.Grass}
                  />
                  <group
                    name="Earth_Details"
                    position={[0.163, -0.812, 0.592]}
                    rotation={[-0.525, -0.789, -2.962]}
                    scale={[0.006, 0.006, 0.009]}>
                    <mesh
                      name="Earth_Details_Wood_0"
                      castShadow
                      receiveShadow
                      geometry={nodes.Earth_Details_Wood_0.geometry}
                      material={materials.Wood}
                    />
                    <mesh
                      name="Earth_Details_Tree_0"
                      castShadow
                      receiveShadow
                      geometry={nodes.Earth_Details_Tree_0.geometry}
                      material={materials.Tree}
                    />
                    <mesh
                      name="Earth_Details_Tree_0_1"
                      castShadow
                      receiveShadow
                      geometry={nodes.Earth_Details_Tree_0_1.geometry}
                      material={materials.Tree}
                    />
                    <mesh
                      name="Earth_Details_Ice_0"
                      castShadow
                      receiveShadow
                      geometry={nodes.Earth_Details_Ice_0.geometry}
                      material={materials.material}
                    />
                    <mesh
                      name="Earth_Details_Blue_0"
                      castShadow
                      receiveShadow
                      geometry={nodes.Earth_Details_Blue_0.geometry}
                      material={materials.Blue}
                    />
                    <mesh
                      name="Earth_Details_Sand_0"
                      castShadow
                      receiveShadow
                      geometry={nodes.Earth_Details_Sand_0.geometry}
                      material={materials.Sand}
                    />
                    <mesh
                      name="Earth_Details_red_0"
                      castShadow
                      receiveShadow
                      geometry={nodes.Earth_Details_red_0.geometry}
                      material={materials.material_7}
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

useGLTF.preload('/models/earth.glb')
