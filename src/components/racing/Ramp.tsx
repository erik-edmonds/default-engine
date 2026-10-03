"use client"

import { memo, useRef } from "react"
import type * as THREE from "three"
import { useTrimesh } from "@react-three/cannon"
import { useLoader } from "@react-three/fiber"
import { GLTFLoader } from "three-stdlib"

import { RACING_ASSET } from "./paths"

function RampModel() {
  const result = useLoader(GLTFLoader, RACING_ASSET("models/ramp.glb"))
  const geometry = (result.scene.children[0] as THREE.Mesh).geometry
  const vertices = geometry.attributes.position.array as Float32Array
  const indices = geometry.index!.array as Uint16Array

  const [ref] = useTrimesh(
    () => ({ args: [vertices, indices], mass: 0, type: "Static" }),
    useRef<THREE.Mesh>(null),
  )
  return <primitive object={result.scene} ref={ref} />
}

export const Ramp = memo(RampModel)
