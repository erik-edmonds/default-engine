import { useGLTF as useGLTFDrei } from "@react-three/drei"
import { useGraph as useGraphFiber } from "@react-three/fiber"
import type * as THREE from "three"

/** drei's `useGLTF`, with `nodes` typed as the meshes they actually are.
 *
 *  react-three-fiber declares the graph as `nodes: { [name: string]:
 *  THREE.Object3D }`, because in the general case that is all it can promise.
 *  But every call site in this repo is gltfjsx output reading
 *  `nodes.Whatever.geometry` off a known model, and `geometry` is not on
 *  `Object3D` -- so each one was a type error. There were **216 of them**, and
 *  they were the reason `typescript.ignoreBuildErrors` had to stay on, which in
 *  turn hid two genuine bugs in hand-written code (see helpers/StateProvider).
 *
 *  The obvious fix -- augmenting r3f's `ObjectMap` interface -- is not
 *  available: `nodes` is an index signature, and a declaration merge cannot
 *  narrow an existing member's type.
 *
 *  So this narrows at the boundary instead. It is a cast, and it is the honest
 *  place for one: the claim "this named node is a mesh" is exactly what gltfjsx
 *  already assumed when it generated the code, and it is checked at runtime by
 *  the model failing to render if it is wrong. Everything else in those files
 *  stays type-checked, which `@ts-nocheck` at the top of each would not have
 *  allowed. */
type GltfMesh = THREE.Mesh & THREE.SkinnedMesh & THREE.Bone

/** Declared rather than derived. `ReturnType<typeof useGLTFDrei>` resolves
 *  through an overload that drops `materials`, `animations` and `scene`, which
 *  is worse than useless -- it turns "this property is untyped" into "this
 *  property does not exist". */
interface TypedGltf {
  nodes: Record<string, GltfMesh>
  /** Standard rather than base Material: gltfjsx output reads `.color`,
   *  `.map`, `.roughness` off these, none of which are on THREE.Material. */
  materials: Record<string, THREE.MeshStandardMaterial>
  animations: THREE.AnimationClip[]
  scene: THREE.Group
  scenes: THREE.Group[]
  cameras: THREE.Camera[]
  asset: Record<string, unknown>
}

export function useGLTF(path: string): TypedGltf {
  return useGLTFDrei(path) as unknown as TypedGltf
}

// Carried across so call sites can keep using the one import. `preload` in
// particular runs at module scope in nearly every model file.
useGLTF.preload = useGLTFDrei.preload
useGLTF.clear = useGLTFDrei.clear
useGLTF.setDecoderPath = useGLTFDrei.setDecoderPath

/** The same narrowing for `useGraph`, which the components that clone a scene
 *  with SkeletonUtils go through instead of reading `useGLTF().nodes`. */
export function useGraph(object: THREE.Object3D): { nodes: Record<string, GltfMesh>; materials: Record<string, THREE.MeshStandardMaterial> } {
  return useGraphFiber(object) as unknown as { nodes: Record<string, GltfMesh>; materials: Record<string, THREE.MeshStandardMaterial> }
}
