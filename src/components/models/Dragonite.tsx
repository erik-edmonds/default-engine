import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'

export interface DragoniteHandle {
  materialize: () => Promise<void>
}

// Two skinnedMeshes share the same geometry/skeleton and sit exactly on top
// of each other: the real material, always plain and opaque underneath, and
// an unlit white overlay whose opacity fades from 1 (fully hides the real
// material, reads as a flat white silhouette) to 0 (fully reveals it). This
// replaced an onBeforeCompile hack that forced the real (lit)
// MeshStandardMaterial's diffuseColor to white -- that still went through
// the material's normal PBR lighting afterward, so it always came out
// shaded/gradient, never the flat, stark white silhouette actually wanted
// (confirmed by the user swapping the material out entirely and getting
// exactly that flat white from Three's material-less fallback). It also
// replaced a first attempt at this same two-mesh idea that made BOTH layers
// transparent and crossfaded their opacities together -- two coincident
// transparent surfaces produced a genuinely broken blend (visibly
// see-through, warped-looking geometry). Keeping the real material plain
// opaque -- it's never touched, so it doesn't even need cloning -- means
// there is only ever one transparent surface on screen at a time.
export const Dragonite = forwardRef<DragoniteHandle, { [key: string]: any }>((props, ref) => {
  const { nodes, materials } = useGLTF('/models/Avatars/dragonite.glb')

  const realMaterial = materials['Material.001'] as THREE.MeshStandardMaterial

  const whiteMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: 'white',
    transparent: true,
    depthWrite: false,
    opacity: 1,
  }), [])

  const materializing = useRef(false)
  const resolveRef = useRef<(() => void) | null>(null)
  // How long to hold at pure white before fading to the real material --
  // 0.55s wasn't nearly enough to actually register as "white" to a viewer;
  // at least 2s of held white silhouette, matching the reference reveal
  // beat, before the material fades in.
  const HOLD_SECONDS = 2.2
  const FADE_SECONDS = 0.9
  const holdRemaining = useRef(0)
  const fadeProgress = useRef(0) // 0 = pure white, 1 = fully real material

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
    <group {...props} dispose={null}>
      <skinnedMesh geometry={nodes.Mesh_0.geometry} material={realMaterial} skeleton={nodes.Mesh_0.skeleton} />
      <skinnedMesh geometry={nodes.Mesh_0.geometry} material={whiteMaterial} skeleton={nodes.Mesh_0.skeleton} />
      <primitive object={nodes.hips} />
    </group>
  )
})

Dragonite.displayName = "Dragonite"

// Without this, Dragonite only starts loading its glb on the *first* mount
// -- i.e. exactly when materializeDragonite() tries to swap to it instantly
// -- so the "immediate" swap the pokeball reveal depends on would instead
// show Next's full-screen Suspense/loading overlay for a beat. Preloading
// eagerly means it's already cached well before the pokeball is ever
// clicked.
useGLTF.preload('/models/Avatars/dragonite.glb')
