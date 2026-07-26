"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import gsap from "gsap"

import { PRESETS, TRANSITION_SECONDS, type TimeOfDay } from "./environmentPresets"
import { tweenDuration } from "@/helpers/motion"

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
  uniform float uMoonOpacity;
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

  // Same hash/noise as Aurora.tsx -- GLSL has no cross-file includes here,
  // so each shader that wants it keeps its own local copy, same as this
  // file already does for its wave constants.
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

    // Noise-based ripple on top of the sine-sum swell -- the fixed-direction
    // sine terms alone repeat in an obviously regular lattice; this breaks
    // that up without touching the underlying wave motion.
    float ripple = noise(vWorldPos.xz * 2.3 + uTime * 0.12) - 0.5;
    normal = normalize(normal + vec3(ripple * 0.06, 0.0, ripple * 0.06));

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

    // Sparkle off wave facets facing the sun -- modulated by the same
    // ripple noise so it twinkles instead of sitting on the sine terms'
    // fixed lattice.
    vec3 halfDir = normalize(uSunDirection + viewDir);
    float sparkleNoise = 0.7 + 0.6 * noise(vWorldPos.xz * 4.0 - uTime * 0.3);
    color += uSunColor * pow(max(dot(normal, halfDir), 0.0), 140.0) * 0.8 * sparkleNoise;

    // Broader, softer moon shimmer -- there's only one directional light in
    // the whole rig (see Environment.tsx), so uSunColor/uSunDirection are
    // already moon-colored and moon-directed whenever the moon (not the
    // sun) is the one actually up; uMoonOpacity (mirrors the same field
    // driving the moon disc's own opacity) gates this so it only shows up
    // at night, distinct from the tighter solar sparkle above.
    color += uSunColor * pow(max(dot(normal, halfDir), 0.0), 24.0) * 0.35 * uMoonOpacity;

    // Shore foam -- "interaction with the island": a soft bright band right
    // at the sand/water boundary, reusing the shore-distance field already
    // computed above.
    float foamBand = 1.0 - smoothstep(0.0, 1.2, abs(distFromShore - uShoreRadius));
    float foamNoise = noise(vWorldPos.xz * 0.8 + uTime * 0.15);
    foamBand *= 0.6 + 0.4 * foamNoise;
    color = mix(color, vec3(1.0), foamBand * 0.5);

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
        uMoonOpacity: { value: preset.moonOpacity },
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

  // Same gsap-tweened-blend technique as Environment.tsx, applied to just
  // the fields this shader needs -- a plain mutable object eased with
  // power2.inOut (= easeInOutCubic: slow start, committed middle, soft
  // settle), read imperatively every frame. Replaces a previous per-frame
  // exponential chase (alpha = 1 - exp(-rate*delta)) toward the raw preset:
  // that approach jumps to full speed the instant the target changes and
  // only decelerates from there, with no slow start at all -- it reads as
  // an abrupt, almost-linear snap into motion rather than a physical
  // transition. Colors are hex strings (gsap interpolates them natively).
  const blendRef = useRef({
    skyTop: PRESETS[day].skyTop,
    skyHorizon: PRESETS[day].skyHorizon,
    dirColor: PRESETS[day].dirColor,
    fogColor: PRESETS[day].fogColor,
    dirX: PRESETS[day].dirX,
    dirY: PRESETS[day].dirY,
    dirZ: PRESETS[day].dirZ,
    fogNear: PRESETS[day].fogNear,
    fogFar: PRESETS[day].fogFar,
    moonOpacity: PRESETS[day].moonOpacity,
  })
  const currentTarget = useRef<TimeOfDay>(day)

  useEffect(() => {
    if (day === currentTarget.current) return
    currentTarget.current = day
    const preset = PRESETS[day]
    gsap.to(blendRef.current, {
      skyTop: preset.skyTop,
      skyHorizon: preset.skyHorizon,
      dirColor: preset.dirColor,
      fogColor: preset.fogColor,
      dirX: preset.dirX,
      dirY: preset.dirY,
      dirZ: preset.dirZ,
      fogNear: preset.fogNear,
      fogFar: preset.fogFar,
      moonOpacity: preset.moonOpacity,
      duration: tweenDuration(TRANSITION_SECONDS),
      ease: "power2.inOut",
    })
  }, [day])

  // Scratch object reused every frame -- avoid allocating a Vector3 per
  // frame on this hot path.
  const scratchDir = useRef(new THREE.Vector3())

  useFrame((state) => {
    const b = blendRef.current
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime

    u.uSkyZenith.value.set(b.skyTop)
    u.uSkyHorizon.value.set(b.skyHorizon)
    u.uSunColor.value.set(b.dirColor)
    u.uMoonOpacity.value = b.moonOpacity
    u.uFogColor.value.set(b.fogColor)

    scratchDir.current.set(b.dirX, b.dirY, b.dirZ).normalize()
    u.uSunDirection.value.copy(scratchDir.current)

    u.uFogNear.value = b.fogNear
    u.uFogFar.value = b.fogFar
  })

  return material
}
