import * as THREE from 'three'
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Instances, Instance, useGLTF } from '@react-three/drei'
import { useSetAtom } from 'jotai'
import { rainRequest, thunder } from '@/helpers/StateProvider'

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
        <Cloud key={i} {...props} />
      ))}
    </Instances>
  )
}

function Cloud({ random, atom, color = new THREE.Color(), ...props }) {
  const ref = useRef()
  const [hovered, setHover] = useState(false)
  const setRainRequest = useSetAtom(rainRequest)
  const setThunder = useSetAtom(thunder)

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
