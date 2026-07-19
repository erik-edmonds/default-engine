import * as THREE from 'three'
import { useEffect, useMemo } from 'react'
import type { Water } from './lib/Water'

// Ported from water/src/app/InteractionController.ts, adapted as a hook.
// Simplifications vs. the source (justified by this port's scope):
// - Exactly one of `objects` is ever `enabled` at a time.
// - R3F's default frameloop re-renders continuously, and the simulation is
//   never paused (no more pause/physics-toggle controls), so there's
//   nothing to force-redraw or mark dirty -- caustics/object textures are
//   simply recomputed every frame unconditionally in WaterScene.
// - No camera control at all: this scene is embedded inside /portfolio's
//   shared Canvas, which already owns the camera via its own Rig (drei
//   CameraControls, driven by scroll-paging -- see
//   src/helpers/CameraHelpers.tsx). A pointerdown that doesn't hit the
//   pool/an object is left completely alone (no preventDefault, no
//   pointer capture) so it falls through to whatever else lives in that
//   shared canvas (e.g. clicking a portfolio Frame to zoom in).
// - No keyboard shortcuts: Space/G previously toggled pause/gravity, both
//   of which are now fixed, static configuration with no UI to control.
enum InteractionMode {
  None,
  AddDrops,
  MoveObject,
}

// Minimal shared shape both SphereObjectModel and ScubaObjectModel already
// have -- not the full source `SimulationObject` interface, just the three
// members dragging actually needs.
export interface DraggableObject {
  enabled: boolean
  hitTest(origin: THREE.Vector3, direction: THREE.Vector3): THREE.Vector3 | null
  moveBy(delta: THREE.Vector3, poolWidth?: number, poolHeight?: number, poolLength?: number): void
}

export interface WaterInteractionControls {
  poolWidth: number
  poolHeight: number
  poolLength: number
  /** World-space Y of the water surface (the pool assembly may be
   *  translated up/down in world space independent of the physics-local
   *  coordinates everything else here uses). Defaults to 0 if omitted. */
  waterSurfaceY?: number
}

export interface WaterInteractionDeps {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  water: Water
  objects: DraggableObject[]
  controls: WaterInteractionControls
}

class InteractionController {
  private mode = InteractionMode.None
  private previousHit: THREE.Vector3 | null = null
  private dragPlaneNormal: THREE.Vector3 | null = null
  private dragTarget: DraggableObject | null = null
  private activePointerId: number | null = null

  constructor(private readonly deps: WaterInteractionDeps) {}

  get draggingObject() {
    return this.mode === InteractionMode.MoveObject
  }

  connect() {
    const { canvas } = this.deps
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerEnd)
    canvas.addEventListener('pointercancel', this.onPointerEnd)
    canvas.addEventListener('lostpointercapture', this.onLostPointerCapture)
  }

  disconnect() {
    const { canvas } = this.deps
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerup', this.onPointerEnd)
    canvas.removeEventListener('pointercancel', this.onPointerEnd)
    canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture)
  }

  cancelDrag() {
    this.stopDrag()
  }

  private getRay(x: number, y: number) {
    const { canvas, camera } = this.deps
    const rect = canvas.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1,
    )
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(pointer, camera)
    return {
      origin: raycaster.ray.origin.clone(),
      direction: raycaster.ray.direction.clone(),
    }
  }

  /** Returns whether a water-relevant interaction actually started. */
  private startDrag(x: number, y: number): boolean {
    const { camera, objects, controls } = this.deps
    const { origin, direction } = this.getRay(x, y)

    const waterSurfaceY = controls.waterSurfaceY ?? 0
    const pointOnPlane = origin.clone().addScaledVector(direction, (waterSurfaceY - origin.y) / direction.y)
    let objectHit: THREE.Vector3 | null = null
    let hitObject: DraggableObject | null = null
    for (const object of objects) {
      const hit = object.hitTest(origin, direction)
      if (hit) {
        objectHit = hit
        hitObject = object
        break
      }
    }
    const poolWidth = controls.poolWidth
    const poolLength = controls.poolLength

    if (objectHit && hitObject) {
      this.mode = InteractionMode.MoveObject
      this.previousHit = objectHit
      this.dragTarget = hitObject
      this.dragPlaneNormal = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).negate()
      return true
    }
    if (Math.abs(pointOnPlane.x) < poolWidth && Math.abs(pointOnPlane.z) < poolLength) {
      this.mode = InteractionMode.AddDrops
      this.duringDrag(x, y)
      return true
    }
    return false
  }

  private duringDrag(x: number, y: number) {
    const { water, controls } = this.deps
    const poolWidth = controls.poolWidth
    const poolHeight = controls.poolHeight
    const poolLength = controls.poolLength

    if (this.mode === InteractionMode.AddDrops) {
      const { origin, direction } = this.getRay(x, y)
      const waterSurfaceY = controls.waterSurfaceY ?? 0
      const point = origin.clone().addScaledVector(direction, (waterSurfaceY - origin.y) / direction.y)
      water.addDrop(point.x / poolWidth, point.z / poolLength, 0.03, 0.01, poolWidth, poolLength)
    } else if (this.mode === InteractionMode.MoveObject) {
      if (!this.previousHit || !this.dragPlaneNormal || !this.dragTarget || !this.dragTarget.enabled) return
      const { origin, direction } = this.getRay(x, y)
      const distance =
        -this.dragPlaneNormal.dot(origin.clone().sub(this.previousHit)) /
        this.dragPlaneNormal.dot(direction)
      const nextHit = origin.clone().addScaledVector(direction, distance)

      this.dragTarget.moveBy(nextHit.clone().sub(this.previousHit), poolWidth, poolHeight, poolLength)
      this.previousHit = nextHit
    }
  }

  private stopDrag() {
    this.mode = InteractionMode.None
    this.previousHit = null
    this.dragPlaneNormal = null
    this.dragTarget = null
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (this.activePointerId !== null || !event.isPrimary) return

    const started = this.startDrag(event.clientX, event.clientY)
    if (!started) return

    event.preventDefault()
    this.deps.canvas.setPointerCapture(event.pointerId)
    this.activePointerId = event.pointerId
  }

  private onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== this.activePointerId) return
    event.preventDefault()
    this.duringDrag(event.clientX, event.clientY)
  }

  private onPointerEnd = (event: PointerEvent) => this.finishPointer(event, true)
  private onLostPointerCapture = (event: PointerEvent) => this.finishPointer(event, false)

  private finishPointer(event: PointerEvent, releaseCapture: boolean) {
    if (event.pointerId !== this.activePointerId) return
    this.activePointerId = null
    this.stopDrag()

    const { canvas } = this.deps
    if (releaseCapture && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
  }
}

export function useWaterInteraction(deps: WaterInteractionDeps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const controller = useMemo(() => new InteractionController(deps), [])

  useEffect(() => {
    controller.connect()
    return () => controller.disconnect()
  }, [controller])

  return controller
}
