"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { useSetAtom } from "jotai"

import type { CameraControllerHandle } from "@/components/canvas/CameraController"
import {
  OPTICS_CAMERA_AT,
  OPTICS_CAMERA_LOOK,
  OPTICS_CAMERA_POSITION,
  OPTICS_CAMERA_SECONDS,
} from "@/config/optics"
import { cameraBase } from "@/helpers/cameraBase"
import { opticsPhase, opticsPhaseAt, opticsRun, type OpticsPhase } from "@/helpers/optics"

/** How fast the clouds get out of the way, and back. A MathUtils.damp lambda;
 *  4 reaches most of the way in about a quarter second, which is well ahead of
 *  the 2.6-second flight it is clearing the path for. */
const DUCK_LAMBDA = 4

/** The pull-back's curve: slow out, peak speed as the tour ends, settling in.
 *
 *  A smoothstep over a WARPED input. Smoothstep's velocity peaks where its
 *  input passes 0.5, so feeding it `p^k` moves that peak to `p = 0.5^(1/k)`.
 *  At k = 2.5 the peak lands at p = 0.758, and across a 1.8-second flight
 *  starting at OPTICS_CAMERA_AT (1.4s) that is t = 2.76 -- within a rounding
 *  error of the 2.8s the beacon's tour ends. Which is the whole point: the
 *  camera is barely moving while the beacon is the thing to watch, and is
 *  fastest exactly as the beacon stops being it.
 *
 *  A FUNCTION, NOT AN EASE STRING, because none of gsap's named curves put
 *  their peak anywhere but the middle (power*.inOut) or an endpoint
 *  (power*.in / .out). gsap core accepts a function; no plugin, no new
 *  dependency. A spring was the other candidate and is the wrong instrument:
 *  its velocity peak falls out of stiffness and damping rather than being
 *  something you can place at a named moment.
 *
 *  Stays inside [0, 1] for every p in [0, 1], which it has to -- flyTo feeds
 *  this same curve to slerpQuaternions, and extrapolating past the destination
 *  orientation whips the camera. */
const PULL_BACK_EASE = (p: number) => {
  const q = Math.pow(p, 2.5)
  return q * q * (3 - 2 * q)
}

/** The clock, the camera, the duck, and the one atom.
 *
 *  SINGLE OWNER OF `opticsRun.t`. Five components read that clock and exactly
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
  /** Seconds left on the flight home. The clock has already stopped by then,
   *  so this is what keeps the clouds out of the way until the camera is back
   *  among them. */
  const returning = useRef(0)
  /** Has the outbound flight been ordered this run? It fires on a TIMESTAMP
   *  rather than a phase transition, so it needs its own latch. */
  const flownOut = useRef(false)

  /** Derives the arrival Euler from "stand here, look there".
   *
   *  A PerspectiveCamera, AND IT HAS TO BE ONE. Object3D.lookAt and
   *  Camera.lookAt are different functions -- three branches on `isCamera`:
   *
   *      if ( this.isCamera || this.isLight ) _m1.lookAt( _position, _target, up )
   *      else                                 _m1.lookAt( _target, _position, up )
   *
   *  A plain Object3D takes the second branch, which orients +Z from the
   *  target back toward the object -- so the derived rotation points a camera
   *  180 degrees the WRONG WAY. Measured with an Object3D here: the flight
   *  landed looking up into the stars and the island never entered frame.
   *
   *  Nothing renders this and it is never added to the scene; it exists to
   *  turn two vectors into the Euler flyTo wants, using three's own arithmetic
   *  rather than a hand-rolled copy of it. One allocation, at mount. */
  const rig = useMemo(() => {
    const object = new THREE.PerspectiveCamera()
    object.position.copy(OPTICS_CAMERA_POSITION)
    object.lookAt(OPTICS_CAMERA_LOOK)
    return object
  }, [])

  /** The pose to come home to, converted on the frame it is needed. Held as a
   *  Euler because that is what flyTo takes, and flyTo turns it straight back
   *  into a quaternion -- so the round trip through XYZ is exact. */
  const homeEuler = useMemo(() => new THREE.Euler(), [])

  useFrame((state, delta) => {
    // THE DUCK RUNS WHETHER OR NOT THE CLOCK DOES, and that is the point of
    // keeping it out of the phase machine. The clock stops the instant the
    // flight home is ordered, and clouds snapping back around a lens that is
    // still forty units out would be worse than never ducking at all.
    if (returning.current > 0) returning.current -= delta
    // Ducked from the moment the camera starts moving until it is home again
    // -- keyed off the flight, not the phase, now that the two no longer line
    // up. The clouds have to be out of the way before the lens arrives, not
    // as it arrives.
    const wantDuck = opticsRun.t >= OPTICS_CAMERA_AT || returning.current > 0
    opticsRun.duck = THREE.MathUtils.damp(opticsRun.duck, wantDuck ? 1 : 0, DUCK_LAMBDA, delta)

    if (opticsRun.t < 0) {
      flownOut.current = false
      return
    }

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

    // THE OUTBOUND FLIGHT FIRES ON ITS OWN CUE, mid-tour, not on a phase
    // transition. The camera and the beacon are meant to overlap: the
    // pull-back is already under way for 1.4 seconds before the beacon stops
    // flying, so there is no moment where one motion visibly hands over to the
    // other. Expressing that as a phase would need phases that overlap, and
    // opticsPhaseAt is a linear partition precisely so chrome and input
    // suppression get exactly one answer per instant.
    if (!flownOut.current && opticsRun.t >= OPTICS_CAMERA_AT && controller.current) {
      flownOut.current = true
      controller.current.flyTo(
        OPTICS_CAMERA_POSITION,
        rig.rotation,
        OPTICS_CAMERA_SECONDS,
        PULL_BACK_EASE,
      )
    }

    const after = opticsPhaseAt(opticsRun.t, opticsRun.airborne)
    if (after === before) return

    phaseRef.current = after
    setPhase(after)

    const fly = controller.current
    if (!fly) return

    if (after === "companion") {
      homeEuler.setFromQuaternion(opticsRun.home.quaternion)
      fly.flyTo(opticsRun.home.position, homeEuler, OPTICS_CAMERA_SECONDS)
      returning.current = OPTICS_CAMERA_SECONDS
      // Once only. A later click reads this and is swallowed -- see the note
      // on `scanned` in helpers/optics.ts for where the AI picks it up.
      opticsRun.scanned = true
      // The clock stops here, and `airborne` keeps the beacon on screen. A
      // later click reads that flag and seeds the clock past the tour --
      // see opticsRun.start.
      opticsRun.t = -1
    }
  })

  return null
}
