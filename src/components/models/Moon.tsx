import { useGLTF } from '@react-three/drei'

export function Moon({ materialRef, ...props }) {
  const { nodes } = useGLTF('/models/moon.glb')
  return (
    <group {...props} dispose={null}>
        {/* Unlit, same reasoning as Sun.tsx: the moon is a light source in
            this scene, so it should read as a uniformly glowing disc
            instead of having a dark side facing away from the directional
            moonlight. */}
        <mesh geometry={nodes.Object_4.geometry} rotation={[Math.PI / 2, 0, 0]}>
            {/* materialRef: see Sun.tsx -- Environment.tsx cross-fades this
                imperatively every frame. fog={false}: same reasoning as
                Sun.tsx -- ground fog shouldn't wash out the moon either. */}
            <meshBasicMaterial ref={materialRef} color="#eef2ff" toneMapped={false} transparent fog={false} />
        </mesh>
    </group>
  )
}

useGLTF.preload('/models/moon.glb')