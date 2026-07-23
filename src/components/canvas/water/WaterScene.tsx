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
import { FRAME_COUNT, FRAME_SPACING } from '@/helpers/CameraHelpers'
import * as roundedBoxShader from './shaders/roundedBox'
import * as roundedBoxWaterAboveShader from './shaders/roundedBoxWaterAbove'
import * as roundedBoxWaterBelowShader from './shaders/roundedBoxWaterBelow'

const GRAVITY = new THREE.Vector3(0, -4, 0)

const AGITATION_INTERVAL = 0.15
const AGITATION_RADIUS = 0.035
const AGITATION_STRENGTH = 0.006

const CORNER_RADIUS = 0
const POOL_LENGTH = 3
const CARD_HEIGHT = 1.61803398875
const CAMERA_FOV_DEG = 75
const CAMERA_DISTANCE_TO_FRAME_PLANE = 2
const POOL_WIDTH_MARGIN = 1.05
const POOL_WIDTH_SCALE = 2

const WATER_Y_OFFSET = 1.4
const POOL_FLOOR_DEPTH = (FRAME_COUNT - 1) * FRAME_SPACING + CARD_HEIGHT / 2
const POOL_DEPTH_EXTRA = 1
const POOL_HEIGHT = POOL_FLOOR_DEPTH + WATER_Y_OFFSET + POOL_DEPTH_EXTRA

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

export function WaterScene() {
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

  const causticsPass = useMemo(
    () => new CausticsPass(gl, lightDirection, objectTexturePass.shadowTarget.texture),
    [gl, lightDirection, objectTexturePass],
  )
  const causticsPass2 = useMemo(
    () => new CausticsPass(gl, lightDirection2, objectTexturePass.shadowTarget.texture),
    [gl, lightDirection2, objectTexturePass],
  )

  const poolWidth = useMemo(() => {
    const fovRad = THREE.MathUtils.degToRad(CAMERA_FOV_DEG)
    const visibleHeight = 2 * CAMERA_DISTANCE_TO_FRAME_PLANE * Math.tan(fovRad / 2)
    const visibleWidth = visibleHeight * (size.width / size.height)
    return (visibleWidth / 2) * POOL_WIDTH_MARGIN * POOL_WIDTH_SCALE
  }, [size.width, size.height])

  const poolGeometry = useMemo(
    () => createRoundedBoxPoolGeometry(CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH),
    [poolWidth],
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
    [lightDirection, lightDirection2, tileTexture, causticsPass, causticsPass2, cubemap, objectTexturePass],
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
    scuba.setEnabled(true, water)
    water.updateNormals(poolWidth, POOL_LENGTH)
  }, [])

  useEffect(() => {
    for (let i = 0; i < 20; i++) {
      water.addDrop(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.03, i % 2 === 0 ? -0.01 : 0.01, poolWidth, POOL_LENGTH)
    }
    water.updateNormals(poolWidth, POOL_LENGTH)
  }, [])

  useEffect(() => {
    objectTexturePass.setSize(size.width, size.height)
  }, [objectTexturePass, size.width, size.height])

  useEffect(() => {
    causticsPass.setPoolShape('Rounded Box', CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH)
    causticsPass2.setPoolShape('Rounded Box', CORNER_RADIUS, poolWidth, POOL_HEIGHT, POOL_LENGTH)
  }, [causticsPass, causticsPass2, poolWidth])

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
  const causticsPass2Parity = useRef(false)

  useFrame((_state, delta) => {
    const poolMat = poolMeshRef.current?.material as THREE.ShaderMaterial | undefined
    const waterAboveMat = waterAboveMeshRef.current?.material as THREE.ShaderMaterial | undefined
    const waterBelowMat = waterBelowMeshRef.current?.material as THREE.ShaderMaterial | undefined
    if (!poolMat || !waterAboveMat || !waterBelowMat) return

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
  })

  return (
    <>
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
