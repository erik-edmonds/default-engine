"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Stars } from "@react-three/drei"
import gsap from "gsap"

import { PRESETS, type TimeOfDay, type EnvironmentBlend } from "./environmentPresets"
import { Sun } from "@/components/models/Sun"
import { Moon } from "@/components/models/Moon"
import { Campfire } from "@/components/models/Campfire"
import { DeadCampfire } from "@/components/models/DeadCampfire"
import { Aurora } from "./Aurora"
import { tweenDuration } from "@/helpers/motion"

const TRANSITION_SECONDS = 1.4
// Fixed (not tweened) rim-light position -- aimed generally at the
// avatar's resting spot from behind/opposite the key light, so it reads as
// a consistent backlit edge regardless of time of day; only its color and
// intensity change per preset.
const RIM_LIGHT_POSITION: [number, number, number] = [-2, 7, -9]
// Sun and moon both move along this same shared arc (a circle in the X-Y
// plane) -- see environmentPresets.ts's sunAngle/moonAngle. Center/radius
// were fit so each preset's angle lands close to where the sun/moon used
// to sit as fixed positions, while any point in between traces a curved
// path instead of cutting straight through 3D space.
const ARC_CENTER_X = -2
const ARC_CENTER_Y = -8
const ARC_RADIUS = 34
// Sun.tsx's own mesh is rotated [PI/2, 0, 0] internally; this outer
// rotation is the compensating twist (originally applied directly on
// Day.tsx's <Sun> instance) that orients its ray-burst geometry to face
// the camera -- without it the rays read edge-on, like Saturn's rings,
// instead of radiating around the disc.
const SUN_ROTATION: [number, number, number] = [Math.PI / 2, 0, Math.PI / 6]
const CAMPFIRE_POSITION: [number, number, number] = [1.5, -2, 1.5]
const CAMPFIRE_LIGHT_POSITION: [number, number, number] = [1.5, -1, 1.5]
// Below this campfire-light intensity the fire reads as "out" -- swap to
// the log-only model instead of a lit flame with no light contribution.
// (The flame mesh itself isn't cross-faded -- Campfire/DeadCampfire share
// the same underlying campfire.glb but there's no clean per-mesh opacity
// hook without invasive changes to those files, so this one decorative
// detail is a threshold swap rather than a smooth fade like everything
// else here.)
const CAMPFIRE_LIT_THRESHOLD = 0.5

const skyVertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFragmentShader = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  varying vec3 vPos;
  void main() {
    // Single monotonic curve, horizon (lightest) to zenith (darkest) -- no
    // branch at y=0. A mirrored two-branch curve (mix outward from the
    // same horizon color on both sides) reads as a reflection, and a power
    // curve with exponent<1 has infinite slope exactly at y=0, which shows
    // up as a hard seam right where a level camera looks most. smoothstep
    // is monotonic non-decreasing (so it's always "gradually darker the
    // higher it gets," never darkening back down) and C1-continuous
    // everywhere (no seam); the window below is tuned to where the camera
    // actually looks, so most of the visible sky (not just a thin sliver
    // right at the horizon) shows real gradient contrast.
    float y = normalize(vPos).y;
    float t = smoothstep(-0.2, 0.55, y);
    gl_FragColor = vec4(mix(uHorizon, uTop, t), 1.0);
  }
`

// Picks the smallest angle >= `current` that's congruent to `targetBase`
// (mod 360) -- i.e. always sweep the arc *forward*, never backward. Without
// this, cycling night -> day would tween the raw angle straight from 195deg
// down to 35deg, rewinding back through evening's position (the sun
// "un-setting"). This instead keeps carrying the angle up past 360 so every
// transition, including wrapping around the cycle, continues in the same
// rising/setting direction a real sun (or moon) would.
function nextAngle(current: number, targetBase: number) {
  const base = ((targetBase % 360) + 360) % 360
  const lap = Math.floor(current / 360) * 360
  let target = base + lap
  while (target < current) target += 360
  return target
}

export function Environment({
  target,
  nameTextRef,
}: {
  target: TimeOfDay
  nameTextRef?: React.RefObject<HTMLElement | null>
}) {
  // The single continuously-tweened source of truth. A ref (not state) --
  // this is read imperatively every frame in useFrame below, same pattern
  // as EarthIntro's shader-uniform updates, so a 60fps gsap tween doesn't
  // mean 60 React re-renders/sec.
  const blendRef = useRef<EnvironmentBlend>({ ...PRESETS[target] })
  const currentTarget = useRef<TimeOfDay>(target)

  useEffect(() => {
    if (target === currentTarget.current) return
    currentTarget.current = target
    gsap.to(blendRef.current, {
      ...PRESETS[target],
      // Overridden below: the raw preset angles are always in [0, 360), but
      // the live blend keeps growing past that (see nextAngle) so the arc
      // never sweeps backward -- tweening straight to the preset's raw
      // value would undo that and snap backward on every other cycle.
      sunAngle: nextAngle(blendRef.current.sunAngle, PRESETS[target].sunAngle),
      moonAngle: nextAngle(blendRef.current.moonAngle, PRESETS[target].moonAngle),
      duration: tweenDuration(TRANSITION_SECONDS),
      ease: "power2.inOut",
    })
  }, [target])

  const skyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        side: THREE.BackSide,
        uniforms: {
          uTop: { value: new THREE.Color(PRESETS[target].skyTop) },
          uHorizon: { value: new THREE.Color(PRESETS[target].skyHorizon) },
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const fog = useMemo(() => new THREE.Fog(PRESETS[target].fogColor, PRESETS[target].fogNear, PRESETS[target].fogFar), []) // eslint-disable-line react-hooks/exhaustive-deps

  const ambientRef = useRef<THREE.AmbientLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const dirRef = useRef<THREE.DirectionalLight>(null)
  const rimRef = useRef<THREE.DirectionalLight>(null)
  const campfireLightRef = useRef<THREE.PointLight>(null)
  const sunGroupRef = useRef<THREE.Group>(null)
  const moonGroupRef = useRef<THREE.Group>(null)
  const sunMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const moonMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const starsGroupRef = useRef<THREE.Group>(null)
  const auroraMaterialRef = useRef<THREE.ShaderMaterial>(null)
  const litCampfireRef = useRef<THREE.Group>(null)
  const deadCampfireRef = useRef<THREE.Group>(null)

  useFrame((state) => {
    const b = blendRef.current

    skyMaterial.uniforms.uTop.value.set(b.skyTop)
    skyMaterial.uniforms.uHorizon.value.set(b.skyHorizon)

    fog.color.set(b.fogColor)
    fog.near = b.fogNear
    fog.far = b.fogFar

    if (ambientRef.current) {
      ambientRef.current.color.set(b.ambientColor)
      ambientRef.current.intensity = b.ambientIntensity
    }
    if (hemiRef.current) {
      hemiRef.current.color.set(b.hemiSky)
      hemiRef.current.groundColor.set(b.hemiGround)
      hemiRef.current.intensity = b.hemiIntensity
    }
    if (dirRef.current) {
      dirRef.current.color.set(b.dirColor)
      dirRef.current.intensity = b.dirIntensity
      dirRef.current.position.set(b.dirX, b.dirY, b.dirZ)
    }
    if (rimRef.current) {
      rimRef.current.color.set(b.rimColor)
      rimRef.current.intensity = b.rimIntensity
    }
    if (campfireLightRef.current) {
      campfireLightRef.current.color.set(b.campfireColor)
      campfireLightRef.current.intensity = b.campfireIntensity
    }
    if (sunGroupRef.current) {
      const rad = (b.sunAngle * Math.PI) / 180
      sunGroupRef.current.position.set(ARC_CENTER_X + ARC_RADIUS * Math.cos(rad), ARC_CENTER_Y + ARC_RADIUS * Math.sin(rad), b.sunZ)
    }
    if (moonGroupRef.current) {
      const rad = (b.moonAngle * Math.PI) / 180
      moonGroupRef.current.position.set(ARC_CENTER_X + ARC_RADIUS * Math.cos(rad), ARC_CENTER_Y + ARC_RADIUS * Math.sin(rad), b.moonZ)
    }
    if (sunMaterialRef.current) sunMaterialRef.current.opacity = b.sunOpacity
    if (moonMaterialRef.current) moonMaterialRef.current.opacity = b.moonOpacity
    if (starsGroupRef.current) starsGroupRef.current.visible = b.starsOpacity > 0.5
    if (auroraMaterialRef.current) {
      auroraMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      auroraMaterialRef.current.uniforms.uOpacity.value = b.auroraOpacity
    }

    const lit = b.campfireIntensity > CAMPFIRE_LIT_THRESHOLD
    if (litCampfireRef.current) litCampfireRef.current.visible = lit
    if (deadCampfireRef.current) deadCampfireRef.current.visible = !lit

    if (nameTextRef?.current) {
      nameTextRef.current.style.color = b.nameTextColor
      nameTextRef.current.style.textShadow = `0 0 24px ${b.rimColor}`
    }
  })

  return (
    <>
      <primitive object={fog} attach="fog" />
      <mesh scale={800}>
        <sphereGeometry />
        <primitive object={skyMaterial} attach="material" />
      </mesh>

      <ambientLight ref={ambientRef} />
      <hemisphereLight ref={hemiRef} />
      <directionalLight
        ref={dirRef}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      {/* The new rim/back light: fixed position, only color+intensity
          tweened, giving the avatar a consistent backlit edge across every
          time of day instead of reading flat. */}
      <directionalLight ref={rimRef} position={RIM_LIGHT_POSITION} />

      <group ref={sunGroupRef} scale={4} rotation={SUN_ROTATION}>
        <Sun materialRef={sunMaterialRef} />
      </group>
      <group ref={moonGroupRef} scale={0.15}>
        <Moon materialRef={moonMaterialRef} />
      </group>
      <group ref={starsGroupRef}>
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      </group>
      <Aurora materialRef={auroraMaterialRef} />

      <pointLight ref={campfireLightRef} position={CAMPFIRE_LIGHT_POSITION} distance={7} decay={2} />
      <group ref={litCampfireRef}>
        <Campfire scale={1.5} position={CAMPFIRE_POSITION} />
      </group>
      <group ref={deadCampfireRef}>
        <DeadCampfire scale={1.5} position={CAMPFIRE_POSITION} />
      </group>
    </>
  )
}
