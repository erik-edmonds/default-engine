import * as THREE from 'three'
import type { Water } from './Water'

// Ported from water/src/water/WaterDisplacement.ts, trimmed to the strategy
// Phase 1 actually uses (Sphere). Box/CompoundSphere variants belong to the
// Cube/TorusKnot/Duck objects deferred to a later phase.
export interface WaterDisplacementStrategy {
  move(
    water: Water,
    previousPosition: THREE.Vector3,
    position: THREE.Vector3,
    poolWidth?: number,
    poolLength?: number,
  ): void
}

export class SphereWaterDisplacement implements WaterDisplacementStrategy {
  constructor(readonly radius: number) {}

  move(
    water: Water,
    previousPosition: THREE.Vector3,
    position: THREE.Vector3,
    poolWidth = 1.0,
    poolLength = 1.0,
  ) {
    water.moveSphere(previousPosition, position, this.radius, 1.0, poolWidth, poolLength)
  }
}
