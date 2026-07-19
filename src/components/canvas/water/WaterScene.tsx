'use client'

import * as THREE from 'three'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useCubeTexture } from '@react-three/drei'

import { Water } from './lib/Water'
import { CausticsPass } from './lib/CausticsPass'
import { ObjectTexturePass } from './lib/ObjectTexturePass'
import { ScubaObjectModel } from './lib/ScubaObject'
import { createRoundedBoxPoolGeometry } from './lib/CreateRoundedBoxPoolGeometry'
import { useWaterInteraction, type WaterInteractionControls } from './useWaterInteraction'
import { ScubaMesh } from './ScubaMesh'
import { FRAME_SPACING } from '@/helpers/CameraHelpers'
import * as roundedBoxShader from './shaders/roundedBox'
import * as roundedBoxWaterAboveShader from './shaders/roundedBoxWaterAbove'
import * as roundedBoxWaterBelowShader from './shaders/roundedBoxWaterBelow'

const GRAVITY = new THREE.Vector3(0, -4, 0)

// The wave simulation damps velocity by 0.995 every step (waveSimulation.ts),
// so without continuous energy input the surface settles flat within a few
// seconds. These add a small random ripple at a steady cadence so the water
// stays visibly agitated indefinitely, rather than needing a user drag.
const AGITATION_INTERVAL = 0.15
const AGITATION_RADIUS = 0.035
const AGITATION_STRENGTH = 0.006

// Static pool configuration: no GUI, no shape switching, no pause -- this
// scene is permanently a Rounded Box pool sized to sit "underwater" behind
// the /portfolio Frame gallery (WaterScene renders with no wrapping
// transform, so it shares the Frames' coordinate space directly).
const CORNER_RADIUS = 0
const POOL_LENGTH = 3
// Card.tsx's default height is the golden ratio; Frame 4 (the last one)
// sits at y = -3 * FRAME_SPACING, so its bottom edge is that position minus
// half its height. Pool depth reaches exactly to that point (plus
// WATER_Y_OFFSET below, to compensate for the pool being shifted up).
const CARD_HEIGHT = 1.61803398875
// Mirrors /portfolio's <Canvas camera={{fov: 75}}> and Rig's fixed camera
// distance to the z=0 frame plane (CameraHelpers.tsx always positions the
// camera at z=2 looking at z=0 while paging between sections).
const CAMERA_FOV_DEG = 75
const CAMERA_DISTANCE_TO_FRAME_PLANE = 2
// "Slightly larger than the entire width of the screen."
const POOL_WIDTH_MARGIN = 1.05

// Moves the water surface up on screen (from dead center toward the top)
// by translating the pool+water assembly in world space, leaving the
// camera/Frame cards untouched (a level camera's horizon is invariant to
// the camera's own height above/below a plane, so shifting the camera
// can't move the water line at all). The water line's exact screen
// position isn't a simple linear projection -- it's governed by the
// custom shaders' own ray-traced reflection/refraction logic, and the
// "sky visible above the waterline" band collapses extremely fast as this
// grows (already gone past ~0.1) while intermediate values geometrically
// slice the translated water plane through Scuba's body (whose head sits
// close to the top of frame) and leave a visible gap. Past that collapse
// point, Scuba is entirely on the underwater side again and renders
// cleanly -- so this lands past the collapse (~5% or less of the screen
// reads as "above water") rather than at a fragile in-between value.
const WATER_Y_OFFSET = 1.4
// True world-space depth from the (unmoved) water surface at y=0 down to
// Frame 4's bottom edge -- used for anything that operates in real world
// space (Scuba's own shader, via modelMatrix; its physics/drag floor
// clamp). The pool mesh/water materials, by contrast, operate in
// pool-group-local space (see the wrapping <group> below) so *their*
// effective depth needs WATER_Y_OFFSET added back on top.
const POOL_FLOOR_DEPTH = 3 * FRAME_SPACING + CARD_HEIGHT / 2
const POOL_HEIGHT = POOL_FLOOR_DEPTH + WATER_Y_OFFSET

function createOpticsUniforms(lightDirection: THREE.Vector3, lightDirection2: THREE.Vector3) {
  return {
    light: { value: lightDirection.clone() },
    light2: { value: lightDirection2.clone() },
    sphereCenter: { value: new THREE.Vector3() },
    sphereRadius: { value: 0.25 },
    sphereEnabled: { value: false },
    cubeCenter: { value: new THREE.Vector3() },
    cubeHalfSize: { value: new THREE.Vector3(1, 1, 1) },
    cubeEnabled: { value: false },
    torusKnotCenter: { value: new THREE.Vector3() },
    torusKnotEnabled: { value: false },
    meshCenter: { value: new THREE.Vector3() },
    meshBoundingRadius: { value: 0 },
    meshShadowRadius: { value: 0 },
    meshEnabled: { value: false },
  }
}

// Reflection/refraction/clippedReflection textures and both projection
// matrices bind directly to ObjectTexturePass's own targets/matrices, once,
// here at creation time -- WebGLRenderTarget.texture keeps a stable identity
// across setSize()/re-renders, and ObjectTexturePass mutates its Matrix4
// instances in place via .multiplyMatrices(...) rather than reassigning
// them, so binding the same instance keeps the uniform in sync automatically
// as ObjectTexturePass.update() runs each frame.
function createWaterMaterial(
  vertexShader: string,
  fragmentShader: string,
  side: THREE.Side,
  lightDirection: THREE.Vector3,
  lightDirection2: THREE.Vector3,
  tileTexture: THREE.Texture,
  causticTexture: THREE.Texture,
  causticTexture2: THREE.Texture,
  cubemap: THREE.CubeTexture,
  objectTexturePass: ObjectTexturePass,
  includeClippedReflection: boolean,
  extraUniforms?: Record<string, THREE.IUniform>,
) {
  const uniforms: Record<string, THREE.IUniform> = {
    ...createOpticsUniforms(lightDirection, lightDirection2),
    tiles: { value: tileTexture },
    causticTex: { value: causticTexture },
    causticTex2: { value: causticTexture2 },
    objectReflectionTex: { value: objectTexturePass.reflectionTarget.texture },
    objectRefractionTex: { value: objectTexturePass.refractionTarget.texture },
    water: { value: null },
    sky: { value: cubemap },
    eye: { value: new THREE.Vector3() },
    viewProjectionMatrix: { value: objectTexturePass.viewProjectionMatrix },
    reflectionViewProjectionMatrix: { value: objectTexturePass.reflectionViewProjectionMatrix },
    ...extraUniforms,
  }
  if (includeClippedReflection) {
    uniforms.objectClippedReflectionTex = { value: objectTexturePass.clippedReflectionTarget.texture }
  }
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, side, depthTest: true, depthWrite: true })
}

export function WaterScene() {
  const { gl, camera: defaultCamera } = useThree()
  const camera = defaultCamera as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  const scene = useThree((state) => state.scene)

  const loadedTileTexture = useLoader(THREE.TextureLoader, '/water/blue.png')
  const loadedCubemap = useCubeTexture(['xpos.jpg', 'xneg.jpg', 'ypos.jpg', 'ypos.jpg', 'zpos.jpg', 'zneg.jpg'], {
    path: '/water/cubemap/',
  })

  // Clone rather than mutate the loader-cached textures directly: they may
  // be shared/reused elsewhere, and React Compiler forbids mutating a
  // hook's return value in place.
  const tileTexture = useMemo(() => {
    const texture = loadedTileTexture.clone()
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.needsUpdate = true
    return texture
  }, [loadedTileTexture])

  const cubemap = useMemo(() => {
    const texture = loadedCubemap.clone()
    texture.flipY = true
    texture.colorSpace = THREE.NoColorSpace
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
    return texture
  }, [loadedCubemap])

  const lightDirection = useMemo(() => new THREE.Vector3(2, 2, -1).normalize(), [])
  // Mirrored roughly opposite in the horizontal plane (still shining down
  // from above, like a second sun) so walls facing away from the first
  // light -- which previously rendered pitch black regardless of the
  // caustics texture, since diffuse = dot(light, normal) zeroed everything
  // out -- pick up their own caustics and diffuse lighting instead. Given
  // its own fully independent CausticsPass/texture below (rather than
  // trying to combine both lights into one texture via GPU blending) so
  // each light's caustic pattern can be sampled with its own correct
  // parallax offset -- no shared-texture ambiguity to get wrong.
  const lightDirection2 = useMemo(() => new THREE.Vector3(-2, 2, 1).normalize(), [])
  const water = useMemo(() => new Water(gl), [gl])
  const scuba = useMemo(() => new ScubaObjectModel(), [])

  // Constructed before CausticsPass: its material needs
  // objectTexturePass.shadowTarget.texture at construction time.
  const objectTexturePass = useMemo(() => new ObjectTexturePass(gl, lightDirection), [gl, lightDirection])

  const causticsPass = useMemo(
    () => new CausticsPass(gl, lightDirection, objectTexturePass.shadowTarget.texture),
    [gl, lightDirection, objectTexturePass],
  )
  // A second, fully independent instance for the second light -- simplest
  // and safest way to get a second caustic pattern without touching
  // CausticsPass's existing (working) single-light logic at all.
  const causticsPass2 = useMemo(
    () => new CausticsPass(gl, lightDirection2, objectTexturePass.shadowTarget.texture),
    [gl, lightDirection2, objectTexturePass],
  )

  // Half-width of the pool: half the visible width at the frame plane,
  // scaled up slightly so the pool is always a bit wider than the screen.
  // Recomputes on resize (window/canvas size is the only thing that can
  // change it -- fov and camera distance are both fixed).
  const poolWidth = useMemo(() => {
    const fovRad = THREE.MathUtils.degToRad(CAMERA_FOV_DEG)
    const visibleHeight = 2 * CAMERA_DISTANCE_TO_FRAME_PLANE * Math.tan(fovRad / 2)
    const visibleWidth = visibleHeight * (size.width / size.height)
    return (visibleWidth / 2) * POOL_WIDTH_MARGIN
  }, [size.width, size.height])

  // Bakes exact dimensions into vertex positions, so (unlike the materials
  // below) this must be fully regenerated whenever poolWidth changes.
  const poolGeometry = useMemo(
    () => createRoundedBoxPoolGeometry(CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH),
    [poolWidth],
  )
  useEffect(() => {
    return () => poolGeometry.dispose()
  }, [poolGeometry])

  const waterAboveGeometry = useMemo(() => new THREE.PlaneGeometry(2, 2, 200, 200), [])
  const waterBelowGeometry = useMemo(() => waterAboveGeometry.clone(), [waterAboveGeometry])

  // These only need their poolWidth *uniform* kept in sync on resize (done
  // in the per-frame loop below), not full recreation -- avoids a shader
  // recompile on every window resize.
  const poolMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: roundedBoxShader.vertexShader,
        fragmentShader: roundedBoxShader.fragmentShader,
        uniforms: {
          ...createOpticsUniforms(lightDirection, lightDirection2),
          tiles: { value: tileTexture },
          causticTex: { value: causticsPass.texture },
          causticTex2: { value: causticsPass2.texture },
          water: { value: null },
          cornerRadius: { value: CORNER_RADIUS },
          poolWidth: { value: poolWidth },
          poolHeight: { value: POOL_HEIGHT },
          poolLength: { value: POOL_LENGTH },
        },
        side: THREE.FrontSide,
        depthTest: true,
        depthWrite: true,
      }),
    // poolWidth intentionally omitted: only used for this material's
    // initial uniform value, kept in sync afterward via useFrame below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lightDirection, lightDirection2, tileTexture, causticsPass, causticsPass2],
  )

  const waterAboveMaterial = useMemo(
    () =>
      createWaterMaterial(
        roundedBoxWaterAboveShader.vertexShader,
        roundedBoxWaterAboveShader.fragmentShader,
        THREE.BackSide,
        lightDirection,
        lightDirection2,
        tileTexture,
        causticsPass.texture,
        causticsPass2.texture,
        cubemap,
        objectTexturePass,
        true,
        { cornerRadius: { value: CORNER_RADIUS }, poolWidth: { value: poolWidth }, poolHeight: { value: POOL_HEIGHT }, poolLength: { value: POOL_LENGTH } },
      ),
    // poolWidth intentionally omitted -- see poolMaterial's note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lightDirection, lightDirection2, tileTexture, causticsPass, causticsPass2, cubemap, objectTexturePass],
  )

  const waterBelowMaterial = useMemo(
    () =>
      createWaterMaterial(
        roundedBoxWaterBelowShader.vertexShader,
        roundedBoxWaterBelowShader.fragmentShader,
        THREE.FrontSide,
        lightDirection,
        lightDirection2,
        tileTexture,
        causticsPass.texture,
        causticsPass2.texture,
        cubemap,
        objectTexturePass,
        false,
        { cornerRadius: { value: CORNER_RADIUS }, poolWidth: { value: poolWidth }, poolHeight: { value: POOL_HEIGHT }, poolLength: { value: POOL_LENGTH } },
      ),
    // poolWidth intentionally omitted -- see poolMaterial's note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lightDirection, lightDirection2, tileTexture, causticsPass, causticsPass2, cubemap, objectTexturePass],
  )

  const poolMeshRef = useRef<THREE.Mesh>(null)
  const waterAboveMeshRef = useRef<THREE.Mesh>(null)
  const waterBelowMeshRef = useRef<THREE.Mesh>(null)
  const scubaGroupRef = useRef<THREE.Group>(null)

  // Dispose owned GPU resources on unmount -- a necessary addition, since
  // (unlike the source's single-page app) this scene can mount/unmount via
  // client-side navigation.
  useEffect(() => {
    return () => {
      water.dispose()
      objectTexturePass.dispose()
      causticsPass.dispose()
      causticsPass2.dispose()
      tileTexture.dispose()
      cubemap.dispose()
      waterAboveGeometry.dispose()
      waterBelowGeometry.dispose()
      poolMaterial.dispose()
      waterAboveMaterial.dispose()
      waterBelowMaterial.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Object is permanently Scuba -- enable it once on mount.
  useEffect(() => {
    scuba.setEnabled(true, water)
    water.updateNormals(poolWidth, POOL_LENGTH)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Seed a handful of ambient ripples on mount so the pool isn't perfectly
  // flat at load, matching the source's WaterApp.init() seedWater().
  useEffect(() => {
    for (let i = 0; i < 20; i++) {
      water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, i % 2 === 0 ? -0.01 : 0.01, poolWidth, POOL_LENGTH)
    }
    water.updateNormals(poolWidth, POOL_LENGTH)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ObjectTexturePass's reflection/refraction/clippedReflection targets are
  // capped-at-1024 scaled copies of the canvas size.
  useEffect(() => {
    objectTexturePass.setSize(size.width, size.height)
  }, [objectTexturePass, size.width, size.height])

  // CausticsPass defaults to its Box material/±1 ortho camera bounds until
  // told otherwise -- this pool is permanently the Rounded Box shape, so it
  // must be switched over once (and again whenever poolWidth changes on
  // resize, since the ortho camera bounds are derived from it).
  useEffect(() => {
    causticsPass.setPoolShape('Rounded Box', CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH)
    causticsPass2.setPoolShape('Rounded Box', CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH)
  }, [causticsPass, causticsPass2, poolWidth])

  // Stable proxy read by the interaction hook (constructed once): poolWidth
  // itself changes on resize, so a ref kept in sync via effect is needed
  // rather than capturing the value directly in a one-time closure (refs
  // can't be written during render).
  const poolWidthRef = useRef(poolWidth)
  useEffect(() => {
    poolWidthRef.current = poolWidth
  }, [poolWidth])

  const interactionControls = useMemo<WaterInteractionControls>(
    () => ({
      get poolWidth() {
        return poolWidthRef.current
      },
      poolHeight: POOL_FLOOR_DEPTH,
      poolLength: POOL_LENGTH,
      waterSurfaceY: WATER_Y_OFFSET,
    }),
    [],
  )

  const interaction = useWaterInteraction({
    canvas: gl.domElement,
    camera,
    water,
    objects: [scuba],
    controls: interactionControls,
  })

  const eye = useMemo(() => new THREE.Vector3(), [])
  const agitationTimer = useRef(0)

  useFrame((_state, delta) => {
    const poolMat = poolMeshRef.current?.material as THREE.ShaderMaterial | undefined
    const waterAboveMat = waterAboveMeshRef.current?.material as THREE.ShaderMaterial | undefined
    const waterBelowMat = waterBelowMeshRef.current?.material as THREE.ShaderMaterial | undefined
    if (!poolMat || !waterAboveMat || !waterBelowMat) return

    // The portfolio's Rig scrolls the camera down through the pool rather
    // than moving Scuba, but the diver should stay anchored mid-screen
    // throughout -- worldPosition (used below for rendering/optics) folds
    // this in without disturbing the physics-local `position`.
    scuba.setCameraAnchorY(camera.position.y)

    objectTexturePass.setPoolBounds(poolWidth, POOL_LENGTH)

    scuba.update(
      delta,
      {
        dragging: interaction.draggingObject,
        physicsEnabled: false,
        densityEnabled: false,
        density: 0.9,
        gravity: GRAVITY,
        poolWidth,
        poolHeight: POOL_FLOOR_DEPTH,
        poolLength: POOL_LENGTH,
      },
      water,
    )

    agitationTimer.current += delta
    if (agitationTimer.current > AGITATION_INTERVAL) {
      agitationTimer.current -= AGITATION_INTERVAL
      const strength = Math.random() < 0.5 ? -AGITATION_STRENGTH : AGITATION_STRENGTH
      water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, AGITATION_RADIUS, strength, poolWidth, POOL_LENGTH)
    }

    water.stepSimulation(poolWidth, POOL_LENGTH)
    water.stepSimulation(poolWidth, POOL_LENGTH)
    water.updateNormals(poolWidth, POOL_LENGTH)
    const waterTexture = water.textureA.texture

    // All per-frame uniforms (water texture, light, position) must be
    // synced onto every material -- including Scuba's own -- *before*
    // causticsPass.update()/objectTexturePass.update() run below, since
    // those passes render the real scene/mesh objects using whatever
    // uniform values are currently set on their materials.
    const scubaWorldPosition = scuba.worldPosition
    // The pool mesh/water materials' vPosition is raw local-space geometry
    // (never multiplied by modelMatrix -- see roundedBox.ts/roundedBoxWater.ts),
    // and the pool+water group is translated up by WATER_Y_OFFSET (see the
    // JSX below), so anything compared against vPosition inside those
    // shaders (meshCenter, eye) must be expressed in that same pool-local
    // space: true world value minus the group's offset.
    const scubaLocalPosition = scubaWorldPosition.clone()
    scubaLocalPosition.y -= WATER_Y_OFFSET

    poolMat.uniforms.water.value = waterTexture
    poolMat.uniforms.light.value.copy(lightDirection)
    poolMat.uniforms.light2.value.copy(lightDirection2)
    poolMat.uniforms.poolWidth.value = poolWidth
    poolMat.uniforms.meshEnabled.value = scuba.enabled
    poolMat.uniforms.meshCenter.value.copy(scubaLocalPosition)
    poolMat.uniforms.meshBoundingRadius.value = scuba.boundingRadius
    poolMat.uniforms.meshShadowRadius.value = scuba.boundingRadius

    camera.getWorldPosition(eye)
    eye.setY(eye.y - WATER_Y_OFFSET)
    for (const material of [waterAboveMat, waterBelowMat]) {
      material.uniforms.water.value = waterTexture
      material.uniforms.light.value.copy(lightDirection)
      material.uniforms.light2.value.copy(lightDirection2)
      material.uniforms.eye.value.copy(eye)
      material.uniforms.poolWidth.value = poolWidth
      material.uniforms.meshEnabled.value = scuba.enabled
      material.uniforms.meshCenter.value.copy(scubaLocalPosition)
      material.uniforms.meshBoundingRadius.value = scuba.boundingRadius
      material.uniforms.meshShadowRadius.value = scuba.boundingRadius
    }

    const scubaGroup = scubaGroupRef.current
    if (scubaGroup) {
      // Scuba is *not* inside the translated pool group, and its own shader
      // uses modelMatrix (true world space, see scubaRender.ts) -- it stays
      // on the true, un-offset world position.
      scubaGroup.position.copy(scubaWorldPosition)
      scubaGroup.visible = scuba.enabled

      let scubaMat: THREE.ShaderMaterial | undefined
      scubaGroup.traverse((child) => {
        if (!scubaMat && child instanceof THREE.Mesh && child.material instanceof THREE.ShaderMaterial) {
          scubaMat = child.material
        }
      })
      if (scubaMat) {
        scubaMat.uniforms.water.value = waterTexture
        scubaMat.uniforms.light.value.copy(lightDirection)
        scubaMat.uniforms.poolWidth.value = poolWidth
        scubaMat.uniforms.poolHeight.value = POOL_FLOOR_DEPTH
        scubaMat.uniforms.poolLength.value = POOL_LENGTH
      }
    }

    causticsPass.update(water, lightDirection, {
      sphereEnabled: false,
      sphereCenter: scubaLocalPosition,
      sphereRadius: 0,
      meshEnabled: scuba.enabled,
      meshCenter: scubaLocalPosition,
      meshBoundingRadius: scuba.boundingRadius,
    })
    // meshEnabled forced false here: ObjectTexturePass's shadow map (sampled
    // via objectShadowTex) is rendered against the *primary* light's own
    // projection only (see ObjectTexturePass's single lightDirection), so
    // sampling it with light2's own refraction offset would look up the
    // wrong location entirely. Scuba's shadow stays tied to the primary
    // light; this second pass only contributes open-water caustics.
    causticsPass2.update(water, lightDirection2, {
      sphereEnabled: false,
      sphereCenter: scubaLocalPosition,
      sphereRadius: 0,
      meshEnabled: false,
      meshCenter: scubaLocalPosition,
      meshBoundingRadius: scuba.boundingRadius,
    })
    objectTexturePass.update(scene, camera, scuba.enabled ? scubaGroup : null)
  })

  return (
    <>
      {/* Shifts the whole pool+water assembly up so the water surface reads
          near the top of the screen instead of dead center (see
          WATER_Y_OFFSET above) -- Scuba stays outside this group since its
          own shader already works in true world space. */}
      <group position={[0, WATER_Y_OFFSET, 0]}>
        <mesh ref={poolMeshRef} geometry={poolGeometry} material={poolMaterial} frustumCulled={false} />
        <mesh ref={waterAboveMeshRef} geometry={waterAboveGeometry} material={waterAboveMaterial} frustumCulled={false} />
        <mesh ref={waterBelowMeshRef} geometry={waterBelowGeometry} material={waterBelowMaterial} frustumCulled={false} />
      </group>
      <Suspense fallback={null}>
        <ScubaMesh ref={scubaGroupRef} lightDirection={lightDirection} causticTexture={causticsPass.texture} />
      </Suspense>
    </>
  )
}
