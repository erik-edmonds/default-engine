"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Stars, Sparkles, Sky } from "@react-three/drei"
import gsap from "gsap"

import { PRESETS, TRANSITION_SECONDS, type TimeOfDay, type EnvironmentBlend } from "./environmentPresets"
import { ISLAND_CAMERA_POSITION } from "@/config/positions"
import { Sun } from "@/components/models/Sun"
import { Moon } from "@/components/models/Moon"
import { Campfire } from "@/components/models/Campfire"
import { DeadCampfire } from "@/components/models/DeadCampfire"
import { Aurora } from "./Aurora"
import { tweenDuration } from "@/helpers/motion"

const RIM_LIGHT_POSITION: [number, number, number] = [-2, 7, -9]
// Sun and moon both move along this same shared arc (a circle in the X-Y
// plane) -- see environmentPresets.ts's sunAngle/moonAngle. Center/radius
// were fit so each preset's angle lands close to where the sun/moon used
// to sit as fixed positions, while any point in between traces a curved
// path instead of cutting straight through 3D space.
// ARC_CENTER_X shifted from -2 to 6 -- raising day/night's angle (see
// sunAngle/moonAngle in environmentPresets.ts) to fix "too low in the
// sky" moved the sun/moon higher (Y = center + radius*sin(angle)) but,
// as a direct side effect of moving along a shared circular arc, also
// pulled them noticeably toward screen-left (X = center + radius*cos
// (angle), and cos falls as angle rises) -- confirmed against reference
// screenshots showing both sun and moon sitting up near the top-right
// corner, not center-top. This shift compensates on the X axis for both
// bodies at once without touching the angle (height) that was just fixed.
const ARC_CENTER_X = 6
const ARC_CENTER_Y = -8
const ARC_RADIUS = 34
// Sun.tsx/Moon.tsx's own meshes are each rotated [PI/2, 0, 0] internally,
// which doesn't line up with lookAt()'s -Z-faces-target convention (see the
// sunGroupRef/moonGroupRef lookAt calls below) -- applied directly, the
// disc reads edge-on ("Saturn's rings") instead of face-on. These are the
// additional fixed local twists (applied on a wrapper *inside* the
// lookAt-oriented group, composing after it) that correct for that.
// Solved numerically rather than derived by hand: computed so that, at
// each model's original reference angle (day's sunAngle=35, night's
// moonAngle=39 -- the angle each used to be tuned to look right at with a
// fixed rotation), lookAt(home camera) * this twist reproduces that same
// known-good orientation exactly. Because only this twist is fixed and the
// aim-at-camera part now tracks the target every frame, unlike the old
// fixed rotation this stays correct at every *other* angle along the arc
// too, not just the one it was tuned for.
const SUN_FACE_CORRECTION: [number, number, number] = [1.2717276582045292, 0, -0.17026315366537004]
const MOON_FACE_CORRECTION: [number, number, number] = [1.2273400901573113, 0, -0.6689379884559306]
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

// Aurora visibility now tracks the sun's own live position (sunOpacity,
// already tweened every frame below) instead of the preset-level
// auroraOpacity field. auroraOpacity only differs between "night" (1) and
// every other preset (0), tweened over the FULL segment duration -- during
// an evening -> night transition that fades it in gradually across the
// entire ~60s segment, so it was visibly appearing well before the sun had
// actually gone down (and, symmetrically, lingering into dawn after the sun
// was already rising). Gating on sunOpacity instead ties the aurora to the
// sun's actual height in the sky: full aurora only once the sun is
// essentially at the horizon/below (<= FLOOR), fully gone by the time the
// sun is noticeably up again (>= CEIL).
const AURORA_SUN_OPACITY_FLOOR = 0.05
const AURORA_SUN_OPACITY_CEIL = 0.2

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
  from,
  target,
  transitionSeconds = TRANSITION_SECONDS,
}: {
  /** The phase this component should start FROM if it's mounting into an
   *  already-in-progress transition (the common case -- see
   *  useTimeOfDayCycle.ts). Equals `target` for a no-op/instant snap. */
  from: TimeOfDay
  target: TimeOfDay
  /** Seconds for the blend into `target`. ~3 for a click, ~90 for the
   *  ambient auto-cycle. Must match whatever OceanWater.ts and PhaseCube
   *  were handed for this same change, or they visibly desync. */
  transitionSeconds?: number
}) {
  // The single continuously-tweened source of truth. A ref (not state) --
  // this is read imperatively every frame in useFrame below, same pattern
  // as EarthIntro's shader-uniform updates, so a 60fps gsap tween doesn't
  // mean 60 React re-renders/sec. Starts at `from`, NOT `target` -- see the
  // currentTarget initializer below.
  const blendRef = useRef<EnvironmentBlend>({ ...PRESETS[from] })
  // Starts `null` (never a real TimeOfDay) rather than `target`, so the
  // effect below always runs at least once on mount instead of treating
  // whatever `target` happens to already be as "already arrived, nothing to
  // animate" -- see the comment on TimeOfDayTransition in
  // useTimeOfDayCycle.ts for why that assumption is wrong here.
  const currentTarget = useRef<TimeOfDay | null>(null)
  // Tracked alongside currentTarget, not folded into one check -- a click
  // landing mid an in-flight, not-yet-settled transition (see
  // useTimeOfDayCycle.ts's skipAhead) can retarget ONLY the pace (same
  // `target`, shorter `transitionSeconds`) without `target` itself ever
  // changing value. Guarding on `target` alone would silently ignore that:
  // the sky/sun/moon blend would just keep tweening at its original slow
  // pace as if the click never happened, while PhaseCube (fixed
  // separately) visibly sped up -- the two would desync.
  const currentTransitionSeconds = useRef<number | null>(null)

  useEffect(() => {
    if (target === currentTarget.current && transitionSeconds === currentTransitionSeconds.current) return
    currentTarget.current = target
    currentTransitionSeconds.current = transitionSeconds
    // The ambient auto-cycle (transitionSeconds === AUTO_TRANSITION_SECONDS)
    // needs to read as continuous, constant-speed motion -- the sun and moon
    // "always moving, like in the real world," never stalling. power2.inOut
    // (slow-fast-slow) is right for a single, standalone ~3s click-triggered
    // skip, which is over almost as soon as you notice it, but chained
    // back-to-back across an unattended cycle its slow ends mean velocity
    // drops toward zero right at *every* phase boundary, which reads as the
    // whole scene visibly pausing every minute -- the opposite of constant.
    // Linear keeps speed uniform through and across every boundary; only a
    // manual click (the short, fast case) still gets the eased feel.
    const auto = transitionSeconds !== TRANSITION_SECONDS
    gsap.to(blendRef.current, {
      ...PRESETS[target],
      // Overridden below: the raw preset angles are always in [0, 360), but
      // the live blend keeps growing past that (see nextAngle) so the arc
      // never sweeps backward -- tweening straight to the preset's raw
      // value would undo that and snap backward on every other cycle.
      sunAngle: nextAngle(blendRef.current.sunAngle, PRESETS[target].sunAngle),
      moonAngle: nextAngle(blendRef.current.moonAngle, PRESETS[target].moonAngle),
      duration: tweenDuration(transitionSeconds),
      // gsap's power2 = cubic (power1 is quad, power3 is quart, etc.), so
      // "power2.inOut" is exactly "easeInOutCubic" -- slow start, committed
      // middle, soft settle. See TRANSITION_EASE_CSS in environmentPresets.ts
      // for the CSS-side equivalent (still used for the click case).
      ease: auto ? "none" : "power2.inOut",
      // GSAP 3 defaults to overwrite:false. Without this, a fast (~3s)
      // click-triggered tween that finishes while a still-alive ambient
      // auto-progression tween has time left hands control back to that
      // slow tween on its next frame, visibly dragging the scene back
      // toward the phase the user just skipped past.
      overwrite: true,
    })
  }, [target, transitionSeconds])

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
      // Sun/moon geometry is a flat disc, not a sphere -- with a rotation
      // fixed in world space, moving the disc along the arc constantly
      // changes the angle between its fixed face-normal and the camera,
      // so the flat shape (and especially the sun's spiky rays) reads as
      // skewing/rotating as it travels, only looking right at the one
      // point the fixed rotation happened to be tuned for. Re-aiming it at
      // the (fixed) home camera position every frame instead keeps it
      // face-on from that vantage point for the whole arc.
      sunGroupRef.current.lookAt(ISLAND_CAMERA_POSITION)
    }
    if (moonGroupRef.current) {
      const rad = (b.moonAngle * Math.PI) / 180
      moonGroupRef.current.position.set(ARC_CENTER_X + ARC_RADIUS * Math.cos(rad), ARC_CENTER_Y + ARC_RADIUS * Math.sin(rad), b.moonZ)
      moonGroupRef.current.lookAt(ISLAND_CAMERA_POSITION)
    }
    if (sunMaterialRef.current) sunMaterialRef.current.opacity = b.sunOpacity
    if (moonMaterialRef.current) moonMaterialRef.current.opacity = b.moonOpacity
    if (starsGroupRef.current) starsGroupRef.current.visible = b.starsOpacity > 0.5
    if (auroraMaterialRef.current) {
      auroraMaterialRef.current.uniforms.uTime.value = state.clock.elapsedTime
      const auroraVisibility = 1 - THREE.MathUtils.smoothstep(b.sunOpacity, AURORA_SUN_OPACITY_FLOOR, AURORA_SUN_OPACITY_CEIL)
      auroraMaterialRef.current.uniforms.uOpacity.value = b.auroraOpacity * auroraVisibility
    }

    const lit = b.campfireIntensity > CAMPFIRE_LIT_THRESHOLD
    if (litCampfireRef.current) litCampfireRef.current.visible = lit
    if (deadCampfireRef.current) deadCampfireRef.current.visible = !lit
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
        // Extra blur on top of Canvas's shadow map (see page.tsx,
        // shadows="percentage") -- a crisp, hard-edged shadow reads as if it's
        // falling on a rigid floor; this is most obvious on the water
        // shadow-catcher (OceanWater.ts/MergedScene.tsx), which otherwise
        // has a perfectly sharp silhouette sitting on top of an animated,
        // rippling surface with no visual connection between the two.
        shadow-radius={6}
      />
      {/* The new rim/back light: fixed position, only color+intensity
          tweened, giving the avatar a consistent backlit edge across every
          time of day instead of reading flat. */}
      <directionalLight ref={rimRef} position={RIM_LIGHT_POSITION} />

      <group ref={sunGroupRef} scale={4}>
        <group rotation={SUN_FACE_CORRECTION}>
          <Sun materialRef={sunMaterialRef} />
        </group>
      </group>
      <group ref={moonGroupRef} scale={0.15}>
        <group rotation={MOON_FACE_CORRECTION}>
          <Moon materialRef={moonMaterialRef} />
        </group>
      </group>
      <group ref={starsGroupRef}>
        <Stars radius={100} depth={50} count={5000} factor={6} saturation={1} fade speed={2} />
        <Sparkles count={2000} scale={50} size={6} speed={1} opacity={0.1} color="white" />
       
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
