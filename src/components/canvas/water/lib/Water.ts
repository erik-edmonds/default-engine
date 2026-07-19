import * as THREE from 'three'
import * as waterRipple from '../shaders/waterRipple'
import * as waveSimulation from '../shaders/waveSimulation'
import * as waterNormal from '../shaders/waterNormal'
import * as sphereDisplacement from '../shaders/sphereDisplacement'

// Ported from water/src/Water.ts. Owns the double-buffered (ping-pong)
// GPGPU heightfield simulation. `textureA` always holds the current
// readable state -- its identity changes every step (swapTextures), so
// consumers must rebind `water.textureA.texture` every frame rather than
// once at material creation.
export class Water {
  textureA: THREE.WebGLRenderTarget
  textureB: THREE.WebGLRenderTarget

  private renderer: THREE.WebGLRenderer
  private plane: THREE.Mesh
  private camera: THREE.OrthographicCamera
  private scene: THREE.Scene

  private dropMaterial: THREE.ShaderMaterial
  private updateMaterial: THREE.ShaderMaterial
  private normalMaterial: THREE.ShaderMaterial
  private sphereMaterial: THREE.ShaderMaterial

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer

    const size = 256
    const textureType = this.getSimulationTextureType()
    const options: THREE.RenderTargetOptions = {
      type: textureType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      depthBuffer: false,
    }

    this.textureA = new THREE.WebGLRenderTarget(size, size, options)
    this.textureB = new THREE.WebGLRenderTarget(size, size, options)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.scene = new THREE.Scene()

    const geometry = new THREE.PlaneGeometry(2, 2)

    this.dropMaterial = new THREE.ShaderMaterial({
      vertexShader: waterRipple.vertexShader,
      fragmentShader: waterRipple.fragmentShader,
      uniforms: {
        tInput: { value: null },
        center: { value: new THREE.Vector2() },
        radius: { value: 0 },
        strength: { value: 0 },
        poolWidth: { value: 1.0 },
        poolLength: { value: 1.0 },
      },
    })

    this.updateMaterial = new THREE.ShaderMaterial({
      vertexShader: waveSimulation.vertexShader,
      fragmentShader: waveSimulation.fragmentShader,
      uniforms: {
        tInput: { value: null },
        delta: { value: new THREE.Vector2(1 / size, 1 / size) },
        poolWidth: { value: 1.0 },
        poolLength: { value: 1.0 },
      },
    })

    this.normalMaterial = new THREE.ShaderMaterial({
      vertexShader: waterNormal.vertexShader,
      fragmentShader: waterNormal.fragmentShader,
      uniforms: {
        tInput: { value: null },
        delta: { value: new THREE.Vector2(1 / size, 1 / size) },
        poolWidth: { value: 1.0 },
        poolLength: { value: 1.0 },
      },
    })

    this.sphereMaterial = new THREE.ShaderMaterial({
      vertexShader: sphereDisplacement.vertexShader,
      fragmentShader: sphereDisplacement.fragmentShader,
      uniforms: {
        tInput: { value: null },
        oldCenter: { value: new THREE.Vector3() },
        newCenter: { value: new THREE.Vector3() },
        radius: { value: 0 },
        displacementScale: { value: 1.0 },
        poolWidth: { value: 1.0 },
        poolLength: { value: 1.0 },
      },
    })

    this.plane = new THREE.Mesh(geometry, this.dropMaterial)
    this.scene.add(this.plane)
    this.clearTextures()
  }

  private getSimulationTextureType() {
    const supportsFloatRenderTarget =
      this.renderer.capabilities.isWebGL2 &&
      this.renderer.extensions.has('EXT_color_buffer_float') &&
      this.renderer.extensions.has('OES_texture_float_linear')

    return supportsFloatRenderTarget ? THREE.FloatType : THREE.HalfFloatType
  }

  private clearTextures() {
    const previousTarget = this.renderer.getRenderTarget()
    const previousClearColor = new THREE.Color()
    this.renderer.getClearColor(previousClearColor)
    const previousClearAlpha = this.renderer.getClearAlpha()

    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setRenderTarget(this.textureA)
    this.renderer.clear()
    this.renderer.setRenderTarget(this.textureB)
    this.renderer.clear()
    this.renderer.setRenderTarget(previousTarget)
    this.renderer.setClearColor(previousClearColor, previousClearAlpha)
  }

  private swapTextures() {
    const temp = this.textureA
    this.textureA = this.textureB
    this.textureB = temp
  }

  addDrop(x: number, y: number, radius: number, strength: number, poolWidth = 1.0, poolLength = 1.0) {
    this.plane.material = this.dropMaterial
    this.dropMaterial.uniforms.tInput.value = this.textureA.texture
    this.dropMaterial.uniforms.center.value.set(x, y)
    this.dropMaterial.uniforms.radius.value = radius
    this.dropMaterial.uniforms.strength.value = strength
    this.dropMaterial.uniforms.poolWidth.value = poolWidth
    this.dropMaterial.uniforms.poolLength.value = poolLength

    this.renderer.setRenderTarget(this.textureB)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)

    this.swapTextures()
  }

  moveSphere(
    oldCenter: THREE.Vector3,
    newCenter: THREE.Vector3,
    radius: number,
    displacementScale = 1.0,
    poolWidth = 1.0,
    poolLength = 1.0,
  ) {
    this.plane.material = this.sphereMaterial
    this.sphereMaterial.uniforms.tInput.value = this.textureA.texture

    this.sphereMaterial.uniforms.oldCenter.value.copy(oldCenter)
    this.sphereMaterial.uniforms.newCenter.value.copy(newCenter)
    this.sphereMaterial.uniforms.radius.value = radius
    this.sphereMaterial.uniforms.displacementScale.value = displacementScale
    this.sphereMaterial.uniforms.poolWidth.value = poolWidth
    this.sphereMaterial.uniforms.poolLength.value = poolLength

    this.renderer.setRenderTarget(this.textureB)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)

    this.swapTextures()
  }

  stepSimulation(poolWidth = 1.0, poolLength = 1.0) {
    this.plane.material = this.updateMaterial
    this.updateMaterial.uniforms.tInput.value = this.textureA.texture
    this.updateMaterial.uniforms.poolWidth.value = poolWidth
    this.updateMaterial.uniforms.poolLength.value = poolLength

    this.renderer.setRenderTarget(this.textureB)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)

    this.swapTextures()
  }

  updateNormals(poolWidth = 1.0, poolLength = 1.0) {
    this.plane.material = this.normalMaterial
    this.normalMaterial.uniforms.tInput.value = this.textureA.texture
    this.normalMaterial.uniforms.poolWidth.value = poolWidth
    this.normalMaterial.uniforms.poolLength.value = poolLength

    this.renderer.setRenderTarget(this.textureB)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)

    this.swapTextures()
  }

  dispose() {
    this.textureA.dispose()
    this.textureB.dispose()
    this.dropMaterial.dispose()
    this.updateMaterial.dispose()
    this.normalMaterial.dispose()
    this.sphereMaterial.dispose()
    this.plane.geometry.dispose()
  }
}
