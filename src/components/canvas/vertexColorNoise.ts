import * as THREE from "three"

// Same hash/noise formula already used in Aurora.tsx's GLSL -- ported to JS
// here rather than invented fresh, to stay consistent with this codebase's
// "analytic noise, no texture asset" convention.
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}

export function noise2D(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, ux), THREE.MathUtils.lerp(c, d, ux), uy)
}

// Idempotent -- guarded so re-running (StrictMode double-invoke, HMR) is a
// no-op instead of re-painting (or double-allocating) on every render.
function paintVertexNoise(geometry: THREE.BufferGeometry, colorAt: (local: THREE.Vector3) => THREE.Color) {
  if (geometry.attributes.color) return
  const pos = geometry.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const c = colorAt(v)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
}

// Darker/cooler near the water's edge (wetness), plus a subtle noise grain
// everywhere. Colors are multipliers against the mesh's existing base color
// (three's color_fragment chunk does diffuseColor.rgb *= vColor.rgb), so
// these stay close to 1.0 rather than being authored as absolute colors.
//
// Transform note: this mesh's geometry node is detached from the mounted
// scene graph (see MergedScene.tsx), so its own matrixWorld doesn't reflect
// the outer <Merged> instance's scale/position/rotation. That outer
// transform is uniform-scale + Y-axis-rotation + a Y-only translation, so
// local-space XZ-distance-from-origin is already proportional to
// world-space distance -- no need to chase the live world matrix here.
export function paintSandWetness(geometry: THREE.BufferGeometry) {
  if (geometry.attributes.color) return
  const pos = geometry.attributes.position
  let maxDist = 0
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    maxDist = Math.max(maxDist, Math.hypot(v.x, v.z))
  }
  // Widened and darkened considerably from the first pass -- at the
  // original band width/tint this read as barely-there once lit (a subtle
  // multiplier easily washed out by the scene's own lighting), not as a
  // clearly "wet, darker sand" band the way the ask wanted.
  const WET_BAND = maxDist * 0.22
  const DRY = new THREE.Color(1, 1, 1)
  const WET_TINT = new THREE.Color(0.22, 0.26, 0.34)
  paintVertexNoise(geometry, (local) => {
    const dist = Math.hypot(local.x, local.z)
    // Compressed into the outer 60% of the band so it commits to fully wet
    // well before the actual shoreline instead of only approaching full
    // darkness right at the very edge -- reads as a clear band, not a
    // barely-perceptible gradient.
    const wetT = THREE.MathUtils.smoothstep(dist, maxDist - WET_BAND, maxDist - WET_BAND * 0.4)
    const grain = 0.85 + 0.3 * noise2D(local.x * 0.35, local.z * 0.35)
    return DRY.clone().lerp(WET_TINT, wetT).multiplyScalar(grain)
  })
}

const ROCK_BASE = new THREE.Color(0.031, 0.118, 0.170) // matches materials.Rock's actual baseColorFactor
const ROCK_LIGHT = new THREE.Color(0.14, 0.22, 0.26)

// `seed` offsets the noise field per rock mesh so the 9 boulders don't all
// end up with an identical-looking pattern despite sharing one material.
export function paintRockVariation(geometry: THREE.BufferGeometry, seed: number) {
  if (geometry.attributes.color) return
  paintVertexNoise(geometry, (local) => {
    const n = noise2D(local.x * 3.5 + seed, local.z * 3.5 + seed * 1.7)
    return ROCK_BASE.clone().lerp(ROCK_LIGHT, n * 0.6) // "slight" per the ask -- keep this low
  })
}
