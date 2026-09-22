// The repo's typed wrapper, not drei's.
//
// gltfjsx writes `nodes.Foo.geometry`, and r3f types `nodes` as a record of
// bare Object3D -- which has no `geometry`. helpers/useGLTF.ts narrows that
// once at the boundary, which is why every other model in this folder imports
// from there. See the note in next.config.ts: 216 of the 615 errors that
// `typescript.ignoreBuildErrors` used to hide were this exact thing.
import { useGLTF } from '@/helpers/useGLTF'

export function PaperCloud(props: React.ComponentProps<'group'>) {
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