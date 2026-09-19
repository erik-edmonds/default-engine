import type { CloudDatum } from '@/config/store'
import * as THREE from 'three'
import { createContext, useContext, useEffect, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instances, Instance } from '@react-three/drei'
import { useGLTF } from '@/helpers/useGLTF'
import { useSetAtom } from 'jotai'
import { rainRequest, thunder } from '@/helpers/StateProvider'
import { MAGNETIC_SNAP_RADIUS, registerMagneticTarget, type MagneticTarget } from '@/helpers/cursor'
import { registerHintCloud, unregisterHintCloud } from '@/helpers/hints'

/** What the group's single frame loop needs to know about one cloud. Hover
 *  lives here rather than in React state: the only thing that reads it is the
 *  animation below, so putting it in state bought a re-render per pointer
 *  crossing and changed nothing on screen that this loop was not already
 *  going to do. */
interface CloudEntry {
  node: THREE.Object3D & { color: THREE.Color }
  random: number
  hovered: boolean
}
/** The live entries, shared as the REF rather than the array. A ref is the
 *  sanctioned mutable container: handing the array itself down makes every
 *  write to a cloud's transform a mutation of a value that was passed to a
 *  hook, which react-hooks/immutability rightly rejects. */
const CloudGroup = createContext<RefObject<CloudEntry[]> | null>(null)

// Just the cloud instancer now. The rain lifecycle (hold/fade timers, the
// `raining` atom, the rain Howl) used to live here, but Scene.tsx mounts two
// of these groups and each kept its own private copy of that state while all
// of them wrote one shared atom -- see RainController.tsx for the bugs that
// caused and why there is now exactly one owner. Clicking a cloud is a
// request; it isn't the thing that runs the storm.
export function Clouds({ data, limit }: { data: CloudDatum[]; limit: number }) {
  const { nodes, materials } = useGLTF('/models/cloud.glb')
  const entries = useRef<CloudEntry[]>([])

  // ONE frame callback for the whole group, not one per cloud.
  //
  // This is what lets the sky be dense enough to actually see. The counts here
  // used to be held down to 20 because every <Cloud> subscribed its own
  // useFrame, so a sky that is guaranteed to be in shot -- which needs roughly
  // 46 of them around two rings -- would have meant 46 callbacks a frame for
  // three lines of arithmetic each. Hoisting the loop makes the count a
  // question of what looks right rather than what the frame budget allows.
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    for (const entry of entries.current) {
      const node = entry.node
      if (!node) continue
      // The bob, offset per cloud so they don't rise and fall in step.
      node.position.y = Math.sin((t + entry.random * 10000) / 1.5) / 2
      const scale = THREE.MathUtils.lerp(node.scale.z, entry.hovered ? 1.4 : 1, 0.1)
      node.scale.setScalar(scale)
      node.color.lerp(HOVER_COLOR.set(entry.hovered ? '#b3b2b2' : 'white'), entry.hovered ? 1 : 0.1)
    }
  })

  return (
    // frustumCulled={false}, and it is the entire reason the clouds vanished on
    // a phone.
    //
    // three computes an InstancedMesh's boundingSphere ONCE and caches it
    // forever -- there is no invalidation when instance matrices change. drei's
    // <Instances> writes its matrices from a useFrame, which runs after the
    // first cull, and this group starts life with an empty data array while the
    // island's bounds are still being measured (see Scene.tsx). So the sphere
    // that decides visibility was computed at count 0: pinned to the group's
    // origin with a radius of about 2.8, while the clouds themselves reach 40
    // units away.
    //
    // That sphere survives a cull only while the horizontal half-fov exceeds
    // ~21.8 degrees, i.e. an aspect ratio above 0.859. A 1280x800 window passes
    // it; a 400x860 phone does not -- and because one sphere covers the whole
    // instanced mesh, every cloud in the group disappears at once. Which is
    // exactly the report: fine on desktop, none at all on mobile.
    //
    // Disabling the cull is the right fix rather than recomputing the sphere:
    // there are 42 instances in two draw calls, so there is nothing worth
    // culling, and a stale bounding volume that silently deletes the sky is a
    // far worse failure than drawing it when it happens to be off screen.
    // `limit` MUST be a constant, never data.length.
    //
    // drei allocates the instance matrix and colour buffers in a useState
    // initialiser -- once, from the first value of `limit` it ever sees, and
    // never again. This group's data starts empty while the island is measured
    // (see Scene.tsx), so limit={data.length} allocated a ZERO-LENGTH
    // Float32Array and kept it. Once the clouds arrived, drei set the mesh's
    // instance count to 42 while the attribute backing it still had room for
    // none, so every frame issued an instanced draw reading past the end of an
    // empty buffer. That is a WebGL error per draw per frame, and it is what
    // made the whole scene crawl.
    //
    // The ring counts are module constants, so passing one costs nothing and
    // cannot start at zero. `range` is still data.length: that is the number
    // actually drawn, and it is allowed to change.
    <Instances
      limit={limit}
      range={data.length}
      frustumCulled={false}
      material={materials.CloudMaterial}
      geometry={nodes.Cloud_0.geometry}
    >
      <CloudGroup.Provider value={entries}>
        {data.map((props, i) => (
          <Cloud key={i} {...props} />
        ))}
      </CloudGroup.Provider>
    </Instances>
  )
}

/** Scratch for the hover tint. Module-level because the frame loop above runs
 *  for every cloud in the group and allocating a Color per cloud per frame is
 *  exactly the kind of garbage this scene cannot afford. */
const HOVER_COLOR = new THREE.Color()

/** Clouds sit far back, so their on-screen size is small; a slightly tighter
 *  field than the island props keeps them from competing with the hotspot
 *  rings that often share the sky with them. */
const CLOUD_MAGNETIC_STRENGTH = 1
const CLOUD_MAGNETIC_RADIUS = 140

/** drei's <Instance> proxy: an Object3D that also carries a per-instance
 *  colour, which is not on Object3D itself. */
type InstanceRef = THREE.Object3D & { color: THREE.Color }

function Cloud({ random, ...props }: CloudDatum) {
  const ref = useRef<InstanceRef>(null)
  const entries = useContext(CloudGroup)
  const setRainRequest = useSetAtom(rainRequest)
  const setThunder = useSetAtom(thunder)

  // Join the group's frame loop. The entry object is the only channel between
  // this component and that loop, which is why hover is written onto it
  // directly rather than held in state.
  const entry = useRef<CloudEntry>({ node: null as unknown as InstanceRef, random, hovered: false })
  useEffect(() => {
    const node = ref.current
    if (!node || !entries) return
    const self = entry.current
    self.node = node
    self.random = random
    entries.current.push(self)
    return () => {
      const list = entries.current
      const i = list.indexOf(self)
      if (i !== -1) list.splice(i, 1)
    }
  }, [entries, random])

  // Offer this instance to the hint system. Registering the <Instance> rather
  // than the wrapping group is deliberate: the bob is written onto the
  // instance's own position, so its world position is the cloud's actual
  // on-screen position, bob included. Cloud placement is randomised per visit
  // (config/store.ts), so there's no fixed point a hint could aim at -- it has
  // to pick from whatever is live.
  //
  // Every cloud is offered now. There used to be a `hintTarget` prop gating
  // this on `i < range`, because the data arrays were 1000 long and only the
  // first few drew; the arrays are now exactly the sky, so every entry is a
  // cloud someone can actually see and point at.
  useEffect(() => {
    // Cast because this file's refs are untyped throughout; drei's <Instance>
    // resolves to a PositionMesh, which is a real Object3D in the graph.
    const node = ref.current as THREE.Object3D | undefined
    if (!node) return
    registerHintCloud(node)
    return () => unregisterHintCloud(node)
  }, [])

  // A cloud is hover-highlighted and click-to-rain, so it is exactly the kind
  // of thing the cursor should be drawn to -- but it was the one interactive
  // object in the scene with no magnet at all. Registered on the <Instance>
  // for the same reason the hint system is: the bob is written onto the
  // instance's own position, so that is where the cloud actually is on screen.
  const rainRef = useRef({ setRainRequest, setThunder })
  rainRef.current = { setRainRequest, setThunder }
  useEffect(() => {
    const node = ref.current as THREE.Object3D | undefined
    if (!node) return
    const target: MagneticTarget = {
      object: node,
      type: 'interactive',
      strength: CLOUD_MAGNETIC_STRENGTH,
      radius: CLOUD_MAGNETIC_RADIUS,
      snapRadius: MAGNETIC_SNAP_RADIUS,
      isEnabled: () => true,
      activate: () => {
        rainRef.current.setRainRequest((c) => c + 1)
        rainRef.current.setThunder((c) => c + 1)
      },
    }
    return registerMagneticTarget(target)
  }, [])

  return (
    <group {...props}>
      <Instance
        ref={ref}
        onPointerOver={(e) => (e.stopPropagation(), (entry.current.hovered = true))}
        onPointerOut={() => (entry.current.hovered = false)}
        onClick={(e) => {
          // Defer to a hotspot ring under the same pointer. The rings render
          // over everything (depthTest false), so a click that lands on one is
          // aimed at it -- but r3f dispatches handlers strictly nearest-first,
          // and a cloud in front of a ring would otherwise fire too. Starting
          // a storm the user didn't ask for is bad enough on its own; it also
          // used to derail the hotspot flight, because the thunder it triggers
          // shakes the camera mid-transition (see Thunder.tsx).
          if (e.intersections.some((hit) => hit.object.userData?.hotspot)) return
          setRainRequest((c) => c + 1)
          setThunder((c) => c + 1)
        }}/>
    </group>
  )
}
