import * as THREE from "three"
import { noise2D } from "./vertexColorNoise"

// Wraps noise2D's input coordinates into a fixed period before sampling --
// noise2D's underlying hash has no inherent periodicity, so without this
// the baked texture would show a visible seam every RepeatWrapping tile.
function tileableNoise(x: number, y: number, period: number): number {
  const wrap = (v: number) => ((v % period) + period) % period
  return noise2D(wrap(x), wrap(y))
}

export function createWoodRoughnessTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  const period = 8
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = size / period
      const base = tileableNoise(x / cell, y / cell, period)
      const grain = tileableNoise((x / cell) * 6 + 41, (y / cell) * 6 + 7, period * 6)
      const roughness = THREE.MathUtils.lerp(0.55, 0.95, base * 0.65 + grain * 0.35)
      const byte = Math.round(roughness * 255)
      const i = (y * size + x) * 4
      // roughnessMap reads the GREEN channel (three's own
      // roughnessmap_fragment.glsl.js: `roughnessFactor *= texelRoughness.g`),
      // and this three version has no LuminanceFormat -- RedFormat alone
      // would leave .g at 0 and silently zero out all roughness. Fill
      // R/G/B identically with RGBAFormat instead.
      data[i] = data[i + 1] = data[i + 2] = byte
      data[i + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  // Each of the dock's ~62 primitives has its OWN independent [0,1] UV
  // range (confirmed by decoding the GLB's raw UV buffer), not one shared
  // atlas -- repeat=1 would stamp one full noise blob across every single
  // plank/post. A higher repeat gives each piece many small grain cells.
  tex.repeat.set(4, 4)
  tex.needsUpdate = true
  return tex
}
