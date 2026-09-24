import * as THREE from 'three'
import type { Water } from './Water'
import { SphereWaterDisplacement } from './WaterDisplacement'

/** The cursor, as something in the water.
 *
 *  Not a diver and not a physics body: a kinematic sphere teleported every
 *  frame to wherever the drawn cursor is pointing, whose only two jobs are to
 *  push the surface around as it travels and to give ObjectTexturePass a solid
 *  to cast a shadow from.
 *
 *  It carries TWO positions on purpose, which is the same split ScubaObjectModel
 *  makes and for the same reason:
 *
 *  - `position` is where the wake is computed, and it sits just under the
 *    surface. It has to. The displacement shader weights by the full 3D
 *    distance from the surface texel to the sphere centre and falls off as
 *    exp(-(1.5 * d / radius)^6) -- at a depth of one radius that factor is
 *    e^-11, and at two radii it is e^-729. A probe placed at the depth the
 *    cursor appears to be would displace exactly nothing, which is what a first
 *    attempt at this looks like: a shadow with no ripple under it.
 *  - `renderPosition` is where the sphere is drawn and shaded, at the viewer's
 *    own depth, so the shadow falls from where the cursor looks like it is.
 *
 *  The wake comes from Water.moveSphere, which is volume-conserving: it puts
 *  back what the old position displaced as it takes out what the new one does.
 *  So a moving probe leaves a trail that closes behind it instead of a
 *  permanent dent, and a still probe displaces nothing at all -- which is why
 *  the surface settles by itself the moment the cursor stops. */

/** How far under the surface the wake is computed. A fraction of the radius,
 *  because that ratio is the only thing the displacement falloff above cares
 *  about; as an absolute depth it would stop working the moment the radius is
 *  tuned. */
const WAKE_DEPTH_RATIO = 0.25

/** Travel beyond this in one frame is a teleport, not a swipe -- the cursor
 *  crossing the aperture, or the probe being placed for the first time. Dragged
 *  through moveSphere it would carve one frame-long trench across the whole
 *  pool, so the probe is re-seated silently instead. In radii. */
const TELEPORT_RADII = 6

/** Below this the cursor is parked and the jitter is sub-pixel; stepping the
 *  displacement anyway just pumps energy into a surface that should be going
 *  flat. In radii. */
const STILL_RADII = 0.002

export class CursorProbe {
  /** Pool-local, at wake depth. What the water is displaced by. */
  readonly position = new THREE.Vector3()
  /** Pool-local, at the viewer's depth. What is drawn and what casts. */
  readonly renderPosition = new THREE.Vector3()

  enabled = false
  /** Pool units per second, damped -- a readout for anything that wants to
   *  fade an effect in with movement. */
  speed = 0

  private readonly previous = new THREE.Vector3()
  private readonly displacement: SphereWaterDisplacement
  private seated = false

  constructor(readonly radius = 0.6) {
    this.displacement = new SphereWaterDisplacement(radius)
  }

  get wakeDepth() {
    return -this.radius * WAKE_DEPTH_RATIO
  }

  /** Place the probe without disturbing the water. Used on the first frame and
   *  after a teleport, where a wake would be a stripe rather than a ripple. */
  seat(wakeX: number, wakeZ: number, render: THREE.Vector3) {
    this.position.set(wakeX, this.wakeDepth, wakeZ)
    this.previous.copy(this.position)
    this.renderPosition.copy(render)
    this.seated = true
    this.enabled = true
    this.speed = 0
  }

  /** Move the wake to a new pool-local x/z and the drawn sphere to `render`.
   *
   *  These are two different points along the SAME view ray, and that is what
   *  puts the ripple under the cursor on screen. The wake goes where the ray
   *  crosses the water surface -- any point on the ray projects back to the
   *  cursor's own screen position, so the disturbance appears centred on the
   *  pointer. The sphere stays nearer the viewer, so the shadow it drops falls
   *  BELOW the cursor rather than on top of it.
   *
   *  Driving the wake from the sphere's own position instead is what makes the
   *  ripple appear somewhere off in the pool: the sphere hangs at the viewer's
   *  depth, and the surface directly above it is nowhere near where the cursor
   *  is pointing. */
  moveTo(
    water: Water,
    wakeX: number,
    wakeZ: number,
    render: THREE.Vector3,
    poolWidth: number,
    poolLength: number,
    delta: number,
  ) {
    if (!this.seated) {
      this.seat(wakeX, wakeZ, render)
      return
    }

    this.previous.copy(this.position)
    this.position.set(wakeX, this.wakeDepth, wakeZ)
    this.renderPosition.copy(render)

    const travelled = this.position.distanceTo(this.previous)

    if (travelled > this.radius * TELEPORT_RADII) {
      this.seat(wakeX, wakeZ, render)
      return
    }

    if (delta > 0) {
      this.speed = THREE.MathUtils.damp(this.speed, travelled / delta, 8, delta)
    }

    if (travelled > this.radius * STILL_RADII) {
      this.displacement.move(water, this.previous, this.position, poolWidth, poolLength)
    }
  }

  /** Take the probe's displacement back out of the surface on the way out.
   *  Without this the dent it was holding open is simply abandoned, and the
   *  pool keeps a divot where the cursor was when the portal closed. */
  leave(water: Water, poolWidth: number, poolLength: number) {
    if (!this.seated) return
    const away = this.position.clone().setY(10)
    this.displacement.move(water, this.position, away, poolWidth, poolLength)
    this.position.copy(away)
    this.previous.copy(away)
    this.seated = false
    this.enabled = false
    this.speed = 0
  }
}
