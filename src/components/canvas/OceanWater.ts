"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import gsap from "gsap"

import { PRESETS, TRANSITION_SECONDS, type TimeOfDay } from "./environmentPresets"
import { tweenDuration } from "@/helpers/motion"

// Calm tropical lagoon, not open ocean -- fixed, not tweened per time of
// day, same as the sky-reflection tint below now is too.
const DEEP_COLOR = "#0c4f63"
const SHALLOW_COLOR = "#4fd8cd"

// The water's reflected-sky tint used to be the live tweened uSkyZenith/
// uSkyHorizon (same preset colors driving the actual sky) -- since fresnel
// (below) pushes a lot of the visible surface toward this reflection color
// rather than DEEP_COLOR/SHALLOW_COLOR, that made the whole pond visibly
// swing from bright cyan at day to dark navy/purple at night, tracking the
// sky far more than a real reflective water surface reads. Pinned to a
// fixed bright sky tint instead, so the water stays a consistent, legible
// turquoise regardless of time of day -- only its lighting (fog, specular
// sparkle color/position from the sun or moon) still tracks the day/night
// blend.
const REFLECTION_ZENITH = "#8fd8e8"
const REFLECTION_HORIZON = "#eafcff"

// The merged island sits close to world XZ origin (Merged's own position
// prop only offsets Y) -- shore radius/fade sized from its measured
// real-world footprint (~14x15 units after all group scales).
const ISLAND_CENTER: [number, number] = [0, 0]
const SHORE_RADIUS = 8
const SHORE_FADE = 6

const vertexShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorldPos;

  // Two-term swell for the mesh's own actual Y bob -- this is genuine
  // geometry displacement (unlike the fragment shader's noise-based
  // normal below, which only fakes lighting response on an otherwise
  // still-flat surface and can never make the silhouette itself read as
  // non-flat). Originally amplitude 0.05/0.025 -- tuned deliberately
  // small on the assumption that the sparse, 108-vertex mesh couldn't
  // show displacement cleanly at any amplitude, but that undersold it:
  // confirmed live, the previous amplitude read as completely flat, not
  // subtly wavy. Raised ~7x. Wavelengths (2*PI/0.18 ~= 35 and 2*PI/0.31
  // ~= 20 world units) are deliberately kept long relative to the
  // ~15-unit-radius pond and untouched from the original tuning -- long
  // wavelengths are what keep this looking like rolling swell rather than
  // aliasing into jagged noise across so few vertices; only the height
  // (and, slightly slowed to match, the speed) changed.
  float waveHeight(vec2 p) {
    return 0.35 * sin(dot(p, vec2(0.83, 0.55)) * 0.18 + uTime * 0.22)
         + 0.18 * sin(dot(p, vec2(-0.42, 0.91)) * 0.31 + uTime * 0.35 + 1.7);
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

  // Multi-octave value noise (fbm). The water's normal used to come from
  // the analytic derivative of a 2-3 term fixed-direction sine sum
  // (waveSlope, now removed) -- an exact periodic function with an exact
  // repeating wavelength (e.g. 2*PI/0.9 ~= 7 world units for the shortest
  // term). Across a large, mostly-flat plane, and further amplified by how
  // sensitive the fresnel term below is to any normal.y change, that read
  // as an obvious, regular ribbed/ringed pattern once the amplitude was
  // pushed up enough for the water to visibly move at all -- confirmed via
  // an elevated/distant test camera, where the ribbing was unmistakable.
  // fbm has no exact period (each octave rescales by an irrational-ish
  // 2.11 with an offset, so they never realign into a repeating supercell),
  // which is what actually fixes the repetition -- not just adding noise on
  // top of the old sine terms, which was tried first and only made the
  // still-present periodic component read as louder texture detail.
  float fbm(vec2 p) {
    float sum = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      sum += amp * (noise(p) - 0.5);
      p = p * 2.11 + vec2(11.7, -6.3);
      amp *= 0.5;
    }
    return sum;
  }

  // Faceted caustic patches spanning the *whole* water surface. Two earlier
  // passes at this used fbm (this file's own value noise above) thresholded
  // into a mask -- first too low-contrast/coarse to read at all, then
  // sharpened but still fundamentally wrong: fbm is smooth everywhere, so
  // no matter how hard its edge is thresholded, the *patches themselves*
  // come out as soft organic blobs. The reference (sources/recording.mov),
  // examined closely, is something else entirely -- straight-edged,
  // faceted polygonal patches, like shattered glass or a triangulated
  // low-poly surface catching light, consistent with the rest of that
  // scene's flat-shaded aesthetic. That shape needs a genuinely different
  // primitive: cellular/Voronoi noise -- jittered feature points on a
  // grid, each pixel classified by *which cell it falls in*, not by a
  // continuous field. Cell boundaries are the set of points equidistant
  // between two feature points, which are straight line segments meeting
  // at angles -- faceted by construction, no thresholding trick needed.
  vec2 cellHash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }

  // Returns (distance to nearest feature point, that cell's own random id)
  // -- id is what drives the bright/dark split below; distance is unused
  // for now but is the standard hook for adding a dark seam between cells
  // later if wanted.
  vec2 voronoi(vec2 p) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float minDist = 8.0;
    float id = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 jitter = cellHash(ip + offset);
        vec2 diff = offset + jitter - fp;
        float d = dot(diff, diff);
        if (d < minDist) {
          minDist = d;
          id = cellHash(ip + offset + 7.0).x;
        }
      }
    }
    return vec2(sqrt(minDist), id);
  }

  // Translating the sample point over time doesn't reshape any individual
  // cell (each cell's own id is fixed) -- it slides the *viewing window*
  // across a fixed mosaic, the same way a current carries a fixed pattern
  // of ice/foam past a stationary observer. That's what actually produces
  // motion here, unlike the previous version's near-invisible drift (0.04
  // world units/sec against a ~1.8-unit noise feature size -- a full
  // cycle took over a minute to complete, reading as frozen at a glance).
  // At this cell scale (~1.1 world units) these speeds shift a full cell
  // width in single-digit seconds -- unmistakably alive without reading
  // as a fast current on a calm lagoon.
  float causticMask(vec2 p, float t) {
    vec2 cell = voronoi(p * 0.9 + vec2(t * 0.25, t * 0.18));
    return step(0.55, cell.y);
  }

  // Two fbm layers at different scales/flow directions/speeds, summed into
  // one height field -- a coarse "swell" layer plus a finer "chop" layer,
  // the standard way to make procedural water read as layered motion
  // rather than one uniform ripple size.
  float waterHeight(vec2 p, float t) {
    vec2 flow1 = p * 0.09 + vec2(t * 0.06, t * 0.03);
    vec2 flow2 = p * 0.23 + vec2(-t * 0.05, t * 0.07);
    return fbm(flow1) * 0.35 + fbm(flow2) * 0.15;
  }

  // Standard height-field-to-normal via finite differences -- since the
  // underlying field is noise (not an analytic function), there's no
  // closed-form derivative to take the way the old sine version could.
  vec3 waterNormal(vec2 p, float t) {
    float eps = 0.4;
    float h0 = waterHeight(p, t);
    float hx = waterHeight(p + vec2(eps, 0.0), t);
    float hz = waterHeight(p + vec2(0.0, eps), t);
    return normalize(vec3((h0 - hx) / eps, 1.0, (h0 - hz) / eps));
  }

  void main() {
    vec3 normal = waterNormal(vWorldPos.xz, uTime);
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

    // Sparkle off wave facets facing the sun/moon. A previous pass tried a
    // hard-thresholded noise mask to force scattered "glitter points" --
    // against the old periodic sine normal that just produced dense, even
    // static (it "glitters like a stone," not water). With the normal now
    // itself organically noise-driven, a plain smooth specular term is
    // already naturally broken up into scattered dapples by the normal
    // field underneath it, without needing an extra artificial mask on top.
    vec3 halfDir = normalize(uSunDirection + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 40.0);
    color += uSunColor * spec * 1.4;

    // Moon shimmer: broader, dimmer falloff on the same term -- there's
    // only one directional light in the whole rig (see Environment.tsx),
    // so uSunColor/uSunDirection are already moon-colored and
    // moon-directed whenever the moon (not the sun) is actually up;
    // uMoonOpacity (mirrors the field driving the moon disc's own opacity)
    // gates this to night only.
    float moonSpec = pow(max(dot(normal, halfDir), 0.0), 10.0);
    color += uSunColor * moonSpec * 0.35 * uMoonOpacity;

    // Shore foam -- "interaction with the island": a band right at the
    // sand/water boundary, reusing the shore-distance field already
    // computed above. Wobbling the effective radius with fbm (rather than
    // testing against the exact uShoreRadius circle) keeps the foam line
    // from reading as a perfect, obviously-artificial ring around a
    // natural, non-circular island edge; a second noise term breaks the
    // band itself into patches instead of an unbroken glowing halo.
    float shoreWobble = fbm(vWorldPos.xz * 0.3) * 3.0;
    float foamBand = 1.0 - smoothstep(0.0, 1.0, abs(distFromShore - (uShoreRadius + shoreWobble)));
    float foamPatchiness = smoothstep(0.3, 0.8, fbm(vWorldPos.xz * 1.2 + uTime * 0.1) + 0.5);
    foamBand *= foamPatchiness;
    color = mix(color, vec3(0.92, 0.97, 1.0), foamBand * 0.35);

    // Broad caustic/glitter patches over the *whole* surface (see
    // causticMask above) -- unlike foamBand this isn't gated by
    // distFromShore, so it reads across the entire pond the way the
    // reference water does, not just as a ring at the sand line. Blended
    // bold (0.8, not the original 0.45) -- the reference patches read as
    // unmistakably bright at a glance, not a subtle tint.
    float caustic = causticMask(vWorldPos.xz, uTime);
    color = mix(color, vec3(0.8, 0.97, 1.0), caustic * 0.8);

    // Hand-rolled fog -- a custom ShaderMaterial doesn't get Three's
    // automatic fog for free the way MeshBasicMaterial does.
    float fogFactor = clamp((length(vWorldPos - cameraPosition) - uFogNear) / max(uFogFar - uFogNear, 0.001), 0.0, 1.0);
    color = mix(color, uFogColor, fogFactor);

    gl_FragColor = vec4(color, 1.0);
  }
`

export function useOceanWaterMaterial(from: TimeOfDay, day: TimeOfDay, transitionSeconds: number = TRANSITION_SECONDS) {
  const material = useMemo(() => {
    const preset = PRESETS[from]
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uSkyZenith: { value: new THREE.Color(REFLECTION_ZENITH) },
        uSkyHorizon: { value: new THREE.Color(REFLECTION_HORIZON) },
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
    dirColor: PRESETS[from].dirColor,
    fogColor: PRESETS[from].fogColor,
    dirX: PRESETS[from].dirX,
    dirY: PRESETS[from].dirY,
    dirZ: PRESETS[from].dirZ,
    fogNear: PRESETS[from].fogNear,
    fogFar: PRESETS[from].fogFar,
    moonOpacity: PRESETS[from].moonOpacity,
  })
  // Starts `null`, not `day` -- see the identical comment in Environment.tsx.
  const currentTarget = useRef<TimeOfDay | null>(null)
  // Tracked alongside currentTarget -- see the identical comment in
  // Environment.tsx for why a pace-only change (same `day`, shorter
  // `transitionSeconds`) still needs to retrigger this effect.
  const currentTransitionSeconds = useRef<number | null>(null)

  useEffect(() => {
    if (day === currentTarget.current && transitionSeconds === currentTransitionSeconds.current) return
    currentTarget.current = day
    currentTransitionSeconds.current = transitionSeconds
    const preset = PRESETS[day]
    // See Environment.tsx's identical auto/click split -- linear during the
    // unattended auto-cycle so the sparkle/fog motion stays constant-speed
    // in step with the sky, eased only for the short, standalone click skip.
    const auto = transitionSeconds !== TRANSITION_SECONDS
    gsap.to(blendRef.current, {
      dirColor: preset.dirColor,
      fogColor: preset.fogColor,
      dirX: preset.dirX,
      dirY: preset.dirY,
      dirZ: preset.dirZ,
      fogNear: preset.fogNear,
      fogFar: preset.fogFar,
      moonOpacity: preset.moonOpacity,
      duration: tweenDuration(transitionSeconds),
      ease: auto ? "none" : "power2.inOut",
      // See Environment.tsx's identical comment -- without this, a fast
      // click-triggered tween completing mid-way through a slow
      // auto-progression tween hands control back to the slow one,
      // dragging the water's colors back toward the abandoned phase.
      overwrite: true,
    })
  }, [day, transitionSeconds])

  // Scratch object reused every frame -- avoid allocating a Vector3 per
  // frame on this hot path.
  const scratchDir = useRef(new THREE.Vector3())

  useFrame((state) => {
    const b = blendRef.current
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime

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
