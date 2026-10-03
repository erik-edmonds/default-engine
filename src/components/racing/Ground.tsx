"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useLoader } from "@react-three/fiber"
import { MeshReflectorMaterial } from "@react-three/drei"
import { usePlane } from "@react-three/cannon"

import { RACING_ASSET } from "./paths"

export function Ground() {
  const [alphaMap, aoMap, loadedGrid] = useLoader(THREE.TextureLoader, [
    RACING_ASSET("textures/ground_alpha.png"),
    RACING_ASSET("textures/ground_ao.png"),
    RACING_ASSET("textures/grid.png"),
  ])

  // A CLONE, BECAUSE THE LOADED TEXTURE IS NOT OURS TO EDIT.
  //
  // The original set `anisotropy = 32` straight onto the loaded texture.
  // useLoader caches one Texture per URL, so that writes to an object every
  // other user of grid.png shares -- which is exactly what
  // react-hooks/immutability objects to, and moving the same write into an
  // effect does not make it any less shared. Cloning first gives this mesh
  // a texture of its own to configure, and the clone reuses the same
  // uploaded image rather than decoding it twice.
  const gridMap = useMemo(() => {
    const map = loadedGrid.clone()
    map.anisotropy = 32
    map.needsUpdate = true
    return map
  }, [loadedGrid])

  usePlane(() => ({ type: "Static", rotation: [-Math.PI / 2, 0, 0] }), useRef<THREE.Mesh>(null))

  return (
    <>
      <mesh position={[0, 0, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[50, 50]} />
        <meshBasicMaterial opacity={0.325} alphaMap={gridMap} transparent color="white" />
      </mesh>
      <mesh position={[0, -0.01, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[40, 40]} />
        <MeshReflectorMaterial
          alphaMap={alphaMap}
          aoMap={aoMap}
          transparent
          color={[0.4, 0.3, 0.3]}
          envMapIntensity={0.35}
          metalness={0.05}
          roughness={0.4}
          dithering
          blur={[1024, 512]}
          mixBlur={3}
          mixStrength={30}
          resolution={1024}
          mirror={1}
          minDepthThreshold={0.9}
          maxDepthThreshold={1}
          depthToBlurRatioBias={0.25}
        />
      </mesh>
    </>
  )
}
