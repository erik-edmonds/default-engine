import type { ThreeElements } from '@react-three/fiber'
// The project's typed wrapper, NOT drei's. Straight from drei, `nodes` is
// `{ [name: string]: Object3D }`, and reading `.geometry` off one is a type
// error -- the same error, 216 times over, that next.config.ts describes as
// the reason `typescript.ignoreBuildErrors` had to stay on. Every other
// gltfjsx component in this folder goes through the wrapper; this one was
// generated later and kept drei's import, which put three of those errors
// back and broke `tsc --noEmit` again.
import { useGLTF } from '@/helpers/useGLTF'

export function Sign(props: ThreeElements['group']) {
  const { nodes } = useGLTF('/models/sign.glb')
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

useGLTF.preload('/models/sign.glb')
