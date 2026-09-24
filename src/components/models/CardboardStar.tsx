// The repo's typed wrapper, not drei's -- gltfjsx writes `nodes.Foo.geometry`
// and r3f types `nodes` as bare Object3D. See helpers/useGLTF.ts.
import { useGLTF } from '@/helpers/useGLTF'

export function CardboardStar(props: React.ComponentProps<'group'>) {
  const { nodes } = useGLTF('/models/cardboard_star.glb')
  return (
    <group {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.mesh_0.geometry}
        material={nodes.mesh_0.material}
      />
    </group>
  )
}

useGLTF.preload('/models/cardboard_star.glb')