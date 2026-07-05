import { useGLTF } from '@react-three/drei'

export function Scuba(props) {
  const { nodes, materials } = useGLTF('/models/Avatars/scuba.glb')
  return (
    <group {...props} dispose={null}>
      <skinnedMesh
        geometry={nodes.Mesh_0.geometry}
        material={materials['Material.001']}
        skeleton={nodes.Mesh_0.skeleton}
      />
      <primitive object={nodes.root} />
    </group>
  )
}

useGLTF.preload('/models/Avatars/scuba.glb')