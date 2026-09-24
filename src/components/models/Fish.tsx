import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useAnimations } from "@react-three/drei"
import { useGLTF } from "@/helpers/useGLTF"

export function Fish(props: React.ComponentProps<"group">) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials, animations } = useGLTF("/models/fish.glb")
  if (animations[0]) animations[0].name = "Fishing"
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    actions["Fishing"]?.reset().play()
  }, [actions])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
          <group name="de8a6d993d1648139d961f02b30f3fb3fbx" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
            <group name="Object_2">
              <group name="RootNode">
                <group name="Object_4">
                  <primitive object={nodes._rootJoint} />
                  <skinnedMesh
                    name="Object_7"
                    geometry={nodes.Object_7.geometry}
                    material={materials.fishclown}
                    skeleton={nodes.Object_7.skeleton}
                  />
                  <group name="Object_6" position={[0, 0.137, -2.214]} rotation={[-Math.PI / 2, 0, 0]} />
                  <group name="fishClown" position={[0, 0.137, -2.214]} rotation={[-Math.PI / 2, 0, 0]} />
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload("/models/fish.glb")