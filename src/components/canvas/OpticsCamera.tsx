"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { useSetAtom } from "jotai"

import type { CameraControllerHandle } from "@/components/canvas/CameraController"
import {
  OPTICS_CAMERA_LOOK,
  OPTICS_CAMERA_POSITION,
  OPTICS_CAMERA_SECONDS,
} from "@/config/optics"
import { cameraBase } from "@/helpers/cameraBase"
import { opticsPhase, opticsPhaseAt, opticsRun, type OpticsPhase } from "@/helpers/optics"

/** The clock, the camera, and the one atom.
 *
 *  SINGLE OWNER OF `opticsRun.t`. Four components read that clock and exactly
 *  one advances it, which is this -- the same discipline IslandExperience
 *  applies to dpr (one writer, deliberately: see the note at its
 *  PerformanceMonitor). Two advancers would double the sequence's speed in a
 *  way that only shows up as "the scan is too fast sometimes".
 *
 *  MOUNTED BESIDE CameraController, NOT INSIDE Scene, because this is where
 *  the handle lives. The beacon's own flight is BeaconCompanion's, down in the
 *  scene graph where the beacon is; the camera is up here where the controller
 *  is. Neither knows about the other -- both read the clock. */
export function OpticsCamera({
  controller,
  blocked,
}: {
  controller: React.RefObject<CameraControllerHandle | null>
  /** A portal is open, or the sky journey has begun. Both take the camera, and
   *  two owners is one too many -- so a run in progress is abandoned rather
   *  than allowed to fight for it. */
  blocked: boolean
}) {
  const setPhase = useSetAtom(opticsPhase)
  const phaseRef = useRef<OpticsPhase>("idle")

  /** Derives the arrival Euler from "stand here, look there". A real Object3D
   *  rather than hand-rolled trigonometry: lookAt writes the quaternion and
   *  three keeps `rotation` in sync with it, so this is exactly the arithmetic
   *  the camera would do for itself. One allocation, at mount. */
  const rig = useMemo(() => {
    const object = new THREE.Object3D()
    object.position.copy(OPTICS_CAMERA_POSITION)
    object.lookAt(OPTICS_CAMERA_LOOK)
    return object
  }, [])

  /** The pose to come home to, converted on the frame it is needed. Held as a
   *  Euler because that is what flyTo takes, and flyTo turns it straight back
   *  into a quaternion -- so the round trip through XYZ is exact. */
  const homeEuler = useMemo(() => new THREE.Euler(), [])

  useFrame((state, delta) => {
    if (opticsRun.t < 0) return

    // Checked here rather than in an effect, and not only to avoid the
    // cascading-render lint: the abort has to land on the same frame the
    // camera changes hands, and an effect runs after the commit that follows
    // it. r3f re-subscribes this callback on every render, so `blocked` is
    // never a stale capture.
    if (blocked) {
      opticsRun.abort()
      // The beacon keeps its anchor; only the sequence ends. Reporting
      // `companion` rather than `idle` is what says so.
      const next = opticsRun.airborne ? "companion" : "idle"
      if (phaseRef.current !== next) {
        phaseRef.current = next
        setPhase(next)
      }
      return
    }

    // THE AIM, NOT camera.rotation. helpers/cameraBase.ts records why at
    // length: camera.rotation carries CameraLook's cursor parallax on top of
    // the aim, so capturing it would bake a tilt into the pose we fly home to
    // and the camera would arrive looking slightly off from where it left.
    if (!opticsRun.home.captured) {
      opticsRun.home.position.copy(state.camera.position)
      opticsRun.home.quaternion.copy(cameraBase)
      opticsRun.home.captured = true
    }

    const before = phaseRef.current
    opticsRun.t += delta
    const after = opticsPhaseAt(opticsRun.t, opticsRun.airborne)
    if (after === before) return

    phaseRef.current = after
    setPhase(after)

    const fly = controller.current
    if (!fly) return

    if (after === "settling") {
      // Out. Position and rotation both authored; see config/optics.ts for
      // why the frame is 44.8 units tall at this distance and the island is 45.
      fly.flyTo(OPTICS_CAMERA_POSITION, rig.rotation, OPTICS_CAMERA_SECONDS)
    } else if (after === "companion") {
      homeEuler.setFromQuaternion(opticsRun.home.quaternion)
      fly.flyTo(opticsRun.home.position, homeEuler, OPTICS_CAMERA_SECONDS)
      // The clock stops here, and `airborne` keeps the beacon on screen. A
      // later click reads that flag and seeds the clock past the wake arc --
      // see opticsRun.start.
      opticsRun.t = -1
    }
  })

  return null
}
