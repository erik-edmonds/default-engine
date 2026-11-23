import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { useRef, useEffect, useMemo } from 'react'
import { useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import { useGLTF } from '@/helpers/useGLTF'

export function Avatar(props: ThreeElements['group']) {
  const group = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF('/models/Avatars/base.glb')

  // Cloned, and this is a correctness fix rather than a tidy-up.
  //
  // This used to render `<primitive object={nodes.root} />`, and a <primitive>
  // MOVES the object it is given -- so the one and only bone hierarchy was
  // re-parented out of useGLTF's shared cache and into this component. Any
  // later consumer of base.glb then cloned a `gltf.scene` with no bones left
  // in it: SkeletonUtils had nothing to remap, the clone came back with all 28
  // skeleton slots undefined, and three dereferenced `bone.matrixWorld` while
  // computing that mesh's bounding sphere during frustum culling. That was the
  // "Cannot read properties of undefined (reading 'matrixWorld')" crash, and
  // the portal avatar was the consumer that found it.
  //
  // Cloning here means the cache stays pristine for everyone, so the next
  // reuse of this asset cannot hit the same thing. SkeletonUtils.clone (not
  // Object3D.clone) is required: a plain clone copies the mesh without
  // remapping its skeleton to the copied bones, which reproduces the bug.
  //
  // Names survive the clone, so useAnimations still binds its clips and
  // anything looking up a bone by name still finds it.
  const model = useMemo(() => SkeletonUtils.clone(scene), [scene])

  // UNDO THE EXPORTER'S EMISSIVE, which is why he glowed and took no shadow.
  //
  // base.glb's only material carries `metallicFactor: 1`, `emissiveFactor:
  // [1,1,1]` and an `emissiveTexture` whose image index is THE SAME as
  // `baseColorTexture` -- a three.js re-export wrote the albedo back out a
  // second time as an emissive map. Metalness 1 zeroes the diffuse lobe, and
  // this project's <Environment> is a hand-rolled light rig rather than drei's
  // HDRI loader so there is no scene.environment to stand in for it. What
  // rendered was a flat, unlit copy of his own texture, added AFTER lighting
  // and therefore unshadowed, then haloed by <Bloom luminanceThreshold={0.9}>.
  // Reported as "doesn't take shadows", "isn't involved in the scene",
  // "glows", and "looks low resolution" -- which was never resolution at all
  // (the map is a genuine 4096 square), but the total absence of any shading
  // gradient across him.
  //
  // The castShadow/receiveShadow flags were already correct at
  // AvatarController.tsx:863-866; it was the material that declined to use
  // them.
  //
  // SkeletonUtils.clone SHARES material instances rather than copying them, so
  // this one pass also reaches the avatar inside the portal
  // (PortalInteriors.tsx). That is wanted -- he had the same problem there --
  // and is stated here because it is the kind of thing that is otherwise
  // discovered rather than decided.
  useEffect(() => {
    model.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        const std = material as THREE.MeshStandardMaterial
        if (std.isMeshStandardMaterial !== true) continue
        std.emissiveIntensity = 0
        std.metalness = 0
        // Roughness left where the export put it (1): he is cloth and skin,
        // and a specular lobe on either would read as wet.
        if (std.map) std.map.anisotropy = 8
        std.needsUpdate = true
      }
    })
  }, [model])

  animations[0].name = "Idle"
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions["Idle"]?.reset().play()
  }, [actions])

  // THE ARMS ARE LEFT EXACTLY AS THE RIG AND THE CLIP AUTHOR THEM, and that
  // is a decision rather than an omission.
  //
  // base.glb is asymmetric in two measurable ways. `upperarm_l` rests 31.2
  // degrees away from the mirror of `upperarm_r` -- the clavicles mirror
  // exactly under (x, -y, -z, w), so that convention is the rig's own and the
  // shoulders simply do not follow it. And the left forearm and hand sit
  // 0.209 / 0.201 from their parents against the right's 0.150 / 0.140, a left
  // arm 41% longer than the right.
  //
  // Two corrections were tried here and both were rejected on sight:
  //
  //   1. Writing the right bone's mirrored ABSOLUTE quaternion onto the left.
  //      It squares the arms up and plants the left shoulder 31 degrees
  //      outside the orientation its skin was bound for, which splays the
  //      sleeve -- and the hoodie is one mesh across both shoulders, so both
  //      sides read wrong.
  //   2. Mirroring the clip's MOTION relative to each bone's own rest pose,
  //      plus copying the right forearm and hand lengths onto the left. That
  //      keeps every bone in the space its weights expect, and the silhouette
  //      came out narrower and more sloped than the model is meant to be.
  //
  // The asymmetry is in the asset. Fixing it in a frame callback means fighting
  // skin weights that were authored around it, and every version of that fight
  // has looked worse than leaving it alone. If the arms are to match, the rig
  // is the place -- rebind the left arm in Blender and re-export, and this file
  // needs nothing at all.

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload('/models/Avatars/base.glb')