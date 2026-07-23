"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useGLTF, useProgress, Center } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"

import { FLAT_EARTH_POSITION, EARTH_WORLD_SCALE, ISLAND_CAMERA_ROTATION } from "./earthIntroPath"

const WIRE_COLOR = "#b5510f"
// Percent-of-progress width of the glowing "scan band" at the reveal
// front -- wide enough to read as a soft wipe, not a hard cutoff.
const EDGE_WIDTH = 6
// How fast the locally-eased progress value chases the real (possibly
// chunky) network progress -- time-based, not frame-count-based, so it
// converges in roughly the same wall-clock time regardless of frame rate.
const EASE_RATE_PER_SECOND = 6
// Extra spin around the model's own up axis (independent of
// ISLAND_CAMERA_ROTATION, which only aligns the *camera's* facing) so the
// point dead-center of frame -- the point the camera dollies through on
// Enter -- lands on open ocean rather than a landmass.
const FACING_ROTATION_Y = 2.6

// A continuous per-fragment wipe, not a discard-per-triangle: every
// fragment's local Y (object-space, pre-rotation) decides how "revealed" it
// is. Below the wipe line: the mesh's own real material color, unlit and
// opaque. Right at the line: a bright glow pushed above 1.0 so it trips the
// scene's existing Bloom pass (see page.tsx's `luminanceThreshold={1}`).
// Above the line: a translucent, scanline-modulated "hologram" tint in
// WIRE_COLOR -- the mesh hasn't materialized there yet.
//
// Note there's no fade/opacity uniform here: this Earth is never faded out.
// It stays fully opaque the whole time it's on screen -- see page.tsx's
// handleEnterClick, which unmounts it outright (masked by a quick flash)
// the instant the camera's dolly physically reaches its surface, instead
// of dissolving it away as a separate effect.
const vertexShader = /* glsl */ `
  uniform float uMinY;
  uniform float uMaxY;
  varying float vNormalizedY;
  void main() {
    vNormalizedY = clamp((position.y - uMinY) / (uMaxY - uMinY), 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uBaseColor;
  uniform vec3 uWireColor;
  uniform float uProgress;
  uniform float uEdge;
  uniform float uTime;
  varying float vNormalizedY;

  void main() {
    float revealAt = vNormalizedY * 100.0;
    float delta = uProgress - revealAt;

    if (delta > uEdge) {
      gl_FragColor = vec4(uBaseColor, 1.0);
      return;
    }

    if (delta > 0.0) {
      float t = delta / uEdge;
      vec3 glow = uWireColor * (1.0 + (1.0 - t) * 2.5);
      gl_FragColor = vec4(mix(glow, uBaseColor, t), 1.0);
      return;
    }

    float scan = 0.5 + 0.5 * sin(vNormalizedY * 220.0 - uTime * 2.0);
    vec3 holo = uWireColor * (0.8 + 1.6 * scan);
    gl_FragColor = vec4(holo, 0.35 + 0.45 * scan);
  }
`

// The 4 material-grouped primitives three.js's GLTFLoader splits the
// model's single "Icosphere.001" mesh into -- see the file-structure
// inspection this was built against (public/models/earth.glb: one mesh,
// 4 primitives, node names paired with their real material below).
const PRIMITIVES = [
  { node: "Icosphere001", material: "Water" },
  { node: "Icosphere001_1", material: "Grass" },
  { node: "Icosphere001_2", material: "Ice" },
  { node: "Icosphere001_3", material: "Sand" },
]

export function EarthIntro() {
  const { nodes, materials } = useGLTF("/models/earth.glb") as unknown as {
    nodes: Record<string, THREE.Mesh>
    materials: Record<string, THREE.MeshStandardMaterial>
  }

  // Read-only source data (geometry + each primitive's real base color),
  // never mutated -- an earlier version of this file swapped `.material`
  // directly on drei's cached nodes as a side effect of a useMemo factory.
  // React StrictMode double-invokes useMemo factories in dev specifically
  // to catch exactly that: the second invocation read back the
  // already-replaced ShaderMaterial (no `.color`) and crashed. Building
  // fresh <mesh> elements from untouched source data sidesteps it
  // entirely, regardless of how many times the factory below re-runs.
  const meshDefs = useMemo(
    () => PRIMITIVES.map(({ node, material }) => ({ geometry: nodes[node].geometry, color: materials[material].color })),
    [nodes, materials],
  )

  const shaderMeshesRef = useRef<{ geometry: THREE.BufferGeometry; material: THREE.ShaderMaterial }[]>([])
  const shaderMeshes = useMemo(() => {
    // Shared bounding box across *all* meshes (not each mesh's own), so
    // Water/Grass/Ice/Sand all reveal against the same bottom-to-top
    // sweep instead of each material finishing its own local patch at a
    // different rate.
    const box = new THREE.Box3()
    for (const { geometry } of meshDefs) {
      geometry.computeBoundingBox()
      box.union(geometry.boundingBox!)
    }

    return meshDefs.map(({ geometry, color }) => ({
      geometry,
      material: new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: true,
        uniforms: {
          uMinY: { value: box.min.y },
          uMaxY: { value: box.max.y },
          uBaseColor: { value: color.clone() },
          uWireColor: { value: new THREE.Color(WIRE_COLOR) },
          uProgress: { value: 0 },
          uEdge: { value: EDGE_WIDTH },
          uTime: { value: 0 },
        },
      }),
    }))
  }, [meshDefs])
  shaderMeshesRef.current = shaderMeshes

  const displayProgressRef = useRef(0)

  useFrame((state, delta) => {
    const target = useProgress.getState().progress
    const alpha = 1 - Math.exp(-EASE_RATE_PER_SECOND * delta)
    const next = displayProgressRef.current + (target - displayProgressRef.current) * alpha
    displayProgressRef.current = Math.abs(target - next) < 0.15 ? target : next

    for (const { material } of shaderMeshesRef.current) {
      material.uniforms.uProgress.value = displayProgressRef.current
      material.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <group position={FLAT_EARTH_POSITION} rotation={ISLAND_CAMERA_ROTATION} scale={EARTH_WORLD_SCALE}>
      <Center>
        {/* nodes.Earth carries the model's own baked scale (the "Earth"
            group's transform in the source file) -- reapplied here since
            building fresh <mesh> elements from geometry alone drops it. */}
        <group rotation={[0, FACING_ROTATION_Y, 0]} scale={nodes.Earth.scale}>
          {shaderMeshes.map(({ geometry, material }, i) => (
            <mesh key={i} geometry={geometry} material={material} />
          ))}
        </group>
      </Center>
    </group>
  )
}

useGLTF.preload("/models/earth.glb")
