"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
// NOT drei's <Sky> -- the sky here is the custom two-colour smoothstep dome
// below. (That import was dead and has been removed.)
import { Stars, Sparkles } from "@react-three/drei"
import gsap from "gsap"

import { PRESETS, TRANSITION_SECONDS, type TimeOfDay, type EnvironmentBlend } from "./environmentPresets"
import { ISLAND_CAMERA_POSITION } from "@/config/positions"
import { Sun } from "@/components/models/Sun"
import { Moon } from "@/components/models/Moon"
import { Campfire } from "@/components/models/Campfire"
import { DeadCampfire } from "@/components/models/DeadCampfire"
import { Aurora } from "./Aurora"
import { tweenDuration } from "@/helpers/motion"
import { sunState } from "@/helpers/sunTracker"

// dirX/dirY/dirZ describe a DIRECTION, but a directionalLight takes a
// position, and the presets' own vectors range from 31 to 49 units long. That
// spread used to travel straight into the shadow camera's depth range, so the
// depth precision -- and therefore the bias needed to avoid acne -- changed
// with the time of day. Renormalising to one fixed distance every frame makes
// the shadow frustum's near/far bracket identical in all four phases, which is
// what lets near/far be pinned tight below. Nothing downstream can tell:
// shading depends only on direction, and OceanWater.ts normalises the same
// three fields itself for uSunDirection.
const KEY_DISTANCE = 75
// Half-width of the key's orthographic shadow frustum -- the bounding radius
// of everything that actually casts (the main island, the dock, the upper
// island, the left tree, the moon island). The old +/-60 spent most of a
// 1024 map on empty ocean.
const SHADOW_EXTENT = 26
// The shadow frustum is centred on the light's target, and a directionalLight
// targets the world origin by default -- but the island group sits at y = -5.5
// (see Scene.tsx's <Merged>), so the box used to be aimed well above the
// geometry it was meant to bracket.
const SHADOW_TARGET_POSITION: [number, number, number] = [0, -4, 0]
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
// The campfire uses a Schmitt trigger (two thresholds), not one, because a
// single threshold on a linearly-tweened value can only ever fire at a fixed
// FRACTION of a transition -- and the fraction that's right in one direction
// is wrong in the other. Day's campfireIntensity is 0 and evening's is 3, so
// one threshold at 0.5 lit the fire 17% into the day->evening blend: barely
// past noon, with the sun still high. Raising that single number to fix it
// would have put the fire out almost immediately during dawn->day instead,
// where 0.5 is currently right.
//
// So: it takes a real dusk to CATCH (2.6, ~87% of the way into evening), but
// once lit it keeps burning down to embers (CAMPFIRE_LIT_THRESHOLD above)
// before going out. That leaves dawn lit and the dawn->day burn-out timing
// exactly as they were, and only delays the evening ignition.
const CAMPFIRE_IGNITE_THRESHOLD = 2.6
// How fast the campfire's light eases toward its lit/unlit target, in
// THREE.MathUtils.damp lambda terms (~1s to close most of the gap). Without
// this the light would snap on at ignition, since by then the tweened value
// is already most of the way to full.
const CAMPFIRE_GLOW_DAMP = 2.5

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

  useEffect(() => {
    const key = dirRef.current
    if (!key) return

    // Aim the key's shadow frustum at the island rather than the world origin
    // (the default). Done here rather than as a prop because both objects have
    // to exist first, and it only needs doing once.
    if (shadowTargetRef.current) key.target = shadowTargetRef.current

    // REQUIRED, and the reason the shadow-camera-* props above did nothing
    // before this. r3f's applyProps happily writes light.shadow.camera.left,
    // .near and so on, but it only ever calls updateProjectionMatrix() for the
    // Canvas's own default camera -- never for a nested prop path like
    // shadow-camera-far. three doesn't rescue that either: LightShadow
    // .updateMatrices reads shadowCamera.projectionMatrix as-is every frame
    // and never rebuilds it.
    //
    // So the fields were being set and then ignored, and every shadow in this
    // scene was still being rendered through DirectionalLightShadow's
    // constructor default -- a +/-5 orthographic box at the world origin. With
    // the island group sitting at y = -5.5 and spanning ~20 units, that box
    // covered a small patch of the middle of the scene and nothing else, which
    // is why so much of the island had no cast shadow at all regardless of
    // what the props said.
    key.shadow.camera.updateProjectionMatrix()
  }, [])

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
  const fillRef = useRef<THREE.DirectionalLight>(null)
  const kickRef = useRef<THREE.DirectionalLight>(null)
  const shadowTargetRef = useRef<THREE.Object3D>(null)
  const campfireLightRef = useRef<THREE.PointLight>(null)
  // Seeded from the phase we're mounting into, using the LOW threshold: the
  // delayed ignition is about transitions, so landing directly on a phase
  // where the fire belongs lit (dawn's embers, evening, night) should just
  // start lit rather than wait for a rise that already happened.
  const campfireLitRef = useRef(PRESETS[from].campfireIntensity > CAMPFIRE_LIT_THRESHOLD)
  const campfireGlowRef = useRef(campfireLitRef.current ? PRESETS[from].campfireIntensity : 0)
  // Scratch vector, reused every frame rather than allocated -- same pattern
  // as OceanWater.ts.
  const keyDir = useRef(new THREE.Vector3())
  const sunGroupRef = useRef<THREE.Group>(null)
  const moonGroupRef = useRef<THREE.Group>(null)
  const sunMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const moonMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const starsGroupRef = useRef<THREE.Group>(null)
  const auroraMaterialRef = useRef<THREE.ShaderMaterial>(null)
  const litCampfireRef = useRef<THREE.Group>(null)
  const deadCampfireRef = useRef<THREE.Group>(null)

  useFrame((state, delta) => {
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
    // KEY -- the sun/moon, and the only shadow caster in the scene.
    if (dirRef.current) {
      dirRef.current.color.set(b.dirColor)
      dirRef.current.intensity = b.dirIntensity
      keyDir.current.set(b.dirX, b.dirY, b.dirZ).normalize().multiplyScalar(KEY_DISTANCE)
      dirRef.current.position.copy(keyDir.current)
    }
    // FILL -- camera side, opposite the key. No shadow: a fill that casts one
    // isn't a fill any more, it's a second key.
    if (fillRef.current) {
      fillRef.current.color.set(b.fillColor)
      fillRef.current.intensity = b.fillIntensity
      fillRef.current.position.set(b.fillX, b.fillY, b.fillZ)
    }
    // RIM -- behind, and now on the opposite side of frame from the key.
    if (rimRef.current) {
      rimRef.current.color.set(b.rimColor)
      rimRef.current.intensity = b.rimIntensity
      rimRef.current.position.set(b.rimX, b.rimY, b.rimZ)
    }
    // KICK -- low front quarter on the key's side; sand/water bounce.
    if (kickRef.current) {
      kickRef.current.color.set(b.kickColor)
      kickRef.current.intensity = b.kickIntensity
      kickRef.current.position.set(b.kickX, b.kickY, b.kickZ)
    }
    // Apparent exposure. This still reaches the image even though
    // <EffectComposer> pins renderer.toneMapping to NoToneMapping, because the
    // two are independent: the <ToneMapping> effect in page.tsx compiles
    // three's own tonemapping_pars_fragment chunk, which declares
    // `uniform float toneMappingExposure`, and WebGLRenderer.setProgram pushes
    // this value into it. Environment's useFrame runs at the default priority
    // 0 and the composer subscribes at 1, so this lands before the render.
    state.gl.toneMappingExposure = b.exposure
    // Two thresholds, picked by which state we're currently in -- see
    // CAMPFIRE_IGNITE_THRESHOLD. Evaluated before the light below so the glow
    // can follow it.
    campfireLitRef.current = campfireLitRef.current
      ? b.campfireIntensity > CAMPFIRE_LIT_THRESHOLD
      : b.campfireIntensity > CAMPFIRE_IGNITE_THRESHOLD

    if (campfireLightRef.current) {
      campfireLightRef.current.color.set(b.campfireColor)
      // Driven off the lit state, not the raw blend: otherwise the fire pit
      // would cast a growing orange glow through the whole back half of the
      // afternoon with no flame in it to explain the light.
      campfireGlowRef.current = THREE.MathUtils.damp(
        campfireGlowRef.current,
        campfireLitRef.current ? b.campfireIntensity : 0,
        CAMPFIRE_GLOW_DAMP,
        delta,
      )
      campfireLightRef.current.intensity = campfireGlowRef.current
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
      // Hand the sun's live position (and how much glare it should throw) to
      // SunFlare.tsx, which is mounted in page.tsx's <EffectComposer> --
      // outside the <Suspense> this component lives in, so a module-level
      // singleton is the cheapest bridge. See helpers/sunTracker.ts.
      sunState.position.copy(sunGroupRef.current.position)
      sunState.flare = b.flareOpacity
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

    const lit = campfireLitRef.current
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

      {/* A four-role cinematic rig: key, fill, rim, kick. Every position,
          colour and intensity below comes from the tweened blend in useFrame
          -- the initial values here are only what the light holds for the
          first frame before that runs. */}
      <ambientLight ref={ambientRef} />
      <hemisphereLight ref={hemiRef} />

      {/* KEY */}
      <directionalLight
        ref={dirRef}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        // Only pinnable this tight because KEY_DISTANCE fixes how far away
        // the light sits. A 64-unit depth range instead of the default
        // 0.5..500 buys roughly 8x the depth precision per unit of bias.
        shadow-camera-near={KEY_DISTANCE - SHADOW_EXTENT - 6}
        shadow-camera-far={KEY_DISTANCE + SHADOW_EXTENT + 6}
        // Sign matters and is easy to get backwards: r185's PCF path does
        // `shadowCoord.z += shadowBias` against a LEQUAL sampler2DShadow, so
        // NEGATIVE is what pushes the comparison out of self-shadowing.
        shadow-bias={-0.0006}
        // World units, and the main defence against acne here. At dawn's ~30
        // degree key elevation a ground texel stretches to 0.0254 / sin(30) =
        // 0.051 units, which is exactly the acne threshold; 0.05 covers a
        // grazing sun without visibly detaching contact shadows (detachment
        // works out to ~0.087 units, comfortably inside the ~0.20 unit
        // penumbra from shadow-radius below).
        shadow-normalBias={0.05}
        // Softness. NOTE this scales a TEXEL-sized disk, so it is not
        // comparable to its old value: 6 x 0.117 u/texel was a 0.70 unit
        // blur, while 5 x 0.0254 is 0.13 units. Kept deliberately tight --
        // the whole complaint was that hard shadows were missing, and
        // spreading the same amount of darkening over a wider penumbra is
        // exactly what makes a shadow read as a smudge instead of a shape.
        // Don't push past ~12 either way: r185 filters with a 5-sample Vogel
        // disk rotated per pixel by interleaved gradient noise, and with no
        // TAA to resolve it a wide radius reads as dither, not softness.
        shadow-radius={5}
      />
      {/* three only recomputes target.matrixWorld for a target that's in the
          scene graph, so this has to be rendered, not just constructed. */}
      <object3D ref={shadowTargetRef} position={SHADOW_TARGET_POSITION} />

      {/* FILL */}
      <directionalLight ref={fillRef} />
      {/* RIM / back light -- position is preset-driven (see rimX/rimY/rimZ in
          environmentPresets.ts), because a single fixed position sat on the
          same side of frame as the key during evening and gave no separation
          at all. */}
      <directionalLight ref={rimRef} />
      {/* KICK */}
      <directionalLight ref={kickRef} />

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
