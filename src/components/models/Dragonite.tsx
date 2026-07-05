import { useGLTF } from '@react-three/drei'

export function Dragonite(props) {
  const { nodes, materials } = useGLTF('/models/Avatars/dragonite.glb')
  return (
    <group {...props} dispose={null}>
      <skinnedMesh
        geometry={nodes.Mesh_0.geometry}
        material={materials['Material.001']}
        skeleton={nodes.Mesh_0.skeleton}
      />
      <primitive object={nodes.hips} />
    </group>
  )
}

useGLTF.preload('/models/Avatars/dragonite.glb')