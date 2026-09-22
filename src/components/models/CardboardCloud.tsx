import { useGLTF } from '@react-three/drei'

export function PaperCloud(props) {
  const { nodes, materials } = useGLTF('/cardboard_cloud.glb')
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.Object_2.geometry}
        material={materials.CBCLOUD01}
        rotation={[-Math.PI / 2, 0, 0]}
      />
    </group>
  )
}

useGLTF.preload('/models/cardboard_cloud.glb')