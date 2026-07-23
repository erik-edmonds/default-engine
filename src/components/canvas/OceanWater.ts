"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { PRESETS, type TimeOfDay } from "./environmentPresets"

// Same imperative-ease-toward-target technique as EarthIntro.tsx's progress
// bar -- cheaper than a second gsap timeline and can't drift out of sync
// with anything, since it just continuously chases whatever the current
// preset is every frame.
const EASE_RATE_PER_SECOND = 3

// Calm tropical lagoon, not open ocean -- fixed, not tweened per time of
// day. The sky-reflection tint (below) already carries the day/night mood
// shift.
const DEEP_COLOR = "#0c4f63"
const SHALLOW_COLOR = "#4fd8cd"

// The merged island sits close to world XZ origin (Merged's own position
// prop only offsets Y) -- shore radius/fade sized from its measured
// real-world footprint (~14x15 units after all group scales).
const ISLAND_CENTER: [number, number] = [0, 0]
const SHORE_RADIUS = 8
const SHORE_FADE = 6

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;

  // World-space, not local -- keeps one shared material correct across
  // both water meshes despite their very different local mesh scale.
  // Large-wavelength swell only; finer ripple detail is added per-fragment
  // instead (see fragment shader) so it doesn't alias against the meshes'
  // low triangle count.
  const vec2 DIR0 = vec2(0.83, 0.55);
  const float FREQ0 = 0.18;
  const float AMP0 = 0.05;
  const float SPEED0 = 0.35;
  const vec2 DIR1 = vec2(-0.42, 0.91);
  const float FREQ1 = 0.31;
  const float AMP1 = 0.025;
  const float SPEED1 = 0.55;

  float waveHeight(vec2 p) {
    return AMP0 * sin(dot(p, DIR0) * FREQ0 + uTime * SPEED0)
         + AMP1 * sin(dot(p, DIR1) * FREQ1 + uTime * SPEED1 + 1.7);
  }

  void main() {
    vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    worldPos.y += waveHeight(worldPos.xz);
    vWorldPos = worldPos;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec2 uIslandCenter;
  uniform float uShoreRadius;
  uniform float uShoreFade;
  uniform float uTime;

  varying vec3 vWorldPos;

  // Same swell as the vertex shader, plus one finer ripple term -- computed
  // per-fragment (not per-vertex) so fine reflection distortion reads
  // smoothly despite the sparse underlying geometry.
  const vec2 DIR0 = vec2(0.83, 0.55);
  const float FREQ0 = 0.18;
  const float AMP0 = 0.05;
  const float SPEED0 = 0.35;
  const vec2 DIR1 = vec2(-0.42, 0.91);
  const float FREQ1 = 0.31;
  const float AMP1 = 0.025;
  const float SPEED1 = 0.55;
  const vec2 DIR2 = vec2(0.20, -0.98);
  const float FREQ2 = 0.9;
  const float AMP2 = 0.008;
  const float SPEED2 = 1.1;

  vec2 waveSlope(vec2 p) {
    return DIR0 * (AMP0 * FREQ0 * cos(dot(p, DIR0) * FREQ0 + uTime * SPEED0))
         + DIR1 * (AMP1 * FREQ1 * cos(dot(p, DIR1) * FREQ1 + uTime * SPEED1 + 1.7))
         + DIR2 * (AMP2 * FREQ2 * cos(dot(p, DIR2) * FREQ2 + uTime * SPEED2 + 4.1));
  }

  void main() {
    vec2 slope = waveSlope(vWorldPos.xz);
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 viewDir = normalize(cameraPosition - vWorldPos);

    // Fake reflection: no render-target/second camera pass -- reflect the
    // view ray off the perturbed normal and sample a 2-stop sky gradient
    // by its vertical component, same idea as the sky shader's own
    // horizon-biased mix, just simpler (water never needs a "looking down"
    // extreme the way the real sky does).
    vec3 reflectDir = reflect(-viewDir, normal);
    float skyMix = clamp(reflectDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 skyColor = mix(uSkyHorizon, uSkyZenith, skyMix);

    float fresnel = mix(0.2, 1.0, pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0));

    // Depth cue the baked geometry never had: shallow/turquoise near the
    // island, deeper/darker further out.
    float distFromShore = length(vWorldPos.xz - uIslandCenter);
    float shallow = 1.0 - smoothstep(uShoreRadius, uShoreRadius + uShoreFade, distFromShore);
    vec3 waterColor = mix(uDeepColor, uShallowColor, shallow);

    vec3 color = mix(waterColor, skyColor, fresnel);

    // Sparkle off wave facets facing the sun.
    vec3 halfDir = normalize(uSunDirection + viewDir);
    color += uSunColor * pow(max(dot(normal, halfDir), 0.0), 140.0) * 0.8;

    // Hand-rolled fog -- a custom ShaderMaterial doesn't get Three's
    // automatic fog for free the way MeshBasicMaterial does.
    float fogFactor = clamp((length(vWorldPos - cameraPosition) - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
    color = mix(color, uFogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`

export function useOceanWaterMaterial(day: TimeOfDay) {
  const material = useMemo(() => {
    const preset = PRESETS[day]
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uSkyZenith: { value: new THREE.Color(preset.skyTop) },
        uSkyHorizon: { value: new THREE.Color(preset.skyHorizon) },
        uSunDirection: { value: new THREE.Vector3(preset.dirX, preset.dirY, preset.dirZ).normalize() },
        uSunColor: { value: new THREE.Color(preset.dirColor) },
        uFogColor: { value: new THREE.Color(preset.fogColor) },
        uFogNear: { value: preset.fogNear },
        uFogFar: { value: preset.fogFar },
        uDeepColor: { value: new THREE.Color(DEEP_COLOR) },
        uShallowColor: { value: new THREE.Color(SHALLOW_COLOR) },
        uIslandCenter: { value: new THREE.Vector2(...ISLAND_CENTER) },
        uShoreRadius: { value: SHORE_RADIUS },
        uShoreFade: { value: SHORE_FADE },
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scratch objects reused every frame -- avoid allocating a Color/Vector3
  // per uniform per frame on this hot path.
  const scratchColor = useRef(new THREE.Color())
  const scratchDir = useRef(new THREE.Vector3())

  useFrame((state, delta) => {
    const preset = PRESETS[day]
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime

    const alpha = 1 - Math.exp(-EASE_RATE_PER_SECOND * delta)

    u.uSkyZenith.value.lerp(scratchColor.current.set(preset.skyTop), alpha)
    u.uSkyHorizon.value.lerp(scratchColor.current.set(preset.skyHorizon), alpha)
    u.uSunColor.value.lerp(scratchColor.current.set(preset.dirColor), alpha)
    u.uFogColor.value.lerp(scratchColor.current.set(preset.fogColor), alpha)

    scratchDir.current.set(preset.dirX, preset.dirY, preset.dirZ).normalize()
    u.uSunDirection.value.lerp(scratchDir.current, alpha)

    u.uFogNear.value += (preset.fogNear - u.uFogNear.value) * alpha
    u.uFogFar.value += (preset.fogFar - u.uFogFar.value) * alpha
  })

  return material
}
