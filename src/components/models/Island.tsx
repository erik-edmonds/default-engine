import React, { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function Island(props) {
  const group = useRef()
  const { nodes, materials, animations } = useGLTF('/models/island.glb')
  animations[0].name = "Sharks"
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions["Sharks"]?.reset().play()
  }, [])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group
          name="Sketchfab_model"
          position={[-6.99, 0.001, -1.977]}
          rotation={[-Math.PI / 2, 0, Math.PI / 2]}
          scale={3.33}>
          <group name="e75494d6885b4d1f8979ba72d497fe0dfbx" rotation={[Math.PI / 2, 0, 0]}>
            <group name="Object_2">
              <group name="RootNode">
                <group name="Object_4">
                  <primitive object={nodes._rootJoint} />
                  <skinnedMesh
                    name="Object_85"
                    geometry={nodes.Object_85.geometry}
                    material={materials['10_-_Default']}
                    skeleton={nodes.Object_85.skeleton}
                  />
                  <skinnedMesh
                    name="Object_86"
                    geometry={nodes.Object_86.geometry}
                    material={materials['11_-_Default']}
                    skeleton={nodes.Object_86.skeleton}
                  />
                  
                  <group name="Island" rotation={[-Math.PI / 2, 0, 0]} scale={0.981}>
                    <mesh
                      name="Island_01_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Island_01_-_Default_0'].geometry}
                      material={materials['01_-_Default']}/>
                  </group>
                  <group
                    name="Tree2"
                    position={[1.397, 50.417, -38.659]}
                    rotation={[-Math.PI / 2, 0, -0.96]}
                    scale={[0.157, 0.157, 2.074]}>
                    <mesh
                      name="Tree2_02_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Tree2_02_-_Default_0'].geometry}
                      material={materials['02_-_Default']}
                    />
                    <mesh
                      name="Tree2_03_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Tree2_03_-_Default_0'].geometry}
                      material={materials['03_-_Default']}
                    />
                  </group>
                  <group
                    name="Tree3"
                    position={[39.338, 47.879, -4.395]}
                    rotation={[-Math.PI / 2, 0, -Math.PI / 9]}
                    scale={[0.153, 0.153, 2.397]}>
                    <group name="Object_48" position={[27.99, 0, 0]}>
                      <mesh
                        name="Tree3_02_-_Default_0"
                        castShadow
                        receiveShadow
                        geometry={nodes['Tree3_02_-_Default_0'].geometry}
                        material={materials['02_-_Default']}
                      />
                      <mesh
                        name="Tree3_03_-_Default_0"
                        castShadow
                        receiveShadow
                        geometry={nodes['Tree3_03_-_Default_0'].geometry}
                        material={materials['03_-_Default']}
                      />
                    </group>
                  </group>
                  <group
                    name="Dock"
                    position={[-71.794, 34.472, 16.339]}
                    rotation={[0, -Math.PI / 2, 0]}
                    scale={[1, 1, 1.286]}>
                    <mesh
                      name="Dock_02_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Dock_02_-_Default_0'].geometry}
                      material={materials['02_-_Default']}
                    />
                    <mesh
                      name="Dock_08_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Dock_08_-_Default_0'].geometry}
                      material={materials['08_-_Default']}
                    />
                  </group>
                  <group
                    name="CoCoNut001"
                    position={[4.473, 53.076, -36.43]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    scale={0.383}>
                    <mesh
                      name="CoCoNut001_05_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['CoCoNut001_05_-_Default_0'].geometry}
                      material={materials['05_-_Default']}
                    />
                  </group>
                  <group
                    name="CoCoNut002"
                    position={[8.213, 53.326, -38.515]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    scale={0.383}>
                    <mesh
                      name="CoCoNut002_05_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['CoCoNut002_05_-_Default_0'].geometry}
                      material={materials['05_-_Default']}
                    />
                  </group>
                  <group
                    name="CoCoNut003"
                    position={[37.157, 50.676, -0.465]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    scale={0.383}>
                    <mesh
                      name="CoCoNut003_05_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['CoCoNut003_05_-_Default_0'].geometry}
                      material={materials['05_-_Default']}
                    />
                  </group>
                  <group
                    name="Shack"
                    position={[-1.454, 42.918, 27.832]}
                    rotation={[-Math.PI / 2, 0, -1.134]}
                    scale={1.23}>
                    <group
                      name="Object_61"
                      position={[-1.127, 1.776, -0.811]}
                      rotation={[Math.PI, 0, Math.PI / 2]}
                      scale={[0.785, 0.571, 0.454]}>
                      <mesh
                        name="Shack_08_-_Default_0"
                        castShadow
                        receiveShadow
                        geometry={nodes['Shack_08_-_Default_0'].geometry}
                        material={materials['08_-_Default']}
                      />
                      <mesh
                        name="Shack_03_-_Default_0"
                        castShadow
                        receiveShadow
                        geometry={nodes['Shack_03_-_Default_0'].geometry}
                        material={materials['03_-_Default']}
                      />
                    </group>
                  </group>
                  <group
                    name="Character001"
                    position={[119.73, 0, 8.563]}
                    rotation={[Math.PI / 2, 1.571, 0]}
                  />
                  <group
                    name="New_Character"
                    position={[0, 0, 338.247]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    scale={0.204}
                  />
                  <group
                    name="SheK"
                    position={[-119.052, 35.307, 5.054]}
                    rotation={[0, 0, Math.PI / 2]}
                  />
                  <group
                    name="New_Water"
                    position={[-6.386, 27.045, 2.503]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    scale={1.116}>
                    <mesh
                      name="New_Water_04_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['New_Water_04_-_Default_0'].geometry}
                      material={materials['04_-_Default']}
                    />
                  </group>
                  <group
                    name="Object_84"
                    position={[262.383, 19.732, 31.162]}
                    rotation={[-Math.PI, 0.013, Math.PI / 2]}
                    scale={[0.645, 0.645, 0.644]}
                  />
                  <group
                    name="Object_88"
                    position={[0, 17.577, 338.308]}
                    rotation={[-Math.PI / 2, 0, 0]}
                    scale={0.204}
                  />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/island.glb')