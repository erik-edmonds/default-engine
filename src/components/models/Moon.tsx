import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

// Pushed into HDR so the disc clears Bloom's threshold -- see Sun.tsx for the
// full reasoning. Lower gain than the sun: a blooming moon should glow, not
// glare.
const MOON_COLOR = new THREE.Color('#eef2ff').multiplyScalar(1.8)

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
                Sun.tsx -- ground fog shouldn't wash out the moon either.
                toneMapped dropped for the same reason as Sun.tsx: the tone
                curve is a post pass now, so the flag was a no-op. */}
            <meshBasicMaterial ref={materialRef} color={MOON_COLOR} transparent fog={false} />
        </mesh>
    </group>
  )
}

useGLTF.preload('/models/moon.glb')