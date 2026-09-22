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
import { FRAME_COUNT, FRAME_SPACING } from '@/helpers/CameraHelpers'
import * as roundedBoxShader from './shaders/roundedBox'
import * as roundedBoxWaterAboveShader from './shaders/roundedBoxWaterAbove'
import * as roundedBoxWaterBelowShader from './shaders/roundedBoxWaterBelow'

const GRAVITY = new THREE.Vector3(0, -4, 0)

const AGITATION_INTERVAL = 0.15
const AGITATION_RADIUS = 0.035
const AGITATION_STRENGTH = 0.006

const CORNER_RADIUS = 0
const CARD_HEIGHT = 1.61803398875
const CAMERA_FOV_DEG = 75
const CAMERA_DISTANCE_TO_FRAME_PLANE = 2
const POOL_WIDTH_MARGIN = 1.05
const POOL_WIDTH_SCALE = 2
const POOL_DEPTH_EXTRA = 1

// The pool as /portfolio wants it: as wide as the viewport, as deep as the
// four-card column is tall. These are the DEFAULTS now rather than the only
// possible values, because the Models portal shows this same scene through a
// 1.5 x 2.43 aperture and a 17.6-unit pool would show one arbitrary band of
// itself. Every one of them is unchanged from what the page computed before,
// so /portfolio gets exactly the pool it had.
const PAGE_POOL_LENGTH = 3
const PAGE_WATER_Y_OFFSET = 1.4
const PAGE_POOL_FLOOR_DEPTH = (FRAME_COUNT - 1) * FRAME_SPACING + CARD_HEIGHT / 2

/** How big the offscreen passes are. The page renders this full-screen and
 *  wants the detail; a portal shows it through a small window at a distance,
 *  where 1024-square caustics buy nothing anyone can see. */
export type WaterQuality = "full" | "portal"
const CAUSTICS_SIZE: Record<WaterQuality, number> = { full: 1024, portal: 256 }

export interface WaterSceneProps {
  /** Overrides the viewport-derived width. */
  poolWidth?: number
  poolLength?: number
  /** Distance from the water surface down to the floor. */
  poolFloorDepth?: number
  /** How far above the origin the water surface sits. */
  waterYOffset?: number
  quality?: WaterQuality
  /** Whether the simulation and its offscreen passes run each frame.
   *
   *  False leaves the water DRAWN but still: the pool, the surface and the tiles
   *  all render, and the camera-dependent uniforms keep updating, but the three
   *  simulation steps, the two caustics passes and the object-texture pass stop.
   *
   *  This exists because HotspotPortal's room wakes on `interactive` -- merely
   *  parking at the Models viewpoint -- not on `open`. Measured there: the
   *  median frame went from 838ms to 1156ms with the water simulating, a 38%
   *  cost for something you are looking at through a 1.5-unit window and have
   *  not entered. Unmounting it instead would leave the portal face empty as
   *  you approach, which is the one thing a portal must not be. */
  active?: boolean
}

/** Frames of simulation to run before going idle, so the surface has normals
 *  and the caustics texture has content rather than being flat. */
const WARMUP_FRAMES = 12

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

export function WaterScene({
  poolWidth: poolWidthProp,
  poolLength: poolLengthProp,
  poolFloorDepth: poolFloorDepthProp,
  waterYOffset: waterYOffsetProp,
  quality = "full",
  active = true,
}: WaterSceneProps = {}) {
  // Shadowing the old module constants by name, so the several dozen uses
  // below read exactly as they did.
  const POOL_LENGTH = poolLengthProp ?? PAGE_POOL_LENGTH
  const WATER_Y_OFFSET = waterYOffsetProp ?? PAGE_WATER_Y_OFFSET
  const POOL_FLOOR_DEPTH = poolFloorDepthProp ?? PAGE_POOL_FLOOR_DEPTH
  const POOL_HEIGHT = POOL_FLOOR_DEPTH + WATER_Y_OFFSET + POOL_DEPTH_EXTRA

  const { gl, camera: defaultCamera } = useThree()
  const camera = defaultCamera as THREE.PerspectiveCamera
  const size = useThree((state) => state.size)
  const scene = useThree((state) => state.scene)

  const loadedTileTexture = useLoader(THREE.TextureLoader, '/water/tiles_cream.png')
  const loadedCubemap = useCubeTexture(['xpos.jpg', 'xneg.jpg', 'ypos.jpg', 'ypos.jpg', 'zpos.jpg', 'zneg.jpg'], {
    path: '/water/cubemap/',
  })

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
  const lightDirection2 = useMemo(() => new THREE.Vector3(-2, 2, 1).normalize(), [])
  const water = useMemo(() => new Water(gl), [gl])
  const scuba = useMemo(() => new ScubaObjectModel(), [])

  const objectTexturePass = useMemo(() => new ObjectTexturePass(gl, lightDirection), [gl, lightDirection])

  const causticsSize = CAUSTICS_SIZE[quality]
  const causticsPass = useMemo(
    () => new CausticsPass(gl, lightDirection, objectTexturePass.shadowTarget.texture, causticsSize),
    [gl, lightDirection, objectTexturePass, causticsSize],
  )
  const causticsPass2 = useMemo(
    () => new CausticsPass(gl, lightDirection2, objectTexturePass.shadowTarget.texture, causticsSize),
    [gl, lightDirection2, objectTexturePass, causticsSize],
  )

  const poolWidth = useMemo(() => {
    if (poolWidthProp !== undefined) return poolWidthProp
    const fovRad = THREE.MathUtils.degToRad(CAMERA_FOV_DEG)
    const visibleHeight = 2 * CAMERA_DISTANCE_TO_FRAME_PLANE * Math.tan(fovRad / 2)
    const visibleWidth = visibleHeight * (size.width / size.height)
    return (visibleWidth / 2) * POOL_WIDTH_MARGIN * POOL_WIDTH_SCALE
  }, [size.width, size.height, poolWidthProp])

  const poolGeometry = useMemo(
    () => createRoundedBoxPoolGeometry(CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH),
    [poolWidth, POOL_HEIGHT, POOL_LENGTH],
  )
  useEffect(() => {
    return () => poolGeometry.dispose()
  }, [poolGeometry])

  const waterAboveGeometry = useMemo(() => new THREE.PlaneGeometry(2, 2, 200, 200), [])
  const waterBelowGeometry = useMemo(() => waterAboveGeometry.clone(), [waterAboveGeometry])

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
    [lightDirection, lightDirection2, tileTexture, causticsPass, causticsPass2, poolWidth, POOL_HEIGHT, POOL_LENGTH],
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
    [lightDirection, lightDirection2, tileTexture, causticsPass, causticsPass2, cubemap, objectTexturePass, poolWidth, POOL_HEIGHT, POOL_LENGTH],
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
    [lightDirection, lightDirection2, tileTexture, causticsPass, causticsPass2, cubemap, objectTexturePass, poolWidth, POOL_HEIGHT, POOL_LENGTH],
  )

  const poolMeshRef = useRef<THREE.Mesh>(null)
  const waterAboveMeshRef = useRef<THREE.Mesh>(null)
  const waterBelowMeshRef = useRef<THREE.Mesh>(null)
  const scubaGroupRef = useRef<THREE.Group>(null)

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
  }, [])

  useEffect(() => {
    // The scuba figure used to be switched on here, and the mesh mounted at the
    // bottom of the JSX. Both are gone -- it was a diver floating in a portal
    // that is about to hold the work instead.
    //
    // Leaving `scuba` itself in place, disabled, rather than tearing out the
    // dozen uniform writes that reference it: ScubaObjectModel starts
    // `enabled = false`, its update() early-returns, every `meshEnabled`
    // uniform goes false, and ObjectTexturePass is handed null. The shader path
    // for a submerged object stays intact and unused, which is what you want
    // when something else is going in the water shortly.
    water.updateNormals(poolWidth, POOL_LENGTH)
  }, [])

  useEffect(() => {
    for (let i = 0; i < 20; i++) {
      water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, i % 2 === 0 ? -0.01 : 0.01, poolWidth, POOL_LENGTH)
    }
    water.updateNormals(poolWidth, POOL_LENGTH)
  }, [])

  useEffect(() => {
    // Full canvas resolution, in the portal too.
    //
    // This used to cap at 512 on the grounds that a 1.5-unit window did not
    // need more. It does: once you are INSIDE the portal that window fills the
    // screen, and these are the reflection and refraction targets the water
    // surface samples -- capping them is exactly what made the sky above the
    // surface render as blocks. The budget comes from the four card portals
    // that used to render their own targets in here and no longer do.
    objectTexturePass.setSize(size.width, size.height)
  }, [objectTexturePass, size.width, size.height])

  useEffect(() => {
    causticsPass.setPoolShape('Rounded Box', CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH)
    causticsPass2.setPoolShape('Rounded Box', CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH)
  }, [causticsPass, causticsPass2, poolWidth, POOL_HEIGHT, POOL_LENGTH])

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
    [POOL_FLOOR_DEPTH, POOL_LENGTH, WATER_Y_OFFSET],
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
  const causticsPass2Parity = useRef(false)
  const warmup = useRef(0)

  useFrame((_state, delta) => {
    const poolMat = poolMeshRef.current?.material as THREE.ShaderMaterial | undefined
    const waterAboveMat = waterAboveMeshRef.current?.material as THREE.ShaderMaterial | undefined
    const waterBelowMat = waterBelowMeshRef.current?.material as THREE.ShaderMaterial | undefined
    if (!poolMat || !waterAboveMat || !waterBelowMat) return

    scuba.setCameraAnchorY(camera.position.y)

    objectTexturePass.setPoolBounds(poolWidth, POOL_LENGTH)

    // Everything below the uniform writes is the expensive half -- see `active`.
    if (warmup.current < WARMUP_FRAMES) warmup.current++
    const simulating = active || warmup.current < WARMUP_FRAMES

    if (simulating) {
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
    }
    const waterTexture = water.textureA.texture

    const scubaWorldPosition = scuba.worldPosition
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

    if (simulating) {
      causticsPass.update(water, lightDirection, {
        sphereEnabled: false,
        sphereCenter: scubaLocalPosition,
        sphereRadius: 0,
        meshEnabled: scuba.enabled,
        meshCenter: scubaLocalPosition,
        meshBoundingRadius: scuba.boundingRadius,
      })
      causticsPass2Parity.current = !causticsPass2Parity.current
      if (causticsPass2Parity.current) {
        causticsPass2.update(water, lightDirection2, {
          sphereEnabled: false,
          sphereCenter: scubaLocalPosition,
          sphereRadius: 0,
          meshEnabled: false,
          meshCenter: scubaLocalPosition,
          meshBoundingRadius: scuba.boundingRadius,
        })
      }
      objectTexturePass.update(scene, camera, scuba.enabled ? scubaGroup : null)
    }
  })

  return (
    <>
      <group position={[0, WATER_Y_OFFSET, 0]}>
        <mesh ref={poolMeshRef} geometry={poolGeometry} material={poolMaterial} frustumCulled={false} />
        <mesh ref={waterAboveMeshRef} geometry={waterAboveGeometry} material={waterAboveMaterial} frustumCulled={false} />
        <mesh ref={waterBelowMeshRef} geometry={waterBelowGeometry} material={waterBelowMaterial} frustumCulled={false} />
      </group>
    </>
  )
}
