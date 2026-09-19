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

  animations[0].name = "Idle"
  const { actions } = useAnimations(animations, group)
  useEffect(() => {
    actions["Idle"]?.reset().play()
  }, [actions])

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload('/models/Avatars/base.glb')