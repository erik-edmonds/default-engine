"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { Beacon } from "@/components/models/Beacon"
import {
  OPTICS_COMPANION_DISTANCE,
  OPTICS_COMPANION_DROP,
  OPTICS_COMPANION_SCALE,
  OPTICS_SETTLE_LAMBDA,
  OPTICS_WAKE_ORBIT,
  OPTICS_WAKE_RISE,
  OPTICS_WAKE_SECONDS,
  OPTICS_WAKE_TURNS,
} from "@/config/optics"
import { opticsPhaseAt, opticsRun } from "@/helpers/optics"
import { makeScreenPlaneScratch, placeScreenPlane } from "@/helpers/screenPlane"
import { frameHalfHeight } from "@/helpers/skyFrame"

type BeaconCompanionProps = {
  /** Where the beacon rests, in world space. Computed by Hologram from the
   *  call site's position -- this does not know about the pier. */
  position: [number, number, number]
  scale: number
  route?: string
  onActivate?: () => void
}

/** The beacon, and the flight that takes it off its base and onto the screen.
 *
 *  OWNS THE GROUP IT WRITES, rather than being handed a ref to one. The first
 *  version took the node as a prop so Hologram could keep placing it, which
 *  reads well and is wrong twice over: it mutates a prop every frame, and it
 *  splits one object's transform across two files so that neither can be read
 *  on its own. Here Hologram says where the beacon rests and this owns
 *  everything that happens to it afterwards.
 *
 *  INERT UNTIL A RUN STARTS, which is what lets /Blob render the same hologram
 *  with no optics at all. That page passes no `onActivate`, so the beacon
 *  falls back to its route push, no run is ever started, the phase stays
 *  `idle` and the frame callback returns before it touches anything.
 *
 *  WHY THE ANCHOR IS RECOMPUTED RATHER THAN PARENTED TO THE CAMERA: the two
 *  reasons helpers/screenPlane.ts gives. r3f's camera is shared with every
 *  portal interior, so children hung off it leak across a route change, and a
 *  portal's own pass sees a different camera than the one it is finally drawn
 *  with. Three vector rotations a frame owes nothing to anyone. */
export function BeaconCompanion({ position, scale, route, onActivate }: BeaconCompanionProps) {
  const camera = useThree((s) => s.camera)
  const group = useRef<THREE.Group>(null)

  /** Everything the frame loop touches, allocated once. The rule is stated at
   *  Environment.tsx:412 and OceanWater.ts:367 and it holds here: this runs
   *  inside the render loop at priority 0. */
  const scratch = useMemo(() => makeScreenPlaneScratch(), [])
  const anchor = useMemo(() => new THREE.Object3D(), [])
  const rest = useMemo(
    () => new THREE.Vector3(position[0], position[1], position[2]),
    [position],
  )

  useFrame((_state, delta) => {
    const node = group.current
    if (!node) return

    const t = opticsRun.t
    const phase = opticsPhaseAt(t, opticsRun.airborne)
    // Untouched before the first click. Leaving the transform alone rather
    // than writing the resting values back every frame keeps the JSX below the
    // single statement of where the beacon lives.
    if (phase === "idle") return

    if (phase === "waking") {
      opticsRun.airborne = true

      const p = Math.min(1, Math.max(0, t / OPTICS_WAKE_SECONDS))
      // Ease-out on the climb: it leaves fast and arrives slow, which reads as
      // something waking up rather than something being lifted.
      const climb = 1 - (1 - p) * (1 - p) * (1 - p)
      const spin = p * Math.PI * 2 * OPTICS_WAKE_TURNS
      // The loop opens and closes over the arc, so the beacon ends the
      // flourish back above its own base with no lateral velocity to damp out.
      const radius = OPTICS_WAKE_ORBIT * Math.sin(p * Math.PI)

      node.position.set(
        rest.x + Math.cos(spin) * radius,
        // One bob on top of the climb. sin over a full turn starts and ends at
        // zero, so it adds nothing to either endpoint.
        rest.y + climb * OPTICS_WAKE_RISE + Math.sin(p * Math.PI * 2) * 0.18,
        rest.z + Math.sin(spin) * radius,
      )
      // A short swell as it comes alive, back to its resting size by the end
      // of the arc so the shrink toward the screen starts from a known value.
      node.scale.setScalar(scale * (1 + 0.18 * Math.sin(p * Math.PI)))
      return
    }

    // Settling, scanning, companion: one rule, hold the anchor. The damp is
    // what makes the transition, and it is a damp rather than a tween because
    // the anchor MOVES while the camera is still pulling back -- a tween
    // toward a moving point either overshoots it or arrives before it does.
    // The same argument CameraHotspot.tsx:240 makes for its label fade.
    const drop = frameHalfHeight(OPTICS_COMPANION_DISTANCE) * OPTICS_COMPANION_DROP
    placeScreenPlane(anchor, camera, OPTICS_COMPANION_DISTANCE, -drop, 0, scratch)

    node.position.x = THREE.MathUtils.damp(node.position.x, anchor.position.x, OPTICS_SETTLE_LAMBDA, delta)
    node.position.y = THREE.MathUtils.damp(node.position.y, anchor.position.y, OPTICS_SETTLE_LAMBDA, delta)
    node.position.z = THREE.MathUtils.damp(node.position.z, anchor.position.z, OPTICS_SETTLE_LAMBDA, delta)

    // Rotation matters on a sphere here, which is not obvious: drei's
    // MeshDistortMaterial samples its noise in OBJECT space, so a beacon
    // holding a fixed world rotation while the camera turns shows one frozen
    // lumpy face. Carrying the camera's rotation keeps the distortion moving
    // against the view the way it does on the pier.
    // slerp mutates in place -- no allocation.
    node.quaternion.slerp(anchor.quaternion, 1 - Math.exp(-OPTICS_SETTLE_LAMBDA * delta))

    node.scale.setScalar(
      THREE.MathUtils.damp(node.scale.x, OPTICS_COMPANION_SCALE, OPTICS_SETTLE_LAMBDA, delta),
    )
  })

  return (
    <group ref={group} position={position} scale={scale}>
      {/* A unit sphere at the group's origin. The transform is all up here so
          the frame loop has one node to write. */}
      <Beacon route={route} onActivate={onActivate} />
    </group>
  )
}
