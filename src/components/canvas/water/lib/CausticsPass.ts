import * as THREE from 'three'
import * as causticsShader from '../shaders/caustics'
import * as roundedBoxCausticsShader from '../shaders/roundedBoxCaustics'
import type { Water } from './Water'

export interface CausticsObjectState {
  sphereEnabled: boolean
  sphereCenter: THREE.Vector3
  sphereRadius: number
  meshEnabled: boolean
  meshCenter: THREE.Vector3
  meshBoundingRadius: number
}

// Ported from water/src/rendering/CausticsPass.ts. Renders the caustics
// light map by tracing rays through the wavy water surface onto the pool
// floor/walls. Supports both pool shapes: the rounded material is created
// lazily on first use (mirrors the source's lazy `roundedBoxMaterial`).
export class CausticsPass {
  readonly texture: THREE.Texture

  private readonly target: THREE.WebGLRenderTarget
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly mesh: THREE.Mesh
  private readonly boxMaterial: THREE.ShaderMaterial
  private roundedMaterial: THREE.ShaderMaterial | null = null

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly lightDirection: THREE.Vector3,
    private readonly objectShadowTexture: THREE.Texture,
  ) {
    this.target = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    })
    this.texture = this.target.texture

    this.boxMaterial = new THREE.ShaderMaterial({
      vertexShader: causticsShader.vertexShader,
      fragmentShader: causticsShader.fragmentShader,
      uniforms: {
        ...this.createOpticsUniforms(),
        light: { value: lightDirection.clone() },
        water: { value: null },
        objectShadowTex: { value: objectShadowTexture },
      },
      blending: THREE.NoBlending,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 200, 200), this.boxMaterial)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
  }

  private createOpticsUniforms() {
    return {
      sphereCenter: { value: new THREE.Vector3() },
      sphereRadius: { value: 0 },
      sphereEnabled: { value: false },
      cubeCenter: { value: new THREE.Vector3() },
      cubeHalfSize: { value: new THREE.Vector3(1, 1, 1) },
      cubeEnabled: { value: false },
      torusKnotCenter: { value: new THREE.Vector3() },
      torusKnotEnabled: { value: false },
      meshCenter: { value: new THREE.Vector3() },
      meshBoundingRadius: { value: 0 },
      meshEnabled: { value: false },
    }
  }

  setPoolShape(
    shape: string,
    cornerRadius: number,
    poolWidth: number,
    poolHeight: number,
    poolLength: number,
  ) {
    if (shape === 'Box') {
      this.camera.left = -1
      this.camera.right = 1
      this.camera.top = 1
      this.camera.bottom = -1
      this.camera.updateProjectionMatrix()
      this.mesh.material = this.boxMaterial
      return
    }

    this.camera.left = -poolWidth
    this.camera.right = poolWidth
    this.camera.top = poolLength
    this.camera.bottom = -poolLength
    this.camera.updateProjectionMatrix()

    if (!this.roundedMaterial) {
      this.roundedMaterial = new THREE.ShaderMaterial({
        vertexShader: roundedBoxCausticsShader.vertexShader,
        fragmentShader: roundedBoxCausticsShader.fragmentShader,
        uniforms: {
          ...this.createOpticsUniforms(),
          light: { value: this.lightDirection.clone() },
          water: { value: null },
          objectShadowTex: { value: this.objectShadowTexture },
          cornerRadius: { value: cornerRadius },
          poolWidth: { value: poolWidth },
          poolHeight: { value: poolHeight },
          poolLength: { value: poolLength },
        },
        blending: THREE.NoBlending,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      })
    } else {
      this.roundedMaterial.uniforms.cornerRadius.value = cornerRadius
      this.roundedMaterial.uniforms.poolWidth.value = poolWidth
      this.roundedMaterial.uniforms.poolHeight.value = poolHeight
      this.roundedMaterial.uniforms.poolLength.value = poolLength
    }
    this.mesh.material = this.roundedMaterial
  }

  update(water: Water, lightDirection: THREE.Vector3, objects: CausticsObjectState) {
    const uniforms = (this.mesh.material as THREE.ShaderMaterial).uniforms
    uniforms.water.value = water.textureA.texture
    uniforms.light.value.copy(lightDirection)
    uniforms.sphereEnabled.value = objects.sphereEnabled
    uniforms.sphereCenter.value.copy(objects.sphereCenter)
    uniforms.sphereRadius.value = objects.sphereRadius
    uniforms.meshEnabled.value = objects.meshEnabled
    uniforms.meshCenter.value.copy(objects.meshCenter)
    uniforms.meshBoundingRadius.value = objects.meshBoundingRadius

    this.renderer.setRenderTarget(this.target)
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
  }

  dispose() {
    this.target.dispose()
    this.boxMaterial.dispose()
    this.roundedMaterial?.dispose()
    this.mesh.geometry.dispose()
  }
}
