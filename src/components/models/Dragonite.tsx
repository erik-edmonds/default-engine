import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@/helpers/useGLTF'
import { useFrame } from '@react-three/fiber'

import { useShadows } from '@/helpers/useShadows'

export interface DragoniteHandle {
  materialize: () => Promise<void>
}

export const Dragonite = forwardRef<DragoniteHandle, { [key: string]: any }>((props, ref) => {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials } = useGLTF('/models/Avatars/dragonite.glb')
  useShadows(group)

  const realMaterial = materials['Material.001'] as THREE.MeshStandardMaterial

  const whiteMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: 'white',
    transparent: true,
    depthWrite: false,
    opacity: 1,
  }), [])

  const materializing = useRef(false)
  const resolveRef = useRef<(() => void) | null>(null)
  // THE WHITE IS A FLASH, NOT A PHASE.
  //
  // 2.2 + 0.9 held the figure as a featureless white silhouette for over three
  // seconds -- longer than the beam that is supposed to be producing it, so
  // the beam finished and retracted while a white blob went on standing there.
  // Timed off the video: white at t+4.0s, still white at t+6.5s, Dragonite at
  // t+7.0s. Shortening the BEAM made this worse rather than better, because
  // the beam was never the long part.
  //
  // 0.3 + 0.5 puts the whole thing inside the beam's own 0.8s, which is what
  // makes it read as the beam materialising him rather than as two effects
  // taking turns.
  const HOLD_SECONDS = 0.3
  const FADE_SECONDS = 0.5
  const holdRemaining = useRef(0)
  const fadeProgress = useRef(0)

  useImperativeHandle(ref, () => ({
    materialize: () =>
      new Promise<void>((resolve) => {
        whiteMaterial.opacity = 1
        fadeProgress.current = 0
        holdRemaining.current = HOLD_SECONDS
        materializing.current = true
        resolveRef.current = resolve
      }),
  }), [whiteMaterial])

  useFrame((_state, delta) => {
    if (!materializing.current) return
    if (holdRemaining.current > 0) {
      holdRemaining.current -= delta
      return
    }
    if (fadeProgress.current < 1) {
      fadeProgress.current = Math.min(fadeProgress.current + delta / FADE_SECONDS, 1)
      whiteMaterial.opacity = 1 - fadeProgress.current
    } else {
      materializing.current = false
      resolveRef.current?.()
      resolveRef.current = null
    }
  })

  return (
    // useShadows skips transparent materials, so only the real body below
    // casts -- the whiteMaterial overlay used for the materialize effect
    // doesn't throw a second, solid silhouette on top of it.
    <group ref={group} {...props} dispose={null}>
      <skinnedMesh geometry={nodes.Mesh_0.geometry} material={realMaterial} skeleton={nodes.Mesh_0.skeleton} />
      <skinnedMesh geometry={nodes.Mesh_0.geometry} material={whiteMaterial} skeleton={nodes.Mesh_0.skeleton} />
      <primitive object={nodes.hips} />
    </group>
  )
})

Dragonite.displayName = "Dragonite"
useGLTF.preload('/models/Avatars/dragonite.glb')
