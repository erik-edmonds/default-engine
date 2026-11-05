import { useMemo } from "react"
import * as THREE from "three"
import type { ThreeElements } from "@react-three/fiber"

import { useGLTF } from "@/helpers/useGLTF"

/** The wrist computer on the left forearm, in the scan viewer.
 *
 *  REWRITTEN FROM THE gltfjsx OUTPUT, which addressed all 55 primitives by
 *  name -- `nodes.defaultMaterial`, `nodes.defaultMaterial_1`, ...
 *  `nodes.defaultMaterial_54`. That version did not compile: it imported
 *  `useGLTF` from `@react-three/drei`, whose `nodes` map is typed
 *  `Record<string, Object3D>`, so every `.geometry` was a type error --
 *  55 of them, plus an implicit-any `props`, and they were the ONLY 56 errors
 *  in the repo. next.config.ts:9-11 records that this exact mistake once
 *  produced 216 of them and was why `ignoreBuildErrors` had to stay on.
 *
 *  Addressing by name was also fragile for a second reason. Every one of the
 *  55 mesh nodes in this GLB is literally named `defaultMaterial`; the
 *  `_1`...`_54` suffixes exist only because three's
 *  `GLTFLoader.createUniqueName` invents them while parsing. Nothing in the
 *  file guarantees that order, and `scripts/compress-model.mjs` already
 *  refuses to run `dedup()`/`prune()` precisely because a graph rewrite would
 *  rename them and the component would throw "Cannot read properties of
 *  undefined (reading 'geometry')" the moment the wrist came into view.
 *
 *  Rendering the scene instead is shorter, immune to renaming, and keeps the
 *  file's own hierarchy -- which matters here because the only two nodes in
 *  the whole GLB that carry a transform are the Sketchfab wrapper's -90 and
 *  +90 rotations about X. They cancel; the gltfjsx output reproduced both as
 *  nested groups, and this reproduces them by simply not discarding them.
 */

/** A CLONE, NEVER THE CACHED SCENE ITSELF.
 *
 *  `<primitive object={scene}>` re-parents the object three's loader cache is
 *  holding, so the next component to call `useGLTF` on the same URL receives a
 *  scene whose children have been moved out from under it. Avatar.tsx
 *  documents the crash that follows ("Cannot read properties of undefined
 *  (reading 'matrixWorld')" inside frustum culling) at length; this is the
 *  same hazard with a smaller model.
 */
export function Pipboy(props: ThreeElements["group"]) {
  const { scene } = useGLTF("/models/pipboy.compressed.glb")

  const model = useMemo(() => {
    const copy = scene.clone(true)

    // UNLIT, AND NOT BECAUSE THERE IS NO LIGHT.
    //
    // There was not one light in this scene until the hands needed some -- a
    // point cloud carries its own colour and is unlit by construction (see
    // `toneMapped={false}` on its pointsMaterial) -- and a standard-material
    // prop in a scene with no lights is a black brick, which is easy to
    // misread as "the model failed to load". ScanExperience carries a small
    // light rig now, so that is no longer the reason.
    //
    // The reason now is that this asset's detail is BAKED. Its maps are
    // albedo and emissive, authored for a Sketchfab turntable, and lighting
    // them again adds nothing a wrist-mounted prop will ever show. Basic is
    // also the cheaper material on a route that measures its own frame cost,
    // and it cannot go black if the light rig is ever changed.
    //
    // The screens survive because their glow is BAKED too: the file carries
    // KHR_materials_emissive_strength on two materials, and an emissive map
    // reads identically through a basic material as long as it is the map
    // being sampled. The owner's brief is that this is a prop with no live
    // text, which is exactly what makes that lossless.
    copy.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.castShadow = false
      o.receiveShadow = false
      // Not a pointer target: the ray has a menu to hit and a prop strapped to
      // your own arm must never be in front of it.
      o.raycast = () => null
      const from = o.material
      if (Array.isArray(from) || !(from instanceof THREE.MeshStandardMaterial)) return
      const emissive = from.emissiveMap != null || from.emissive?.getHex() !== 0x000000
      o.material = new THREE.MeshBasicMaterial({
        // An emissive surface is defined by its emissive channel, so take that
        // where it exists and the base colour everywhere else.
        map: (emissive ? from.emissiveMap : null) ?? from.map,
        color: emissive && from.emissiveMap == null ? from.emissive : from.color,
        transparent: from.transparent,
        opacity: from.opacity,
        side: from.side,
        toneMapped: false,
      })
    })
    return copy
  }, [scene])

  return (
    <group {...props} dispose={null}>
      <primitive object={model} />
    </group>
  )
}

// NO MODULE-SCOPE PRELOAD, deliberately -- the one the generated file carried
// has been removed.
//
// `useGLTF.preload()` at module scope fires on IMPORT, not on mount, so merely
// importing this file would start the fetch. That is the trap `fish.glb`
// sprang: shelving the water scene did not stop the download, because the
// import alone kept the preload alive, and it took pulling the whole interior
// behind React.lazy to actually stop it.
//
// This model is reachable only from inside an immersive session, so the fetch
// is requested deliberately when the session arms instead.
