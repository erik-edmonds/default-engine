import * as THREE from 'three'
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instances, Instance, useGLTF } from '@react-three/drei'
import { useSetAtom } from 'jotai'
import { rainRequest, thunder } from '@/helpers/StateProvider'
import { MAGNETIC_SNAP_RADIUS, registerMagneticTarget, type MagneticTarget } from '@/helpers/cursor'
import { registerHintCloud, unregisterHintCloud } from '@/helpers/hints'

// Just the cloud instancer now. The rain lifecycle (hold/fade timers, the
// `raining` atom, the rain Howl) used to live here, but Scene.tsx mounts two
// of these groups and each kept its own private copy of that state while all
// of them wrote one shared atom -- see RainController.tsx for the bugs that
// caused and why there is now exactly one owner. Clicking a cloud is a
// request; it isn't the thing that runs the storm.
export function Clouds({ data, range }) {
  const { nodes, materials } = useGLTF('/models/cloud.glb')

  return (
    <Instances range={range} material={materials.CloudMaterial} geometry={nodes.Cloud_0.geometry}>
      {data.map((props, i) => (
        // `range` caps how many instances actually draw, out of a data array
        // that's 1000 long -- so only the drawn prefix is offered to the hint
        // system. Pointing a hint at a cloud nobody can see would be worse
        // than showing no hint at all.
        <Cloud key={i} hintTarget={i < range} {...props} />
      ))}
    </Instances>
  )
}

/** Clouds sit far back, so their on-screen size is small; a slightly tighter
 *  field than the island props keeps them from competing with the hotspot
 *  rings that often share the sky with them. */
const CLOUD_MAGNETIC_STRENGTH = 1
const CLOUD_MAGNETIC_RADIUS = 140

function Cloud({ random, atom, color = new THREE.Color(), hintTarget = false, ...props }) {
  const ref = useRef()
  const [hovered, setHover] = useState(false)
  const setRainRequest = useSetAtom(rainRequest)
  const setThunder = useSetAtom(thunder)

  // Offer this instance to the hint system. Registering the <Instance> rather
  // than the wrapping group is deliberate: the bob below is written onto the
  // instance's own position, so its world position is the cloud's actual
  // on-screen position, bob included. Cloud placement is randomised at module
  // load (config/store.ts), so there's no fixed point a hint could aim at --
  // it has to pick from whatever is live.
  useEffect(() => {
    if (!hintTarget) return
    // Cast because this file's refs are untyped throughout; drei's <Instance>
    // resolves to a PositionMesh, which is a real Object3D in the graph.
    const node = ref.current as THREE.Object3D | undefined
    if (!node) return
    registerHintCloud(node)
    return () => unregisterHintCloud(node)
  }, [hintTarget])

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

  useFrame((state) => {
    const t = state.clock.getElapsedTime() + random * 10000
    ref.current.position.y = Math.sin(t / 1.5) / 2
    ref.current.scale.x = ref.current.scale.y = ref.current.scale.z = THREE.MathUtils.lerp(ref.current.scale.z, hovered ? 1.4 : 1, 0.1)
    ref.current.color.lerp(color.set(hovered ? '#b3b2b2' : 'white'), hovered ? 1 : 0.1)
  })
  return (
    <group {...props}>
      <Instance
        ref={ref}
        onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
        onPointerOut={(e) => setHover(false)}
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
