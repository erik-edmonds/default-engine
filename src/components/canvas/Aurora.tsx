"use client"

import { useMemo } from "react"
import * as THREE from "three"

// A large inner sphere (BackSide, like the sky dome) -- all the actual
// band/curtain shape lives in the fragment shader based on view direction,
// so the geometry itself is just a canvas, not something that needs
// hand-tuned theta/phi angle params.
const RADIUS = 700

const vertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorC;
  varying vec3 vPos;

  // Cheap value noise (layered sines/hash, no texture lookup) -- same
  // "analytic, no external asset" spirit as the ocean water shader.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec3 dir = normalize(vPos);
    float elevation = dir.y;
    // A horizontal coordinate for the noise field. atan2(x,z) (the "real"
    // azimuth angle) has a branch-cut discontinuity at +-180 degrees --
    // for a forward-facing sky effect that never needs to wrap a full
    // circle, that seam has no reason to exist and, depending on camera
    // rotation, can land right in the middle of the visible view (showing
    // up as an unnatural break/"disjoint spot" in the band). dir.x is
    // continuous everywhere and tracks left-right screen position for any
    // forward-looking camera, so use that instead.
    float h = dir.x;

    // The whole pattern flows sideways over time -- real aurora visibly
    // "dances" rather than sitting static, and this is what sells that.
    float drift = uTime * 0.025;

    // A real aurora curtain has a fairly crisp *lower* edge (its base) and
    // streams upward in rays that thin out and fade the higher they go --
    // not the other way around. One continuous wavy base line sweeps
    // gently across the sky (low frequency -- a single flowing arc, not
    // disconnected wiggles), positioned low and kept short so it sits near
    // the horizon as an accent instead of stretching toward the zenith and
    // dominating the sky.
    float baseWave = noise(vec2(h * 1.8 + drift, uTime * 0.015)) * 2.0 - 1.0;
    float base = 0.05 + baseWave * 0.1;
    float above = elevation - base; // 0 at the base, positive going up

    // Sharp cutoff below the base -- nothing shows beneath it.
    float baseCutoff = smoothstep(-0.025, 0.0, above);

    // Rays thin out going up from the base -- short length keeps the
    // whole effect compact rather than filling the sky.
    float rayLenNoise = noise(vec2(h * 20.0 + drift * 1.4, 3.0));
    float rayLength = mix(0.05, 0.16, rayLenNoise);
    float rayFade = exp(-max(above, 0.0) / rayLength);

    float shape = baseCutoff * rayFade;

    // Fine vertical texture within the rays themselves.
    float rayTexture = noise(vec2(h * 90.0 + drift * 2.0, elevation * 4.0 + uTime * 0.15));
    rayTexture = 0.6 + 0.5 * rayTexture;

    float intensity = clamp(shape * rayTexture, 0.0, 1.0) * uOpacity;

    // Magenta/pink bleeding through near the brightest core, same as real
    // aurora's mixed oxygen/nitrogen emission colors, via a slow
    // independent noise so it doesn't uniformly tint the whole ribbon.
    float magentaMix = smoothstep(0.55, 0.95, shape) * noise(vec2(h * 6.0 + drift * 0.7, 9.0));
    vec3 color = mix(uColorA, uColorC, clamp(magentaMix, 0.0, 0.6));

    gl_FragColor = vec4(color * intensity * 1.05, intensity * 0.85);
  }
`

export function Aurora({ materialRef }: { materialRef: React.RefObject<THREE.ShaderMaterial | null> }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color("#4ade80") },
      uColorC: { value: new THREE.Color("#d6409f") },
    }),
    [],
  )

  return (
    <mesh scale={RADIUS}>
      <sphereGeometry args={[1, 64, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        fog={false}
      />
    </mesh>
  )
}
