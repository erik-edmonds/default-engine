import React, { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF, useAnimations } from '@react-three/drei'

import { useShadows } from '@/helpers/useShadows'

export function PalmTree(props) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials, animations } = useGLTF('/models/palmtree.glb')
  // palmtree.glb holds eight separate armatures but a single 78-channel clip
  // covering all of them; the JSX below mounts only GLTF_created_2's, so 45 of
  // those channels have no node to bind to and each one warns
  // "THREE.PropertyBinding: No target node found for track: Bone#..." the
  // moment the action first plays. Rebuilding the clip from just the tracks
  // that actually resolve inside the mounted armature keeps the identical wind
  // motion and drops the noise -- same fix, same reasoning, as the retargeted
  // shark clip in MergedScene.tsx.
  //
  // Resolving each track against the live subtree (rather than hard-coding the
  // 33 surviving names) means this stays correct if the JSX is ever re-exported
  // with a different slice of the file mounted.
  //
  // Also note what this replaced: `animations[0].name = "Wind"` mutated the
  // clip object *inside useGLTF's global cache*, shared by every consumer of
  // this URL.
  const windAnimations = useMemo(() => {
    const source = animations[0]
    const root = nodes.GLTF_created_2_rootJoint
    const tracks = source.tracks.filter((t) =>
      THREE.PropertyBinding.findNode(root, THREE.PropertyBinding.parseTrackName(t.name).nodeName),
    )
    return [new THREE.AnimationClip('Wind', source.duration, tracks)]
  }, [animations, nodes])
  const { actions } = useAnimations(windAnimations, group)
  useShadows(group)
  useEffect(() => {
    actions["Wind"]?.reset().play()
  }, [])
  return (
    <group ref={group} {...props} dispose={null}>
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
            <group name="GLTF_SceneRootNode" rotation={[Math.PI / 2, 0, 0]}>
              <group name="Armature001_61" position={[7.086, 5.299, -8.15]}>
                <group name="GLTF_created_2">
                  <primitive object={nodes.GLTF_created_2_rootJoint} />
                  <skinnedMesh
                    name="Object_56"
                    geometry={nodes.Object_56.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_56.skeleton}
                  />
                  <skinnedMesh
                    name="Object_58"
                    geometry={nodes.Object_58.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_58.skeleton}
                  />
                  <skinnedMesh
                    name="Object_60"
                    geometry={nodes.Object_60.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_60.skeleton}
                  />
                  <skinnedMesh
                    name="Object_62"
                    geometry={nodes.Object_62.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_62.skeleton}
                  />
                  <skinnedMesh
                    name="Object_64"
                    geometry={nodes.Object_64.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_64.skeleton}
                  />
                  <skinnedMesh
                    name="Object_66"
                    geometry={nodes.Object_66.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_66.skeleton}
                  />
                  <skinnedMesh
                    name="Object_68"
                    geometry={nodes.Object_68.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_68.skeleton}
                  />
                  <skinnedMesh
                    name="Object_70"
                    geometry={nodes.Object_70.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_70.skeleton}
                  />
                  <skinnedMesh
                    name="Object_72"
                    geometry={nodes.Object_72.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_72.skeleton}
                  />
                  <skinnedMesh
                    name="Object_74"
                    geometry={nodes.Object_74.geometry}
                    material={materials.Palme}
                    skeleton={nodes.Object_74.skeleton}
                  />
                  <group name="Cylinder008_51" />
                  <group name="Cylinder009_52" />
                  <group name="Cylinder010_53" />
                  <group name="Cylinder011_54" />
                  <group name="Cylinder012_55" />
                  <group name="Cylinder013_56" />
                  <group name="Cylinder014_57" />
                  <group name="Cylinder015_58" />
                  <group name="Cylinder016_59" />
                  <group name="Cylinder017_60" />
                </group>
              </group>
            </group>
          </group>
        </group>
  )
}

useGLTF.preload('/models/palmtree.glb')
