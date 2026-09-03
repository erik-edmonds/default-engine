import { useLayoutEffect, type RefObject } from 'react'
import type { Material, Object3D } from 'three'

// Turns shadow casting/receiving on for every mesh under a ref'd group.
//
// gltfjsx writes out plain <skinnedMesh>/<mesh> JSX with no shadow flags, so
// most of the scene's props (the avatar, the palm, the gull, the pokeball...)
// were invisible to the key light's shadow map -- the only meshes with flags
// are the ones baked into merged.glb. Setting them by hand would mean editing
// hundreds of generated lines that get clobbered on the next re-export;
// traversing once after mount survives a re-export untouched.
//
// useLayoutEffect, not useEffect: shadow flags are read by the renderer during
// the shadow pass, so they need to be set before the first paint or the model
// pops in shadowless for a frame.
export function useShadows(
  ref: RefObject<Object3D | null | undefined>,
  { cast = true, receive = true }: { cast?: boolean; receive?: boolean } = {},
) {
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      // isMesh covers SkinnedMesh and InstancedMesh too -- both cast fine.
      // Points/Lines are excluded for free, since isMesh is false for them.
      const mesh = o as { isMesh?: boolean; material?: Material | Material[] }
      if (!mesh.isMesh) return
      // Transparent and additive meshes are skipped: the shadow pass renders
      // depth only, so a beam of light or a glow cone would throw the same
      // hard, fully opaque silhouette a solid object does. Pokeball's release
      // beam is the case that forced this.
      if (isTransparent(mesh.material)) return
      o.castShadow = cast
      o.receiveShadow = receive
    })
  }, [ref, cast, receive])
}

function isTransparent(material: Material | Material[] | undefined): boolean {
  if (!material) return false
  if (Array.isArray(material)) return material.some(isTransparent)
  return material.transparent === true
}
