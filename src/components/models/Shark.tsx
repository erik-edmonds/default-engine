import { useRef, useEffect } from "react"
import * as THREE from "three"
import { useAnimations } from "@react-three/drei"
import { useGLTF } from "@/helpers/useGLTF"

export function Shark(props: React.ComponentProps<"group">) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials, animations } = useGLTF("/models/shark.glb")
  const { actions } = useAnimations(animations, group)
  const clip = animations[0]?.name
  useEffect(() => {
    if (clip) actions[clip]?.reset().play()
  }, [actions, clip])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
          <group name="3ef093952bd74e4d87107cf907a26c86fbx" rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
            <group name="Object_2">
              <group name="RootNode">
                <group name="Shark" scale={100} />
                <group name="Shark_Rig" rotation={[-Math.PI / 2, 0, 0]} scale={100}>
                  <group name="Object_6">
                    <primitive object={nodes._rootJoint} />
                    <skinnedMesh
                      name="Object_9"
                      geometry={nodes.Object_9.geometry}
                      material={materials.Shark_Textured}
                      skeleton={nodes.Object_9.skeleton}
                    />
                    <group name="Object_8" scale={100} />
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

useGLTF.preload("/models/shark.glb")
