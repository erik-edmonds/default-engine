import { useGLTF } from '@react-three/drei'

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
        rotation={[Math.PI / 2, 0, 0]}>
        {/* materialRef: Environment.tsx cross-fades this in/out per time of
            day by mutating opacity imperatively every frame (same pattern
            as its other tweened values), not via a re-rendered prop.
            fog={false}: ground-level atmospheric fog shouldn't reach the
            sky -- meshBasicMaterial responds to scene fog by default, which
            was blending the sun toward the fog color at distance and
            washing it out pale instead of a solid disc. */}
        <meshBasicMaterial ref={materialRef} color="#ff8c1a" toneMapped={false} transparent fog={false} />
      </mesh>
    </group>
  )
}

useGLTF.preload('/models/sun.glb')