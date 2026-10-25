"use client"

import { Suspense, lazy, useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"
import { SkeletonUtils } from "three-stdlib"
import { useGLTF } from "@/helpers/useGLTF"

import type { PortalInteriorKind } from "@/config/portals"
import { Earth } from "@/components/models/Earth"
import { globeMarkerNodes } from "@/helpers/globeMarker"
import { GLOBE_LON_OFFSET, PLACE_LIST } from "@/config/places"
import { usePortalLive } from "@/helpers/portalLive"
import { useGlobeDrag } from "@/helpers/useGlobeDrag"
import { MiniGameInterior } from "@/components/canvas/MiniGameInterior"
import { Glasses } from "@/components/models/Glasses"

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

// The pool's dimensions now live in config/pool.ts, so FishSchool can read
// them without importing this file back (see that file's header).

/** The pool. Lifted into its own module and lazily loaded -- keeping it in
 *  this file was not actually "shelved", because the import alone dragged the
 *  entire water subsystem and a 0.19MB preload into every island load. See
 *  WaterInterior.tsx. */
const WaterInterior = lazy(() => import("@/components/canvas/WaterInterior"))

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

/** GALLERY: the globe, turning, pinned with the places Erik has been.
 *
 *  This replaces the generated point cloud that used to fill this portal. The
 *  cloud was chosen when the portal was "About" and the brief was "something
 *  abstract that owes nobody a credit"; the portal is a gallery of places
 *  now, and a globe answers that literally.
 *
 *  EVERY PIN'S POSITION IS DERIVED FROM LATITUDE AND LONGITUDE, not nudged
 *  into place by eye, so adding a country is one line in config/places.ts
 *  rather than three guessed numbers. The mapping from lat/lon to the
 *  model's own axes has to be measured against THIS globe though -- a glTF
 *  sphere carries no promise about which way it is wound -- so
 *  GLOBE_LON_OFFSET exists to rotate the whole frame onto it. */

// GLOBE_LON_OFFSET moved to config/places.ts -- it is a fact about where a
// latitude/longitude lands on this mesh, which is what that file is for, and
// useGlobeDrag needs it to point a country at the camera.

/** Radius the pin sits at, in the Earth component's OWN parent space.
 *
 *  Not a multiple of anything, which is what made the first value wrong. The
 *  mesh's vertices sit at radius ~1.0, but Earth.tsx wraps them in an inner
 *  `<group name="Earth" scale={3.586}>`, so a sibling of <Earth /> meets a
 *  globe of radius 3.59 -- and the 1.035 this started as put the marker a
 *  third of the way to the centre, sealed inside an opaque planet. */
const PIN_RADIUS = 3.68

/** How far a pin may be moved to find land, in degrees.
 *
 *  Vietnam measured 2.30 degrees from the nearest land vertex and was
 *  therefore drawn in the South China Sea: this globe is about eleven
 *  thousand triangles, so a narrow country simply is not resolved and its
 *  real coordinates fall in the water. Snapping to the nearest land fixes
 *  that for every country rather than for one.
 *
 *  Capped, because an uncapped snap would silently relocate an island
 *  nation to the nearest continent. 4 degrees is roughly 450km -- enough to
 *  cross this mesh's coastline error, not enough to change which country
 *  you are looking at. Past the cap the pin stays where the config put it. */
const LAND_SNAP_LIMIT_DEG = 4

/** Every land vertex of the globe, as unit directions.
 *
 *  Grass and Sand are the land materials; Water and Ice are not. Built once
 *  per load from the same cached glTF the globe is drawn from. */
function landDirections(nodes: Record<string, THREE.Object3D>) {
  const out: THREE.Vector3[] = []
  for (const node of Object.values(nodes)) {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) continue
    const material = mesh.material as THREE.Material | THREE.Material[]
    const name = Array.isArray(material) ? material[0]?.name : material?.name
    if (name !== "Grass" && name !== "Sand") continue
    const pos = mesh.geometry.getAttribute("position")
    for (let i = 0; i < pos.count; i++) {
      out.push(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize())
    }
  }
  return out
}

/** The nearest land direction to a place, or the place itself if the
 *  nearest land is further off than the cap allows. */
function snapToLand(dir: THREE.Vector3, land: THREE.Vector3[]) {
  if (land.length === 0) return dir
  let best = dir
  let bestDot = -2
  for (const candidate of land) {
    const dot = dir.dot(candidate)
    if (dot > bestDot) {
      bestDot = dot
      best = candidate
    }
  }
  const away = Math.acos(THREE.MathUtils.clamp(bestDot, -1, 1)) * (180 / Math.PI)
  return away <= LAND_SNAP_LIMIT_DEG ? best.clone() : dir
}

function latLonToVector(lat: number, lon: number, radius: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lon + GLOBE_LON_OFFSET)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}

function GlobeInterior({ open }: { open?: boolean }) {
  const spin = useRef<THREE.Group>(null)
  const shell = useRef<THREE.Group>(null)
  // One empty anchor per place. Built once from the config, so adding a
  // country to config/places.ts adds a pin here with nothing else touched.
  // The same cached glTF the globe itself is drawn from -- useGLTF hands
  // back one parse per URL, so this costs a lookup, not a second load.
  const earth = useGLTF("/models/earth.glb")
  const pins = useMemo(() => {
    const land = landDirections(earth.nodes as unknown as Record<string, THREE.Object3D>)
    return PLACE_LIST.map(({ country, place }) => {
      const where = snapToLand(latLonToVector(place.lat, place.lon, 1), land)
      return {
        country,
        position: where.clone().multiplyScalar(PIN_RADIUS),
        node: { current: null as THREE.Group | null },
      }
    })
  }, [earth])

  const drag = useGlobeDrag(!!open)
  const live = usePortalLive()
  const shown = useRef(0)

  useFrame((state, delta) => {
    if (spin.current) spin.current.rotation.y = drag.advance(delta)

    // SIZE WITH THE PORTAL, NOT AGAINST IT.
    //
    // The same globe is seen through a 1.5 x 2.43 window when the portal is
    // shut and across the whole screen when it is open. Tuned for the open
    // view it overflowed the shut one and cropped against the frame, which
    // is half of what "on zoom out it messes up" was.
    const v = live?.current.value ?? 1
    // Damped rather than read raw: `live` is itself a ramp, but easing here
    // keeps the globe from snapping if the ramp is ever stepped.
    easing.damp(shown, "current", v, 0.18, delta)
    if (shell.current) {
      const scale = GLOBE_SCALE_SHUT + (GLOBE_SCALE_OPEN - GLOBE_SCALE_SHUT) * shown.current
      shell.current.scale.setScalar(scale)
    }
  })

  return (
    <group position={[0, 0.32, -2.9]}>
      {/* ITS OWN LIGHT, AND NOT THE ROOM'S.
          
          PortalRoom ramps its key and fill to zero as you leave, and the
          Earth is lit glTF material -- so on the way out the globe became a
          solid black disc against a pale background for the better part of
          two seconds. Measured on a frame-by-frame of the exit. Every other
          interior dodges this by accident: the point cloud is
          meshBasicMaterial with toneMapped off.
          
          These two live inside the globe's own group, at constant intensity,
          so the planet is lit whatever the room is doing. They are local to
          this group and do not touch anything else in the portal. */}
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 2.5, 4]} intensity={2.1} />

      <group ref={shell} scale={GLOBE_SCALE_OPEN}>
        {/* Named so a probe can read the heading -- the globe is inside a
            portal scene and there is no other handle on it. */}
        <group ref={spin} name="globe-spin">
          <Earth />
          {/* Empty anchors. What you see is a DOM pin projected onto each of
              these, because nothing inside a MeshPortalMaterial can be
              hovered -- see helpers/globeMarker.ts. A 3D bead was drawn here
              at first and at PIN_RADIUS 1.035 against a globe of radius 3.59
              it was sealed inside the planet, never visible. */}
          {pins.map((pin) => (
            <group
              key={pin.country}
              position={pin.position}
              ref={(node) => {
                pin.node.current = node
              }}
            />
          ))}
        </group>
      </group>
      <PlacePinsAnchor pins={pins} shown={!!open} />
    </group>
  )
}

/** How big the globe is when the portal is a window in the island, and when
 *  it is the whole screen.
 *
 *  SIZED AGAINST A SCREENSHOT, THREE TIMES. At 0.42 the globe's world radius
 *  was 1.51 against a camera 3.2 away through a 50-degree lens -- an angular
 *  radius of 25 degrees, exactly the half-FOV -- so it filled the window edge
 *  to edge and read as a blue wall. 0.16 fixed that and overshot the other
 *  way at a third of the frame height. 0.26 measured 62.5% of frame height
 *  open, which is a globe you can read countries on.
 *
 *  The shut value is not a guess either: the portal aperture is 1.5 wide
 *  against a screen ~11 wide at that distance, so the globe has to come down
 *  by roughly that ratio to sit inside the frame with margin. */
/** How tall the VR headset stands in its portal, in world units.
 *
 *  The frame is 0.933 x distance tall at the island's 50-degree lens, so at
 *  z -3.4 that is ~3.2 units; 1.25 fills about 40% of frame height. The one
 *  number to change if the headset should read bigger or smaller -- the
 *  model's own size and pivot are measured, not assumed. */
const VR_TARGET_HEIGHT = 1.25

const GLOBE_SCALE_OPEN = 0.26
const GLOBE_SCALE_SHUT = 0.085

/** How far round the globe a pin may turn before it goes out.
 *
 *  A pin rides a rotating sphere, so for half of every turn it is on the FAR
 *  side -- and a projection does not know that, because `project()` is happy
 *  to return a perfectly reasonable screen position for a point behind an
 *  opaque planet. Nor is there a depth test to fall back on: `.globe-pin` is
 *  a `position: fixed` DOM overlay (globals.css), so it is composited over
 *  the whole canvas and this dot product is the entire occlusion mechanism.
 *  Without it a label sits over the Pacific announcing a country on the
 *  other side of the world.
 *
 *  THESE TWO REPORTS CONFLICT, AND THIS ONE WON. The test was here, was
 *  removed to answer "the markers for the Earth disappear, when they should
 *  be permanent" -- IDLE_SPIN (helpers/useGlobeDrag.ts) carries a pin round
 *  the back inside about eight seconds -- and is now back to answer "the
 *  pins can be seen on the other side of the world, when it's behind the
 *  model." Drawing a marker through an opaque planet is the worse of the
 *  two, so occlusion is the rule and the idle spin stays as it is. If you
 *  are about to delete this again, lower IDLE_SPIN instead: the spin is the
 *  thing that makes a pin leave, and a slower globe answers both complaints
 *  at once. The globe is also draggable, so a pin is always one flick away.
 *
 *  Slightly past the limb (0 would be exactly the horizon) so a pin fades at
 *  the edge rather than popping the moment it rounds into view. */
const PIN_FACING_LIMIT = 0.12

/** How much further round a pin travels before it is at full strength. */
const PIN_FADE_BAND = 0.16


/** Puts each place's pin where its country is.
 *
 *  The same technique as HintAnchor and NavigationProjector: project inside
 *  useFrame, write el.style.transform, never re-render React for a position.
 *  Mounted inside the portal's scene because that is where the pins are, but
 *  projecting with the island's camera -- which is the same camera, since
 *  MeshPortalMaterial draws the portal's contents through it. */
function PlacePinsAnchor({
  pins,
  shown,
}: {
  pins: { country: string; node: { current: THREE.Group | null } }[]
  shown: boolean
}) {
  const world = useMemo(() => new THREE.Vector3(), [])
  const centre = useMemo(() => new THREE.Vector3(), [])
  const outward = useMemo(() => new THREE.Vector3(), [])
  const toCamera = useMemo(() => new THREE.Vector3(), [])
  const centreNdc = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    for (const pin of pins) {
      const el = globeMarkerNodes.get(pin.country)
      if (!el) continue
      const node = pin.node.current
      if (!node || !shown) {
        el.style.visibility = "hidden"
        continue
      }

      node.getWorldPosition(world)
      // The globe's centre, so "which way is out" comes from the pin itself
      // rather than from a normal that would have to be kept in step with
      // the rotation by hand.
      node.parent?.getWorldPosition(centre)
      toCamera.copy(state.camera.position).sub(world).normalize()
      outward.copy(world).sub(centre).normalize()
      // FADED ACROSS THE LIMB, NOT SWITCHED.
      //
      // A hard cut at the horizon reads as a pin blinking on and off beside
      // the planet; easing it over the last few degrees is what makes a
      // marker feel stuck to the surface rather than floating near it.
      const facing = outward.dot(toCamera)
      if (facing < PIN_FACING_LIMIT) {
        el.style.visibility = "hidden"
        continue
      }
      el.style.opacity = String(
        THREE.MathUtils.clamp((facing - PIN_FACING_LIMIT) / PIN_FADE_BAND, 0, 1),
      )

      const ndc = world.project(state.camera)
      // z > 1 is behind the camera, where project() mirrors through the
      // origin and would park the pin on the opposite side of the frame.
      // The same trap HintAnchor documents.
      if (ndc.z > 1 || Math.abs(ndc.x) > 0.98 || Math.abs(ndc.y) > 0.98) {
        el.style.visibility = "hidden"
        continue
      }

      const px = (ndc.x * 0.5 + 0.5) * state.size.width
      const py = (-ndc.y * 0.5 + 0.5) * state.size.height
      el.style.transform = `translate3d(${px}px, ${py}px, 0)`

      // LEAN THE PIN INTO THE SURFACE -- "like a pin in a cushion".
      //
      // A pin drawn bolt upright beside a sphere reads as floating next to
      // it. A real pin lies along the surface normal, so its tip points at
      // the centre of the planet; on screen that is the direction from the
      // pin toward the globe's projected centre.
      //
      // The drop's tip is at the bottom of its viewBox, i.e. screen (0, +1).
      // A CSS rotate(t) carries (0,1) to (-sin t, cos t), so matching that
      // to the direction d means sin t = -d.x and cos t = d.y.
      centreNdc.copy(centre).project(state.camera)
      const cx = (centreNdc.x * 0.5 + 0.5) * state.size.width
      const cy = (-centreNdc.y * 0.5 + 0.5) * state.size.height
      const dx = cx - px
      const dy = cy - py
      const len = Math.hypot(dx, dy)
      if (len > 0.001) {
        const tilt = (Math.atan2(-dx / len, dy / len) * 180) / Math.PI
        // Only the drop turns. The label stays level, because a country
        // name rotated with the pin is a country name you cannot read.
        el.style.setProperty("--pin-tilt", `${tilt.toFixed(1)}deg`)
      }
      el.style.visibility = "visible"
    }
  })

  return null
}

/** A VR headset on a slow turntable, and a word about what it opens.
 *
 *  This replaced the water simulation. The portal is the way into the thing
 *  this site is actually selling -- a lidar scan you can walk around -- and a
 *  headset is the one object that says so without a caption.
 *
 *  THE CLICK IS NOT HERE. It is the DOM pill in PortalDestination, because a
 *  destination is a link and a link should be focusable, right-clickable and
 *  readable by a screen reader. drei <Text> is none of those. What this says
 *  is only what the thing IS; where it goes is said in HTML.
 */
function VrInterior() {
  const spin = useRef<THREE.Group>(null)
  const fit = useRef<THREE.Group>(null)

  /** AUTO-FIT, BECAUSE HAND-TUNED CONSTANTS KEPT GOING STALE.
   *
   *  This model has been swapped three times, and each one arrived with a
   *  different natural size and a different pivot. The current one is a
   *  Sketchfab export whose geometry sits **3.95 units off its own origin**
   *  in X -- so a hand-set `scale`/`position` pair put it off the right edge
   *  of the frame while every "is it in the scene?" check passed.
   *
   *  So measure instead. Box3.setFromObject after the glTF has resolved,
   *  then scale to a target height and translate the measured centre to the
   *  origin. The next model needs no numbers changed.
   *
   *  A LAYOUT effect: the transform must be right before the first paint, or
   *  the headset is visibly wrong for a frame. `Glasses` suspends on its own
   *  load, so by the time this runs the geometry is real -- the `isEmpty`
   *  guard covers the case where it is not. */
  useLayoutEffect(() => {
    const group = fit.current
    if (!group) return
    group.position.set(0, 0, 0)
    group.scale.setScalar(1)
    const box = new THREE.Box3().setFromObject(group)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    // At 50 degrees vertical the frame is 0.933 x distance tall, so ~3.2
    // units at the z below. Filling ~40% of it leaves the lower third to the
    // DOM caption and the upper edge clear.
    const scale = VR_TARGET_HEIGHT / Math.max(size.y, 1e-6)
    group.scale.setScalar(scale)
    group.position.copy(centre).multiplyScalar(-scale)
  }, [])

  useFrame((_state, delta) => {
    // Slow, and only a turntable. The object has no "front" worth hunting
    // for and a faster spin reads as a product render.
    if (spin.current) spin.current.rotation.y += delta * 0.35
  })

  return (
    <group position={[0, 0.1, -3.4]}>
      {/* Its own rig, for the reason the globe states below: the portal
          room's light is a mood, not a key. This model is UNTEXTURED --
          material colours only (Blanco / Cristal / Negro) -- so the lights
          are the whole of how it reads. */}
      <ambientLight intensity={1.15} />
      <directionalLight position={[2.5, 3, 4]} intensity={2.2} />
      <directionalLight position={[-3, 1, -2]} intensity={0.9} color="#9fd0ff" />

      <group ref={spin}>
        <group ref={fit}>
          <Glasses />
        </group>
      </group>

      {/* NO IN-SCENE LABEL. There was one -- drei <Text> under the headset --
          and it was wrong twice over: gated on `open`, so it appeared only
          when the DOM caption behind it already said the same thing, and at
          this framing the two landed on top of each other. A destination
          belongs in HTML anyway, where it is focusable and screen-readable;
          the copy that varies with headset support lives in
          PortalDestination's `scan` branch. */}
    </group>
  )
}

export function PortalInterior({ kind, accent, count, open }: { kind: PortalInteriorKind; accent?: string; count?: number; open?: boolean }) {
  if (kind === "globe") return <GlobeInterior open={open} />
  if (kind === "minigame") return <MiniGameInterior />
  if (kind === "points") return <PointCloudInterior accent={accent} count={count} />
  if (kind === "water") {
    return (
      <Suspense fallback={null}>
        <WaterInterior open={open} />
      </Suspense>
    )
  }
  if (kind === "vr") return <VrInterior />
  return <AvatarInterior />
}
