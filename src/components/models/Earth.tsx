import { useRef } from 'react'
import type * as THREE from 'three'
import type { ThreeElements } from '@react-three/fiber'
import { useAnimations } from '@react-three/drei'
// The project's typed wrapper, not drei's -- see next.config.ts on why
// `nodes.Foo.geometry` off drei's Object3D type was 216 errors and the reason
// `ignoreBuildErrors` had to stay on. Every other gltfjsx component in this
// folder goes through it.
import { useGLTF } from '@/helpers/useGLTF'

export function Earth(props: ThreeElements['group']) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials, animations } = useGLTF('/models/earth.glb')
  const { actions } = useAnimations(animations, group)
  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene">
        <group name="Earth" scale={3.586}>
          <mesh
            name="Icosphere001"
            castShadow
            receiveShadow
            geometry={nodes.Icosphere001.geometry}
            material={materials.Water}
          />
          <mesh
            name="Icosphere001_1"
            castShadow
            receiveShadow
            geometry={nodes.Icosphere001_1.geometry}
            material={materials.Grass}
          />
          <mesh
            name="Icosphere001_2"
            castShadow
            receiveShadow
            geometry={nodes.Icosphere001_2.geometry}
            material={materials.Ice}
          />
          <mesh
            name="Icosphere001_3"
            castShadow
            receiveShadow
            geometry={nodes.Icosphere001_3.geometry}
            material={materials.Sand}
          />
        </group>
      </group>
    </group>
  )
}

// NO MODULE-SCOPE PRELOAD ANY MORE.
//
// This read `useGLTF.preload('/models/earth.glb')`, and a module-scope preload
// fires the moment anything imports the file -- PortalInteriors.tsx still
// does, because GlobeInterior is kept compiling. Portal 02 is the phone
// reconstruction now (config/portals.ts), so the globe is never mounted, and
// the preload was fetching 716 KB on every first paint for a model nothing
// draws. Measured in a production probe: /models/earth.glb came back 200 on a
// cold load of the island with no globe anywhere in the scene.
//
// Restoring the globe does not need this line back: drei's useGLTF suspends on
// its own inside the Canvas's boundary, which is how WaterInterior's models
// already load. Put it back only if the globe returns AND the suspense pause
// on opening the portal is measurably worse than the cost of the early fetch.