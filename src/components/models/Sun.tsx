import { useGLTF } from '@react-three/drei'

export function Sun(props) {
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
        <meshBasicMaterial color="#ff8c1a" toneMapped={false} />
      </mesh>
    </group>
  )
}

useGLTF.preload('/models/sun.glb')