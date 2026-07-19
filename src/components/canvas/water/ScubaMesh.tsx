'use client'

import * as THREE from 'three'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import * as scubaRenderShader from './shaders/scubaRender'

const SCUBA_BOUNDING_RADIUS = 0.25

// Renders the existing portfolio Scuba avatar (public/models/Avatars/scuba.glb,
// see src/components/models/Scuba.tsx for the original usage) as the water
// pool's mesh-kind object, in place of the source project's Duck. Loaded
// via useGLTF/Suspense -- the caller must wrap this in its own nested
// <Suspense> so loading Scuba doesn't block the rest of the scene's first
// paint (see WaterScene.tsx).
//
// Ported from water/src/objects/DuckObject.ts's `loadModel()`: normalizes
// scale/pivot via a Box3 measurement so the model fits `boundingRadius * 2`
// regardless of its native (human-scale) size, and swaps in a custom
// ShaderMaterial (adapted from DuckRender.vert/frag) supporting the water
// AO/caustics/texturePassMode pipeline in place of the GLTF's own baked
// material -- reusing that baked material's own diffuse map
// (`materials['Material.001'].map`) as the shader's `modelTexture`.
//
// Note: neither this shader nor ObjectTexturePass's shadow pass apply
// skinning matrices (matches the source, which never needed to since Duck
// isn't skinned) -- since Scuba is never animated here, its skeleton stays
// at bind pose, where skin transforms are effectively identity, so the
// unskinned vertex position is a correct approximation of the current pose.
export function ScubaMesh({
  ref,
  lightDirection,
  causticTexture,
}: {
  ref?: React.Ref<THREE.Group>
  lightDirection: THREE.Vector3
  causticTexture: THREE.Texture
}) {
  const { nodes, materials } = useGLTF('/models/Avatars/scuba.glb') as unknown as {
    nodes: Record<string, THREE.Mesh & { skeleton: THREE.Skeleton }>
    materials: Record<string, THREE.MeshStandardMaterial>
  }

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: scubaRenderShader.vertexShader,
        fragmentShader: scubaRenderShader.fragmentShader,
        uniforms: {
          light: { value: lightDirection.clone() },
          poolWidth: { value: 1.0 },
          poolHeight: { value: 1.0 },
          poolLength: { value: 1.0 },
          meshCenter: { value: new THREE.Vector3() },
          water: { value: null },
          causticTex: { value: causticTexture },
          modelTexture: { value: materials['Material.001'].map },
          texturePassMode: { value: 0 },
        },
        depthTest: true,
        depthWrite: true,
      }),
    [lightDirection, causticTexture, materials],
  )

  const normalizeGroupRef = useRef<THREE.Group>(null)

  useLayoutEffect(() => {
    const inner = normalizeGroupRef.current
    if (!inner) return
    const box = new THREE.Box3().setFromObject(inner)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())

    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = maxDim > 0 ? (SCUBA_BOUNDING_RADIUS * 2) / maxDim : 1

    inner.scale.setScalar(scale)
    inner.position.sub(center.multiplyScalar(scale))
    inner.position.y -= box.min.y * scale
  }, [])

  return (
    <group ref={ref} frustumCulled={false}>
      <group ref={normalizeGroupRef}>
        <skinnedMesh geometry={nodes.Mesh_0.geometry} material={material} skeleton={nodes.Mesh_0.skeleton} frustumCulled={false} />
        <primitive object={nodes.root} />
      </group>
    </group>
  )
}

useGLTF.preload('/models/Avatars/scuba.glb')
