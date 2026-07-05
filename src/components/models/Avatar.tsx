import { useGLTF } from '@react-three/drei'

export function Avatar(props) {
  const { nodes, materials } = useGLTF('/models/Avatars/avatar.glb')
  return (
    <group {...props} dispose={null}>
      <skinnedMesh
        geometry={nodes.Mesh_0.geometry}
        material={materials['Material.001']}
        skeleton={nodes.Mesh_0.skeleton}
      />
      <primitive object={nodes.pelvis} />
    </group>
  )
}

useGLTF.preload('/models/Avatars/avatar.glb')