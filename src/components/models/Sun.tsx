import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

// Above 1.0 on purpose. #ff8c1a peaks at exactly 1.0 linear, so with Bloom's
// luminanceThreshold at 0.9 the disc sat right at the edge and barely
// registered; multiplying pushes it into genuine HDR, where the composer's
// HalfFloat buffer can carry it and it blooms like the light source it's
// meant to be. THREE.Color holds values > 1 fine and meshBasicMaterial passes
// them straight through.
const SUN_COLOR = new THREE.Color('#ff8c1a').multiplyScalar(2.6)

export function Sun({ materialRef, ...props }) {
  const { nodes } = useGLTF('/models/sun.glb')
  return (
    <group {...props} dispose={null}>
      {/* Unlit: the sun is a light source in this scene, not something lit
          by one — a standard/lambert material here would show a dark
          "unlit side" wherever it faces away from the directional light,
          instead of reading as a uniformly bright sun disc. */}
      <mesh
        geometry={nodes.Object_4.geometry}
        rotation={[Math.PI / 1.8, Math.PI / 20, 0]}>
        {/* materialRef: Environment.tsx cross-fades this in/out per time of
            day by mutating opacity imperatively every frame (same pattern
            as its other tweened values), not via a re-rendered prop.
            fog={false}: ground-level atmospheric fog shouldn't reach the
            sky -- meshBasicMaterial responds to scene fog by default, which
            was blending the sun toward the fog color at distance and
            washing it out pale instead of a solid disc.
            toneMapped is gone: it only ever defended against the RENDERER's
            tone mapping, and the curve is now a post-processing pass
            (page.tsx's <ToneMapping>) that runs over the finished image
            regardless. Leaving it set was a no-op that just looked like it
            was doing something. */}
        <meshBasicMaterial ref={materialRef} color={SUN_COLOR} transparent fog={false} />
      </mesh>
    </group>
  )
}

useGLTF.preload('/models/sun.glb')