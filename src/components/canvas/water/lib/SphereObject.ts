import * as THREE from 'three'
import type { Water } from './Water'
import { SphereWaterDisplacement } from './WaterDisplacement'
import { clampAndMoveObject, updatePhysics, type ObjectUpdateContext } from './SimulationObjectUtils'

// Ported from water/src/objects/SphereObject.ts, split into a "model" --
// position/velocity/physics/hitTest, no Three.js scene objects -- since in
// React the mesh + material must be owned by JSX (see WaterScene.tsx), not
// created imperatively by this class as the source does.
export class SphereObjectModel {
  readonly position = new THREE.Vector3(-0.4, -0.75, 0.2)
  readonly velocity = new THREE.Vector3()
  readonly interactionRadius = 0.25

  enabled = true

  private readonly previousPosition = this.position.clone()
  private readonly displacement = new SphereWaterDisplacement(this.interactionRadius)

  floorY(poolHeight: number) {
    return this.interactionRadius - poolHeight
  }

  setEnabled(enabled: boolean, water: Water) {
    if (enabled === this.enabled) return

    const inactivePosition = this.getInactivePosition()
    if (enabled) {
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

    updatePhysics(
      seconds,
      this.position,
      this.velocity,
      context,
      this.interactionRadius,
      this.interactionRadius,
    )

    this.displacement.move(
      water,
      this.previousPosition,
      this.position,
      context.poolWidth,
      context.poolLength,
    )
    this.previousPosition.copy(this.position)
  }

  hitTest(origin: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3 | null {
    if (!this.enabled) return null

    const toOrigin = origin.clone().sub(this.position)
    const a = direction.lengthSq()
    const b = 2 * toOrigin.dot(direction)
    const c = toOrigin.lengthSq() - this.interactionRadius * this.interactionRadius
    const discriminant = b * b - 4 * a * c

    if (discriminant <= 0) return null
    const distance = (-b - Math.sqrt(discriminant)) / (2 * a)
    return distance > 0 ? origin.clone().addScaledVector(direction, distance) : null
  }

  moveBy(delta: THREE.Vector3, poolWidth = 1.0, poolHeight = 1.0, poolLength = 1.0) {
    clampAndMoveObject(
      this.position,
      delta,
      poolWidth,
      poolHeight,
      poolLength,
      this.interactionRadius,
      this.interactionRadius,
      this.interactionRadius,
    )
  }

  private getInactivePosition(): THREE.Vector3 {
    return new THREE.Vector3(this.position.x, 10, this.position.z)
  }
}
