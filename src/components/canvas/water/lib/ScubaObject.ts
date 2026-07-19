import * as THREE from 'three'
import type { Water } from './Water'
import { SphereWaterDisplacement } from './WaterDisplacement'
import { clampAndMoveObject, updatePhysics, type ObjectUpdateContext } from './SimulationObjectUtils'

// Ported from water/src/objects/DuckObject.ts's model portion (physics/
// state, no mesh/material -- that's ScubaMesh.tsx's job, loaded via
// useGLTF/Suspense instead of the source's imperative
// GLTFLoader.loadAsync()). Displacement uses a single centered sphere
// (SphereWaterDisplacement, like SphereObjectModel) rather than Duck's
// tuned 3-sphere body/head/tail approximation, since Scuba's proportions
// aren't known ahead of inspection -- see the plan's explicit note on
// this simplification.
// Vertical screen anchor for the diver: with cameraAnchorY tracking, this
// is the diver's *only* driver of on-screen height (see worldPosition
// below) -- deliberately not tied to floorClearance (which is a separate,
// physics-only "how far can it be dragged toward the pool floor" bound),
// so it can be tuned purely by how it looks on screen. Tuned empirically.
const SCREEN_ANCHOR_Y = -0.1

export class ScubaObjectModel {
  readonly boundingRadius = 0.25
  readonly floorClearance = 0.265
  readonly position = new THREE.Vector3(0.7, SCREEN_ANCHOR_Y, -0.2)
  readonly velocity = new THREE.Vector3()

  enabled = false

  // The portfolio page scrolls the *camera* down through the pool rather
  // than moving Scuba, but the diver should still read as anchored in the
  // middle of the screen throughout. WaterScene writes the camera's current
  // world Y here every frame; `worldPosition` folds it in so rendering/
  // optics uniforms track the camera while `position` itself (used for
  // physics, hit-testing math, and water-displacement UV placement) stays
  // in plain pool-local space.
  cameraAnchorY = 0

  private readonly previousPosition = this.position.clone()
  private readonly displacement = new SphereWaterDisplacement(this.boundingRadius)

  get worldPosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, this.position.y + this.cameraAnchorY, this.position.z)
  }

  setCameraAnchorY(y: number) {
    this.cameraAnchorY = y
  }

  floorY(poolHeight: number) {
    return this.floorClearance - poolHeight
  }

  setEnabled(enabled: boolean, water: Water) {
    if (enabled === this.enabled) return

    const inactivePosition = this.getInactivePosition()
    if (enabled) {
      if (this.position.y <= this.floorClearance - 1) {
        this.position.y = this.floorClearance - 1
      }
      this.displacement.move(water, inactivePosition, this.position)
    } else {
      this.displacement.move(water, this.position, inactivePosition)
      this.velocity.set(0, 0, 0)
    }

    this.enabled = enabled
    this.previousPosition.copy(this.position)
  }

  syncPreviousPosition() {
    this.previousPosition.copy(this.position)
  }

  update(seconds: number, context: ObjectUpdateContext, water: Water) {
    if (!this.enabled) return

    updatePhysics(seconds, this.position, this.velocity, context, this.boundingRadius, this.floorClearance)

    this.displacement.move(water, this.previousPosition, this.position, context.poolWidth, context.poolLength)
    this.previousPosition.copy(this.position)
  }

  hitTest(origin: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3 | null {
    if (!this.enabled) return null

    // Tested against worldPosition (camera-anchored), not the raw local
    // position, since that's where the model is actually rendered.
    const toOrigin = origin.clone().sub(this.worldPosition)
    const a = direction.lengthSq()
    const b = 2 * toOrigin.dot(direction)
    const c = toOrigin.lengthSq() - this.boundingRadius * this.boundingRadius
    const discriminant = b * b - 4 * a * c

    if (discriminant <= 0) return null
    const distance = (-b - Math.sqrt(discriminant)) / (2 * a)
    return distance > 0 ? origin.clone().addScaledVector(direction, distance) : null
  }

  moveBy(delta: THREE.Vector3, poolWidth = 1.0, poolHeight = 1.0, poolLength = 1.0) {
    // `delta` is a world-space difference between two drag-plane hits; since
    // cameraAnchorY is a uniform additive offset, the same delta applies
    // unchanged to the local (unanchored) position.
    clampAndMoveObject(
      this.position,
      delta,
      poolWidth,
      poolHeight,
      poolLength,
      this.boundingRadius,
      this.boundingRadius,
      this.floorClearance,
    )
  }

  private getInactivePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, 10, this.position.z)
  }
}
