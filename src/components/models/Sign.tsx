import type { ThreeElements } from '@react-three/fiber'
// The project's typed wrapper, NOT drei's. Straight from drei, `nodes` is
// `{ [name: string]: Object3D }`, and reading `.geometry` off one is a type
// error -- the same error, 216 times over, that next.config.ts describes as
// the reason `typescript.ignoreBuildErrors` had to stay on. Every other
// gltfjsx component in this folder goes through the wrapper.
import { useGLTF } from '@/helpers/useGLTF'

/** The signpost on the beach.
 *
 *  Named so it can be found and measured -- nothing outside this file could
 *  ask where it was on screen before, which is awkward when the complaint
 *  about it is that it is not in frame. */
export function Sign(props: ThreeElements['group']) {
  const { nodes } = useGLTF('/models/sign.glb')
  return (
    <group name="about-sign" {...props} dispose={null}>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.mesh_0.geometry}
        material={nodes.mesh_0.material}
        // The one thing corrected here, and it is a rendering fault rather
        // than a design change: the GLB ships `metallicFactor: 1.0`, and a
        // fully metallic board under this scene's AgX tonemap and bloom
        // blows out to a flat white rectangle. A painted sign is not a
        // mirror. Set at the boundary rather than by editing the binary, so
        // the correction is readable.
        material-metalness={0.05}
        material-roughness={0.85}
      />
    </group>
  )
}

useGLTF.preload('/models/sign.glb')
