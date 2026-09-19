"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Gltf } from "@react-three/drei"
import { SkeletonUtils } from "three-stdlib"
import { useGLTF } from "@/helpers/useGLTF"

import type { PortalInteriorKind } from "@/config/portals"

// What you see through the glass.
//
// All three portals used to hold /models/earth.glb at scales 8, 1 and 2 -- one
// model three times, which is why the arrival read as decoration rather than as
// a destination. These are three genuinely different things, each one saying
// something about where its portal goes, and none of them adds a byte to the
// download: the point cloud is generated, and the globe and the avatar are
// already in the scene's cache.

/** A drifting cloud of points.
 *
 *  Generated rather than loaded, which makes it the one interior that owes
 *  nobody an attribution, and the nearest thing this scene can say about the
 *  gaussian-splatting project without shipping an actual splat. */
function PointCloudInterior({ count = 1400, accent = '#8fd4ff' }: { count?: number; accent?: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])

  // Points on a shell rather than through a solid ball: a uniform-in-volume
  // distribution looks like fog, a shell reads as an object.
  //
  // Every value is derived from the index, not from Math.random(). Two reasons:
  // a random draw during render is impure and the React compiler rightly
  // rejects it, and a cloud that is identical on every load is one a screenshot
  // or a test can actually pin down.
  const points = useMemo(() => {
    const noise = (i: number, salt: number) => {
      const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
      return x - Math.floor(x)
    }
    const out: { p: THREE.Vector3; s: number; phase: number }[] = []
    for (let i = 0; i < count; i++) {
      // Fibonacci sphere -- even coverage without the clumping at the poles
      // that naive lat/long sampling gives.
      const y = 1 - (i / (count - 1)) * 2
      const r = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = i * 2.399963229728653
      const jitter = 0.86 + noise(i, 1) * 0.2
      out.push({
        p: new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).multiplyScalar(jitter * 1.35),
        s: 0.012 + noise(i, 2) * 0.022,
        phase: noise(i, 3) * Math.PI * 2,
      })
    }
    return out
  }, [count])

  useFrame((state) => {
    const m = mesh.current
    if (!m) return
    const t = state.clock.elapsedTime
    m.rotation.y = t * 0.16
    for (let i = 0; i < points.length; i++) {
      const pt = points[i]
      // A small per-point breathe along its own radius, so the shell shimmers
      // instead of turning as one rigid object.
      const k = 1 + Math.sin(t * 0.8 + pt.phase) * 0.035
      dummy.position.copy(pt.p).multiplyScalar(k)
      dummy.scale.setScalar(pt.s)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
  })

  return (
    <group position={[0, 0, -3.2]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[1, 5, 4]} />
        {/* Unlit and bright: the portal's own key light is what fades the room
            up, but points this small read as noise under shading. */}
        <meshBasicMaterial color={accent} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/** The globe, turning. The one interior that is still a downloaded asset, and
 *  its portal face now says so rather than crediting it to the wrong person. */
function GlobeInterior() {
  const group = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (group.current) group.current.rotation.y = state.clock.elapsedTime * 0.1
  })
  return (
    <group ref={group} position={[0, -2, -3]}>
      <Gltf src="/models/earth.glb" />
    </group>
  )
}

/** The avatar that is stood on the island outside.
 *
 *  Cloned from the LIVE avatar rather than loaded again, and that distinction is
 *  the whole reason this function is more than one line.
 *
 *  This used to be `<Gltf src="/models/Avatars/base.glb" />`, which clones
 *  `gltf.scene` from useGLTF's shared cache. But Avatar.tsx mounts that same
 *  asset with `<primitive object={nodes.root} />`, and a <primitive> MOVES the
 *  object -- so the one and only bone hierarchy is re-parented out of
 *  `gltf.scene` and into the island. By the time a portal wakes, the cached
 *  scene has no bones left in it, SkeletonUtils.clone finds nothing to remap,
 *  and the clone comes back with all 28 skeleton slots undefined. three then
 *  dereferences `bone.matrixWorld` while computing that mesh's bounding sphere
 *  during frustum culling, which is the "Cannot read properties of undefined
 *  (reading 'matrixWorld')" this scene was throwing on every visit to a hotspot.
 *
 *  Cloning the live mesh instead gets a hierarchy that actually has its bones,
 *  and costs one 28-bone rig copy the first time the room lights up. Nothing is
 *  downloaded twice -- base.glb is 39MB and loading it under a second cache key
 *  would have been the expensive way to fix this.
 *
 *  The deeper invariant is Avatar.tsx's: a consumer that <primitive>s a cached
 *  GLTF's nodes mutates that cache for everyone else. Fixing it there would be
 *  the more general repair; it is left alone here because it is load-bearing for
 *  the island's own avatar and its animation binding, and this portal is the
 *  only other consumer. */
function AvatarInterior() {
  const group = useRef<THREE.Group>(null)
  const { nodes } = useGLTF("/models/Avatars/base.glb")

  // `nodes.root` is the bone hierarchy; its parent is whatever mounted it,
  // which in practice is the island's <skinnedMesh>. Cloning from there gets
  // mesh and bones together so the skeleton can be remapped.
  const model = useMemo(() => {
    const live = nodes.root?.parent
    if (!live) return null
    const copy = SkeletonUtils.clone(live)
    // Named so the checks can tell this copy apart from the island's original.
    copy.name = "portal-avatar"
    return copy
  }, [nodes])

  useFrame((state) => {
    if (!group.current) return
    // A slow turn plus a breath, so it reads as present rather than as a
    // mannequin on a plinth.
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.5
    group.current.position.y = -1.55 + Math.sin(state.clock.elapsedTime * 0.9) * 0.02
  })

  // Rendering nothing is the right failure here: an empty lit room reads as a
  // room, where a half-bound skeleton crashes the renderer.
  if (!model) return null
  return (
    <group ref={group} position={[0, -1.55, -2.6]} scale={1.35}>
      <primitive object={model} />
    </group>
  )
}

export function PortalInterior({ kind, accent, count }: { kind: PortalInteriorKind; accent?: string; count?: number }) {
  if (kind === "points") return <PointCloudInterior accent={accent} count={count} />
  if (kind === "globe") return <GlobeInterior />
  return <AvatarInterior />
}
