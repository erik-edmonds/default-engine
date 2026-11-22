import * as THREE from "three"

/** A box in an object's OWN frame, plus the matrix that puts it in the world.
 *
 *  WHY NOT JUST Box3.setFromObject. Because an axis-aligned world box is the
 *  wrong shape for most of what this scene wants to bracket, and the error is
 *  not small. Measured on the real geometry: the surfboard is a thin slab at a
 *  compound tilt, and its default world AABB is 49% too wide in X and 30% too
 *  deep in Z. The island's own 100-degree yaw (config/positions.ts) inflates
 *  every loose box by up to 17% before anything else is taken into account.
 *  And the three portals are tilted cards whose AABB bears no relation to
 *  their shape at all -- the left-tree portal measures 0.40 x 2.42 x 1.50 for
 *  a card that is 1.5 x 2.43 x 0.1.
 *
 *  Measuring in the target's own frame and carrying its world matrix costs
 *  nothing downstream, because the bracket arms are placed through a composed
 *  matrix either way. */
export type OrientedBox = {
  /** The extents, in the root's local space. */
  box: THREE.Box3
  /** Where that frame sits in the world, as of the last measurement. */
  matrix: THREE.Matrix4
  /** The root's uniform world scale, so world lengths can be converted into
   *  the local space the box is expressed in. Every target in this scene has a
   *  uniform root scale; the max axis is used so a non-uniform one degrades to
   *  something sane rather than silently skewing. */
  scale: number
}

export function makeOrientedBox(): OrientedBox {
  return { box: new THREE.Box3(), matrix: new THREE.Matrix4(), scale: 1 }
}

const _inverse = /*@__PURE__*/ new THREE.Matrix4()
const _local = /*@__PURE__*/ new THREE.Matrix4()
const _child = /*@__PURE__*/ new THREE.Box3()
const _point = /*@__PURE__*/ new THREE.Vector3()
const _size = /*@__PURE__*/ new THREE.Vector3()
const EPS = 1e-6

/** How far past the bones a skinned target's box is pushed, as a share of the
 *  box's own largest dimension. Bones sit inside the surface they drive, so
 *  without this a palm's brackets cut through its fronds and the avatar's
 *  clip his shoulders. */
const SKINNED_PAD = 0.09

/** Set by `walk` when it meets a SkinnedMesh, read by measureOriented. Module
 *  scope because the walk is recursive and threading a flag through every
 *  frame of it buys nothing -- this is single-threaded and the walk is
 *  synchronous. */
let skinnedSeen = false

/** Measure what you can actually SEE, in the root's own frame.
 *
 *  three's expandByObject (three/src/math/Box3.js) has three properties that
 *  are all wrong for an overlay, and each one was caught on real geometry here:
 *
 *    1. It ignores `visible` entirely. MergedScene's shark rig is
 *       visible={false} and would land in any box drawn around the island.
 *    2. A node at scale 0 collapses its geometry box to a POINT at its world
 *       translation, and union() swallows that point. models/Base.tsx parks
 *       about 150 scale-0 particle nodes at scattered non-zero positions, so a
 *       naive box around the hologram comes out the size of that cloud rather
 *       than the size of the pedestal.
 *    3. For a SkinnedMesh it reads geometry.boundingBox, which is the BIND
 *       POSE. The avatar's T-pose arms span 1.52 units and never change as the
 *       Idle clip plays. Passing `precise` does not help: the CPU-side vertex
 *       data is unskinned, so it is still the bind pose.
 *
 *  Testing the world matrix rather than the node NAME for (2) is deliberate:
 *  it catches a collapsed ancestor as well as a collapsed leaf, and it keeps
 *  working when the next export renames particle037. Both tests PRUNE the
 *  subtree, which is also why this is cheaper than a full traverse().
 *
 *  Returns false if nothing visible was found. */
export function measureOriented(
  /** One node, or SEVERAL that together make up one thing.
   *
   *  Several, because the four floating islands have no wrapper to point at.
   *  gltfjsx laid them out as flat siblings under GLTF_SceneRootNode, which
   *  also holds about twenty-five unrelated props -- so the nearest common
   *  ancestor is useless as a target and the left-tree island, for one, is
   *  three separate nodes (Icosphere002_13, BigTree_8, RockTree_28).
   *
   *  The FIRST node gives the frame; the rest are measured into it. They are
   *  siblings with their own transforms, so this is what makes one box out of
   *  them rather than three. */
  root: THREE.Object3D | THREE.Object3D[],
  out: OrientedBox,
): boolean {
  const roots = Array.isArray(root) ? root : [root]
  const frame = roots[0]
  if (!frame) return false
  // true, true: ancestors AND descendants. expandByObject only does
  // updateWorldMatrix(false, false), which is the trap its own docstring warns
  // about -- a box measured off stale ancestors lands somewhere else entirely.
  for (const node of roots) node.updateWorldMatrix(true, true)
  out.box.makeEmpty()
  out.matrix.copy(frame.matrixWorld)
  out.scale = Math.max(1e-6, frame.matrixWorld.getMaxScaleOnAxis())
  _inverse.copy(frame.matrixWorld).invert()
  skinnedSeen = false
  for (const node of roots) walk(node, out.box)
  if (out.box.isEmpty()) return false
  if (skinnedSeen) {
    out.box.getSize(_size)
    out.box.expandByScalar(Math.max(_size.x, _size.y, _size.z) * SKINNED_PAD)
  }
  return true
}

function walk(o: THREE.Object3D, box: THREE.Box3) {
  if (o.visible === false) return
  const e = o.matrixWorld.elements
  // Column lengths are the world scale along each axis. Any zero means this
  // node and everything under it has no extent on screen.
  if (
    Math.hypot(e[0], e[1], e[2]) < EPS ||
    Math.hypot(e[4], e[5], e[6]) < EPS ||
    Math.hypot(e[8], e[9], e[10]) < EPS
  ) return

  const mesh = o as THREE.Mesh & { isSkinnedMesh?: boolean }
  if (mesh.isSkinnedMesh) {
    // BONE WORLD POSITIONS, not computeBoundingBox, and the reason is that
    // the latter's OUTPUT SPACE is ambiguous here.
    //
    // SkinnedMesh.applyBoneTransform ends with
    // `vector.applyMatrix4(this.bindMatrixInverse)`, so its result is in
    // whatever space bindMatrix describes. GLTFLoader binds with the mesh's
    // matrixWorld, taken before the scene has been added and updated -- so in
    // practice bindMatrix is identity and the box comes back in WORLD space,
    // not the mesh's local space. Transforming it again, as every other
    // branch here correctly does, puts a palm's brackets several units off
    // the palm. Measured exactly that way.
    //
    // Bone matrixWorld has no such ambiguity: it is world space by
    // definition, in every three version, whatever the loader did. For a palm
    // the bones run up the trunk and out along each frond, and for the avatar
    // they are the skeleton, so the union traces the POSED shape -- which is
    // the thing the bind pose could never give (the avatar's T-pose arms span
    // 1.52 units and never move as the Idle clip plays).
    const skinned = mesh as unknown as THREE.SkinnedMesh
    for (const bone of skinned.skeleton.bones) {
      _point.setFromMatrixPosition(bone.matrixWorld).applyMatrix4(_inverse)
      box.expandByPoint(_point)
    }
    // Bones sit INSIDE the surface they drive, so the union is always a
    // little tight -- a wrist bone is not the hand, a frond bone is not the
    // leaf. Padded after the walk, in measureOriented, by a share of the
    // box's own size rather than a fixed number, so it scales with whatever
    // is being measured.
    skinnedSeen = true
  } else if (mesh.isMesh) {
    if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox()
    const local = mesh.geometry.boundingBox
    if (local !== null) {
      // The child's transform RELATIVE to the root, so the union accumulates
      // in the root's frame rather than the world's.
      _local.multiplyMatrices(_inverse, o.matrixWorld)
      box.union(_child.copy(local).applyMatrix4(_local))
    }
  }

  for (const c of o.children) walk(c, box)
}
