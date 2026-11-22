import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
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

  // MIRROR THE RIGHT ARM ONTO THE LEFT, every frame, after the mixer.
  //
  // The left arm hangs wrong, and it is the CLIP, not the rig or anything this
  // app does. Decoded from base.glb: "Idle_Subtle" has 62 keys on rotation for
  // all eight arm bones, so no track is missing -- the two sides are simply
  // posed differently. The clavicles are the tell, because they ARE an exact
  // mirror (dirY [-0.155, 0.238, 0.959] against [+0.155, 0.238, 0.959]) while
  // the bones hanging off them are not:
  //
  //     upperarm_l  dirY [-0.738, 0.019, -0.675]
  //     upperarm_r  dirY [+0.500, 0.382, -0.778]
  //
  // 0.019 against 0.382 is about twenty-two degrees of shoulder, held for the
  // whole clip. A rig that mirrors at the clavicle and diverges below it is
  // an authoring slip, not deliberate asymmetry.
  //
  // Mirroring across the body's YZ plane is `(x, -y, -z, w)` -- which is
  // exactly the relationship the clavicles and the bind pose already use, so
  // this is the rig's own convention rather than an invention.
  //
  // AFTER THE MIXER: drei's useAnimations registers its frame callback inside
  // the hook above, so this one -- registered later at the same priority --
  // runs after it each frame and has the last word. Writing it in an effect
  // instead would be overwritten on the very next tick.
  const arms = useRef<[THREE.Object3D, THREE.Object3D][] | null>(null)
  useFrame(() => {
    if (arms.current === null) {
      const pairs: [THREE.Object3D, THREE.Object3D][] = []
      for (const base of ["upperarm", "lowerarm", "hand"]) {
        const l = model.getObjectByName(`${base}_l`)
        const r = model.getObjectByName(`${base}_r`)
        if (l && r) pairs.push([l, r])
      }
      arms.current = pairs
    }
    for (const [l, r] of arms.current) {
      l.quaternion.set(r.quaternion.x, -r.quaternion.y, -r.quaternion.z, r.quaternion.w)
    }
  })

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload('/models/Avatars/base.glb')