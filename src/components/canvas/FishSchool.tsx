"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { SkeletonUtils } from "three-stdlib"

import { useGLTF } from "@/helpers/useGLTF"
import { POOL_DEPTH } from "@/config/pool"

/** WHY THIS IS NOT AN InstancedMesh, WHICH IS WHAT "INSTANCED" USUALLY MEANS.
 *
 *  The fish is a SKINNED mesh: one skin, eight joints, and a swim cycle that
 *  moves those joints. `InstancedMesh` draws one geometry many times with
 *  per-instance matrices, and a skinned pose does not live in that matrix --
 *  it lives in the skeleton's bone texture, of which there is exactly one.
 *  So an InstancedMesh of this fish renders a school that is either frozen
 *  in a single pose or moving in perfect lockstep, which is the one thing a
 *  school must not do. Real GPU instancing of a skinned mesh needs the
 *  animation baked into a texture and sampled in a vertex shader -- a large
 *  piece of machinery.
 *
 *  It would also buy nothing. The fish is 406 triangles. Fourteen of them is
 *  5,700 triangles, which is less than a quarter of one of the island's
 *  trees; the draw calls are the only real cost and fourteen is not a
 *  number worth engineering around.
 *
 *  So this does the thing instancing is FOR -- share the expensive parts --
 *  without the part that cannot work. Every fish is a SkeletonUtils.clone
 *  of one cached glTF, so all fourteen share a single uploaded geometry and
 *  a single material and texture; what each one owns privately is its
 *  skeleton and its AnimationMixer, because that is precisely what has to
 *  differ for them to swim out of step. */

/** How many fish.
 *
 *  Scaled to the depth they now cover rather than picked. 14 read well across
 *  a 3.5-unit band; spread over the pool's full ~13 units that same 14 left
 *  roughly three in frame at a time and long stretches of empty water. 28
 *  holds the density that looked right. At 406 triangles each that is ~11k
 *  triangles, and the geometry and material are shared by all of them, so the
 *  cost is 28 draw calls rather than 28 models. */
const COUNT = 28

/** Nose-to-tail length in world units, once scaled.
 *
 *  The scale that achieves it is MEASURED from the model's own bounding box
 *  rather than divided out of a constant, and that is not fussiness -- the
 *  first version used the raw vertex extent (16.46) and produced fish five
 *  millimetres long, two pixels on screen. fish.glb nests its mesh under a
 *  `scale={0.01}` group of its own, so the file's natural size is 0.165
 *  units, not 16.5, and dividing by the vertex extent applied that hundredth
 *  twice. A Box3 of the loaded scene cannot make that mistake. */
const FISH_LENGTH = 0.7

/** WHERE THE SCHOOL SWIMS, IN THE COLUMN'S OWN SPACE.
 *
 *  LANES ACROSS THE POOL, NOT ORBITS. They used to circle on ellipses, which
 *  meant half the school was swimming away from you at any moment and the
 *  whole thing read as milling about. They all cross left to right now and
 *  wrap, so the pool has traffic going one way.
 *
 *  The camera sits at the portal plane and the pool group hangs at y 1.15
 *  in front of it, so a fish at DEPTH_NEAR is roughly at eye level and the
 *  rest tail away below, coming into view as the pool scrolls past. */
const DEPTH_NEAR = -0.5
/** THE POOL FLOOR, DERIVED -- AND THE ARITHMETIC MATTERS.
 *
 *  This has been wrong twice. -4.0 put the whole school in the top quarter;
 *  -(SCROLL_RANGE - 1) = -9.4 looked like it covered the journey and did not,
 *  because the scroll does not move the CAMERA down, it raises the COLUMN
 *  past a fixed lens. A fish at depth d sits at eye level when the column has
 *  risen by -(1.15 + d), so at full scroll (SCROLL_RANGE = 10.4) the band you
 *  can actually see is depth -13.4 to -9.8 -- entirely below where the fish
 *  stopped. Measured: 12 fish in frame at the surface, 0 at the floor.
 *
 *  The honest bound is the pool's own floor, POOL_DEPTH, which is where the
 *  water ends. 0.4 of margin keeps the deepest fish off the tiles. */
const DEPTH_FAR = -(POOL_DEPTH - 0.4)
/** How far each way a lane runs before it wraps, and how far back the lanes
 *  sit. The pool is 6 half-wide; the lanes stop short of the glass so a fish
 *  never clips through a wall as it wraps. */
const LANE_HALF_X = 5.2
const LANE_Z = { min: -2.6, max: -0.2 }

/** Lane speed, world units a second. A spread, so the school strings out
 *  instead of crossing as one rigid row. */
const LANE_SPEED = { min: 0.22, max: 0.52 }

/** THE MODEL'S OWN AXES, MEASURED FROM ITS SKELETON.
 *
 *  fish.glb is authored Z-up, and its two wrapper rotations cancel, so the
 *  mesh arrives in three.js still in Blender's convention. The bones say
 *  which way is which: bone_mouth_04 sits at y -4.91 and bone_tailfin_06 at
 *  y +4.18, so the nose points down the model's own -Y, and +Z is its back.
 *
 *  three's lookAt -- and every other orientation helper -- assumes forward
 *  is -Z and up is +Y, which is why the first version, pointing each fish
 *  along its orbit tangent, had the whole school facing backwards. */
const MODEL_FORWARD = new THREE.Vector3(0, -1, 0)
const MODEL_UP = new THREE.Vector3(0, 0, 1)

/** The rotation that turns the model's axes into three's.
 *
 *  BUILT AS A BASIS, NOT AS EULER ANGLES. A single rotation about X gets the
 *  heading right and leaves the fish rolled onto its side -- which is what
 *  the first attempt did, and the screenshot showed a school swimming
 *  nose-down. Forward and up have to be satisfied together, and a basis
 *  states both at once with no question of which order the angles compose
 *  in.
 *
 *  The columns are where the model's own x, y and z end up. Right is
 *  forward x up, which keeps the basis right-handed -- a left-handed one
 *  would mirror every fish. */
const MODEL_FIX = (() => {
  const forward = MODEL_FORWARD.clone().normalize()
  const up = MODEL_UP.clone().normalize()
  // Where the model's axes must land: its forward on -Z, its up on +Y.
  const zCol = up.clone()
  const yCol = forward.clone().negate()
  const xCol = new THREE.Vector3().crossVectors(yCol, zCol)
  const m = new THREE.Matrix4().makeBasis(xCol, yCol, zCol)
  return new THREE.Quaternion().setFromRotationMatrix(m)
})()

/** Heading for a fish travelling in +X.
 *
 *  +90, and the sign was settled by LOOKING rather than by derivation. The
 *  bone positions above fix the body's axis but not which end is the nose:
 *  a joint's translation is relative to its parent, not an absolute point,
 *  so bone_mouth_04 at y -4.91 says the chain runs that way, not that the
 *  mouth leads. Derived from -Z the heading came out backwards -- the
 *  school swam right while facing left -- so the model's nose is down its
 *  +Y, and after the basis above that is +Z rather than -Z. */
const SWIM_HEADING_Y = Math.PI / 2

/** A fish's own orbit. Deterministic -- seeded from its index rather than
 *  Math.random -- so the school looks the same on every visit and on the
 *  server and client alike, which a random layout would not. */
function layout(i: number) {
  // A HASH, NOT THREE MULTIPLIERS -- and the difference is visible.
  //
  // This used `(i * 7919) % 1000`, `(i * 6271) % 1000` and `(i * 4567) %
  // 1000`, which are each linear in i, so any two of them are linearly
  // related mod 1000 and the pairs land on a lattice of parallel lines.
  // With the fish on orbits that was hidden; strung out along lanes it put
  // the whole school on one diagonal. The same sine hash
  // PortalInteriors.tsx uses for its point cloud decorrelates them, and is
  // still a pure function of the index, so the layout stays identical on
  // every visit and between server and client.
  const hash = (n: number, salt: number) => {
    const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453
    return x - Math.floor(x)
  }
  const a = hash(i + 1, 1)
  const b = hash(i + 1, 2)
  const c = hash(i + 1, 3)

  return {
    // Spread down the column rather than all at one depth, so scrolling the
    // pool passes through them instead of past a single shoal.
    depth: DEPTH_NEAR + (DEPTH_FAR - DEPTH_NEAR) * c,
    z: LANE_Z.min + (LANE_Z.max - LANE_Z.min) * b,
    speed: LANE_SPEED.min + (LANE_SPEED.max - LANE_SPEED.min) * b,
    // Spread along the lane so they do not all enter together.
    startX: -LANE_HALF_X + 2 * LANE_HALF_X * a,
    bob: 0.10 + 0.22 * b,
    bobRate: 0.5 + 0.8 * c,
    phase: a * Math.PI * 2,
    // A little size variation, so a fish further down the column reads as
    // further away rather than as the same fish stamped on a grid.
    size: 0.78 + 0.44 * a,
  }
}

type Swimmer = {
  root: THREE.Object3D
  mixer: THREE.AnimationMixer
  path: ReturnType<typeof layout>
}

export function FishSchool() {
  const { scene, animations } = useGLTF("/models/fish.glb")
  const group = useRef<THREE.Group>(null)

  const swimmers = useMemo<Swimmer[]>(() => {
    // "swim" by name rather than animations[0]: the file carries seven clips
    // (swim, idle, bite, and left/right variants of each) and the order they
    // come back in is the exporter's business, not a promise.
    const clip = animations.find((a) => a.name === "swim") ?? animations[0]
    // The model's own size, whatever its exporter decided that should be.
    const span = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
    const fishScale = FISH_LENGTH / Math.max(span.x, span.y, span.z, 1e-6)

    return Array.from({ length: COUNT }, (_, i) => {
      // SkeletonUtils.clone, not Object3D.clone -- a plain clone copies the
      // mesh without rebinding its skeleton to the copied bones, and three
      // then dereferences undefined bones when it computes the bounding
      // sphere. PortalInteriors.tsx records the same crash from the same
      // cause on the avatar.
      const model = SkeletonUtils.clone(scene)
      // THE AXIS CORRECTION, ONCE, ON A WRAPPER.
      //
      // The clone keeps the file's own -Y forward; this group turns that
      // into the -Z every three.js helper expects. The lane below then only
      // has to set a heading about Y, and the mixer still drives the clone
      // inside it untouched. See MODEL_FORWARD_FIX_X.
      const root = new THREE.Group()
      model.quaternion.copy(MODEL_FIX)
      // Set once, here, rather than every frame: every fish travels the
      // same way so the heading is a constant, and assigning it in the
      // frame loop is both wasted work and a write to a memoised value that
      // react-hooks/immutability rightly rejects.
      root.rotation.y = SWIM_HEADING_Y
      root.add(model)
      root.scale.setScalar(fishScale * layout(i).size)
      const mixer = new THREE.AnimationMixer(model)
      if (clip) {
        const action = mixer.clipAction(clip)
        action.play()
        // Each fish enters the cycle at its own point.
        action.time = (i * 0.37) % clip.duration
      }
      return { root, mixer, path: layout(i) }
    })
  }, [scene, animations])

  // Mounted imperatively because these are cloned Object3Ds rather than
  // elements -- and torn down properly, since a mixer holds onto its root.
  useEffect(() => {
    const parent = group.current
    if (!parent) return
    for (const s of swimmers) parent.add(s.root)
    return () => {
      for (const s of swimmers) {
        parent.remove(s.root)
        s.mixer.stopAllAction()
        s.mixer.uncacheRoot(s.root)
      }
    }
  }, [swimmers])

  useFrame((state, delta) => {
    // A long frame -- a tab coming back from the background -- would
    // otherwise advance every mixer by the whole gap at once.
    const step = Math.min(delta, 1 / 20)
    const t = state.clock.elapsedTime

    for (const { root, mixer, path } of swimmers) {
      mixer.update(step)

      // ONE DIRECTION, WRAPPING. The lane runs left to right and the fish
      // reappears at the left edge rather than turning round: a school that
      // doubles back reads as confused, and nothing here is close enough to
      // the glass for the jump to be seen.
      const travelled = path.startX + t * path.speed
      const span = LANE_HALF_X * 2
      const x = -LANE_HALF_X + (((travelled + LANE_HALF_X) % span) + span) % span

      root.position.set(
        x,
        path.depth + Math.sin(t * path.bobRate + path.phase) * path.bob,
        path.z,
      )
      // No lookAt and no per-frame heading: the fish all travel one way and
      // were oriented once at construction. Pointing them with lookAt along
      // a tangent is what had them facing backwards in the first place.
    }
  })

  return <group ref={group} />
}

useGLTF.preload("/models/fish.glb")
