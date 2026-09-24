"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"
import { SkeletonUtils } from "three-stdlib"
import { useGLTF } from "@/helpers/useGLTF"

import { WaterScene } from "@/components/canvas/water/WaterScene"
import { useScrollOffset } from "@/helpers/useScrollOffset"
import { CARD_GAP, CARD_TOP, PROJECTS } from "@/config/projects"
import type { PortalInteriorKind } from "@/config/portals"

// What you see through the glass.
//
// All three portals used to hold /models/earth.glb at scales 8, 1 and 2 -- one
// model three times, which is why the arrival read as decoration rather than as
// a destination. These are three genuinely different things, each one saying
// something about where its portal goes.
//
// Models IS the work now: the live water with the four project cards hanging
// down it, scrollable, which is the whole of what /portfolio used to be. The
// point cloud moved across to About, taking the globe's place. earth.glb is out
// of the project entirely; nothing here is a downloaded prop except the avatar,
// which is the scene's own.

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

/** How deep the pool runs below the surface: far enough to hold the whole card
 *  column with clearance under the last one. */
const POOL_DEPTH = -CARD_TOP + (PROJECTS.length - 1) * CARD_GAP + 2.6

/** Half-extents of the pool box.
 *
 *  Both are larger than they look like they need to be, and the reason is the
 *  same for each: the camera sits INSIDE this box and cannot move, so the box
 *  has to reach past whatever the camera can see.
 *
 *  Length has a hard floor. The camera parks 0.3 in front of the portal plane
 *  and the group sits at z -3, so the pool's near wall must land behind z +0.3
 *  or the camera is outside the box looking at its tiled exterior -- which is
 *  exactly what the first attempt at "move it further back" produced: a dark
 *  frame with a sliver of pool wall in one corner. 4.5 puts the near wall at
 *  +1.5, comfortably behind the camera, and the far wall at -7.5.
 *
 *  Width is set by the far wall. At 50 degrees of FOV the camera sees 11.6
 *  units across at that distance, so anything narrower than that shows the
 *  world past the pool's sides. */
const POOL_HALF_WIDTH = 6
const POOL_HALF_LENGTH = 4.5

/** How far the column can travel before the floor is in shot. */
const SCROLL_RANGE = POOL_DEPTH - 3

/** The work, underwater. The whole of it -- there is nowhere else to go.
 *
 *  The real WaterScene, the same simulation that used to fill /portfolio, as an
 *  empty pool you scroll down through. The project cards that hung in it have
 *  been taken out: each was a portal inside this portal, and the items are
 *  going into the water directly instead. This is still why the portal prints
 *  no title, no blurb and no "View the work" button -- you are inside the work,
 *  and the page that button pointed at was a second copy of it and is retired.
 *
 *  Sized for the aperture, which is the only reason WaterScene takes dimensions
 *  at all -- its own defaults build a pool as wide as the viewport around a
 *  five-stop card column, and through a 1.5 x 2.43 window you would see one
 *  arbitrary band of that.
 *
 *  `quality="portal"` drops the caustics from 1024 square to 256 and caps the
 *  reflection targets. Those passes run every frame the room is awake, and the
 *  full-screen sizes bought nothing at this scale. */
function WaterInterior({ open = false }: { open?: boolean }) {
  const column = useRef<THREE.Group>(null)
  const displayY = useRef(0)

  // Scroll descends the pool. The camera CANNOT descend -- it is parked 0.3 in
  // front of the portal plane, and the interior is a separate scene rendered
  // with that same camera -- so the pool rises past the window instead. The
  // effect through the glass is identical and it needs no camera authority,
  // which the island page would fight for anyway.
  //
  // The range is NEGATIVE and the sign flips on the way out, which keeps the
  // hook's convention identical to Rig's: there, scrolling down drives the
  // offset negative and the camera descends with it. Here the same negative
  // offset has to raise the column, so it is negated at the one place it is
  // applied. Getting this backwards clamps instantly at the top and the pool
  // simply refuses to move, which is how the first version behaved.
  const { target, reset } = useScrollOffset({ min: -SCROLL_RANGE, max: 0, speed: 0.004, enabled: open })
  useEffect(() => { if (!open) reset() }, [open, reset])

  useFrame((_state, delta) => {
    if (!column.current) return
    easing.damp(displayY, "current", target.current, 0.25, delta)
    column.current.position.y = -displayY.current
  })

  return (
    // Further back than the first version's -2.4, so the window looks into the
    // volume rather than pressing against the near wall -- but not so far that
    // the camera leaves the box. See POOL_HALF_LENGTH.
    <group position={[0, 1.15, -3]}>
      <group ref={column}>
        <WaterScene
          poolWidth={POOL_HALF_WIDTH}
          poolLength={POOL_HALF_LENGTH}
          poolFloorDepth={POOL_DEPTH}
          waterYOffset={0.9}
          quality="portal"
          // Still water until you are actually in it. The room wakes as soon as
          // you park at the viewpoint, and simulating from there cost 38% of the
          // frame for a window you have not stepped through -- see `active`.
          active={open}
        />
        {/* The four project cards hung here, each one a MeshPortalMaterial with
            a point cloud inside it -- a portal inside a portal, four extra
            render targets drawn every frame inside another portal's own render.
            They are gone; the items go straight into the water instead.

            The column, its depth and its scroll all stay. CARD_TOP, CARD_GAP
            and CARD_SCALE in config/projects.ts are the geometry whatever goes
            in next will hang on, which is why that file is still here. */}
      </group>
    </group>
  )
}

/** The avatar that is stood on the island outside.
 *
 *  Its own clone of the cached scene, which is now all this needs to be.
 *
 *  This was briefly cloning from the LIVE island avatar instead, because
 *  Avatar.tsx used to `<primitive>` the bone hierarchy straight out of
 *  useGLTF's shared cache -- moving it, so the cached scene had no bones left
 *  and a clone of it came back with all 28 skeleton slots undefined. three then
 *  dereferenced `bone.matrixWorld` computing this mesh's bounding sphere, which
 *  is the crash this portal used to throw on every visit.
 *
 *  Avatar.tsx clones for itself now, so the cache stays intact and this can go
 *  back to the obvious thing. SkeletonUtils.clone rather than Object3D.clone:
 *  a plain clone copies the mesh without remapping its skeleton to the copied
 *  bones, which is how you get right back to undefined bones.
 *
 *  Costs nothing to download -- base.glb is already loaded for the island. */
function AvatarInterior() {
  const group = useRef<THREE.Group>(null)
  const { scene } = useGLTF("/models/Avatars/base.glb")
  const model = useMemo(() => {
    const copy = SkeletonUtils.clone(scene)
    // Named so the checks can tell this copy apart from the island's original.
    copy.name = "portal-avatar"
    return copy
  }, [scene])

  useFrame((state) => {
    if (!group.current) return
    // A slow turn plus a breath, so it reads as present rather than as a
    // mannequin on a plinth.
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.5
    group.current.position.y = -1.55 + Math.sin(state.clock.elapsedTime * 0.9) * 0.02
  })

  return (
    <group ref={group} position={[0, -1.55, -2.6]} scale={1.35}>
      <primitive object={model} />
    </group>
  )
}

export function PortalInterior({ kind, accent, count, open }: { kind: PortalInteriorKind; accent?: string; count?: number; open?: boolean }) {
  if (kind === "points") return <PointCloudInterior accent={accent} count={count} />
  if (kind === "water") return <WaterInterior open={open} />
  return <AvatarInterior />
}
