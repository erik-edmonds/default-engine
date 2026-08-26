import { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function Seagull(props) {
  const group = useRef()
  const { nodes, materials, animations } = useGLTF('/models/seagull.glb')
  animations[0].name = "Flying"
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions["Flying"]?.reset().play()
  }, [])
  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group
          name="Sketchfab_model"
          position={[-8.706, 18.928, -8.488]}
          rotation={[-1.567, 0, -Math.PI / 2]}
          scale={0.113}>
          <group name="b8e0a8d2290944cc82d96cf3c33c11dafbx" rotation={[Math.PI / 2, 0, 0]}>
            <group name="Object_2">
              <group name="RootNode">
                <group name="Object_4">
                  <primitive object={nodes._rootJoint} />
                  <skinnedMesh
                    name="Object_7"
                    geometry={nodes.Object_7.geometry}
                    material={materials.lambert5}
                    skeleton={nodes.Object_7.skeleton}
                  />
                  <skinnedMesh
                    name="Object_8"
                    geometry={nodes.Object_8.geometry}
                    material={materials.lambert4}
                    skeleton={nodes.Object_8.skeleton}
                  />
                  <skinnedMesh
                    name="Object_9"
                    geometry={nodes.Object_9.geometry}
                    material={materials.lambert2}
                    skeleton={nodes.Object_9.skeleton}
                  />
                  <skinnedMesh
                    name="Object_10"
                    geometry={nodes.Object_10.geometry}
                    material={materials.lambert3}
                    skeleton={nodes.Object_10.skeleton}
                  />
                  <skinnedMesh
                    name="Object_11"
                    geometry={nodes.Object_11.geometry}
                    material={materials.lambert6}
                    skeleton={nodes.Object_11.skeleton}
                  />
                  <group name="Object_6" position={[0, -261.725, -24.016]} scale={3.674} />
                  <group name="polySurface6" position={[0, 80.802, 0]} scale={1.442}>
                    <group name="transform1" />
                  </group>
                  <group
                    name="polySurface5"
                    position={[0, 80.993, -0.431]}
                    rotation={[-0.111, 0, 0]}
                    scale={1.442}>
                    <group name="transform2" />
                  </group>
                  <group name="polySurface7" position={[0, -261.725, -24.016]} scale={3.674} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/seagull.glb')