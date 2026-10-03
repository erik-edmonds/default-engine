"use client"

import { memo, useMemo, useRef } from "react"
import type * as THREE from "three"
import { useCylinder } from "@react-three/cannon"
import { useLoader } from "@react-three/fiber"
import { GLTFLoader } from "three-stdlib"

import { RACING_ASSET } from "./paths"

const RADIUS = 0.35
const HEIGHT = 0.7

/** The stack of barrels, as the original laid it out: a 4x4 grid off to the
 *  side of the track, each one a touch higher than the last so they settle
 *  into a heap rather than a lattice. */
function Barrels() {
  const positions: [number, number, number][] = []
  let y = 1
  for (let x = 15; x <= 18; x++) {
    for (let z = -6; z >= -9; z--) {
      positions.push([x, y, z])
      y += 0.1
    }
  }
  return (
    <>
      {positions.map((position, i) => (
        <Barrel key={i} position={position} />
      ))}
    </>
  )
}

function Barrel({ position }: { position: [number, number, number] }) {
  const gltf = useLoader(GLTFLoader, RACING_ASSET("models/barrel.glb"))
  // One clone per barrel: useLoader caches a single scene per URL, and
  // sixteen barrels sharing one Object3D would all be the same object in
  // the graph -- only the last would appear.
  const model = useMemo(() => gltf.scene.clone(), [gltf])

  const [ref] = useCylinder(
    () => ({ allowSleep: false, args: [RADIUS, RADIUS, HEIGHT, 16], mass: 10, position }),
    useRef<THREE.Group>(null),
  )

  return (
    <group ref={ref}>
      <primitive object={model} />
    </group>
  )
}

export default memo(Barrels)
