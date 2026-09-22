"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { useSetAtom } from "jotai"
import gsap from "gsap"
import { easing } from "maath"

import { prefersReducedMotion, tweenDuration } from "@/helpers/motion"
import { cameraFlying } from "@/helpers/StateProvider"
import { cameraBase, initCameraBase, setCameraBase, setCameraBaseFromEuler } from "@/helpers/cameraBase"
import { ISLAND_CAMERA_POSITION, ISLAND_CAMERA_ROTATION } from "@/config/positions"
import { journeyPose, trapezoid, type Route } from "@/config/journey"
import {
  AVATAR_BASE_POSITION,
  SKY_RISE,
  SKY_SCROLL_SMOOTH_TIME,
  avatarSkyPose,
  cameraSkyPose,
} from "@/config/skyJourney"

gsap.ticker.lagSmoothing(0)
const AVATAR_POSITION = new THREE.Vector3(-1.3, -0.65, 1)
const ZOOM_IN_DISTANCE = 8

// The arrival dolly: how far back along its own view axis the camera starts,
// and how much higher, before settling onto the island framing.
const INTRO_PULLBACK = 7
const INTRO_LIFT = 1

// --- route flights ---------------------------------------------------------
//
// A jump's duration is its length at a fixed cruising speed, clamped at both
// ends. 15 units a second is roughly the pace of scrolling the same ground on
// the itinerary, which is the standard a jump should be held to: a jump is
// meant to be the trip you would have scrolled, taken for you.
//
// The previous sqrt scaling at 1.6-3.6s ran the longest route at 26 units a
// second -- and with an accelerating ease, peaking near 52 -- which through a
// 25-degree corner slews the view at about 125 degrees a second. That is what
// made a jump read as being flung rather than travelling.
const ROUTE_UNITS_PER_SECOND = 15
const ROUTE_MIN_SECONDS = 3
const ROUTE_MAX_SECONDS = 6

// --- the journey spring ---------------------------------------------------
//
// The scroll sets a target distance along the path; this is what actually
// moves the camera there, so the view carries weight instead of being welded
// to the finger. Slightly under-damped (below the critical 2*sqrt(STIFFNESS)),
// which leaves a small settle at the end of a flick rather than an abrupt
// stop.
//
// Softer than the first version, because the path is now four times longer:
// the same constants over twelve screens of scrolling read as sluggish rather
// than weighty.
const JOURNEY_STIFFNESS = 55
const JOURNEY_DAMPING = 13
// How far past either end of the journey the spring may carry the camera
// before being pulled back. Past the ends the pose is extrapolated along the
// path's tangent, so this stays small enough to keep that extrapolation
// somewhere sensible.
const JOURNEY_RUBBER_BAND = 0.01
// One stalled frame must not integrate a huge step. This matters more here
// than anywhere else in the app: gsap.ticker.lagSmoothing(0) above means a
// long frame really does arrive as a long delta, and an unclamped spring
// integrator does not merely stutter -- it diverges and throws the camera.
const MAX_DELTA = 1 / 30
// Below this the spring is considered arrived, so it stops writing and lets
// the camera sit exactly on the target rather than jittering around it.
const JOURNEY_REST_EPSILON = 0.00002

export interface CameraControllerHandle {
  zoomIn: () => Promise<void>
  flyUp: () => Promise<void>
  /** Follow the avatar off the island edge and down through the waterline.
   *  Resolves once the camera is under. */
  beginSkyJourney: () => void
  setSkyOffset: (offsetZ: number) => void
  /** Hands the camera back. Symmetric with beginSkyJourney, and with
   *  AvatarController.returnHome, which drops the avatar's own latch. */
  endSkyJourney: () => void
  flyTo: (position: THREE.Vector3, rotation: THREE.Euler, duration?: number) => Promise<void>
  intro: (duration?: number) => Promise<void>
  /** Drive the camera along the scroll journey. `u` is the target distance
   *  along the path, 0 at Home and 1 at Contact; the spring is what actually
   *  moves. Safe to call on every scroll event -- it only sets a target.
   *  `enterAt` seeds the spring when the journey is first taken up, for a
   *  caller that knows the camera is already somewhere along it. */
  setJourney: (u: number, enterAt?: number) => void
  /** Fly an authored route between two destinations -- the rail's jumps and
   *  the desktop ring clicks. Unlike flyTo, which is a straight line and a
   *  slerp, this follows a curve that is known to clear the islands. */
  flyRoute: (route: Route) => Promise<void>
  /** Hand the camera back to the tweens, so the spring stops writing and
   *  cannot fight a flight. */
  endJourney: () => void
}

export const CameraController = forwardRef<CameraControllerHandle>((_props, ref) => {
  const { camera, controls } = useThree()
  const setCameraFlying = useSetAtom(cameraFlying)
  // Counted, not a bare boolean: flights can overlap (a click landing while an
  // earlier one is still running), and the first to finish must not report
  // "done" on behalf of the one still going.
  const activeFlights = useRef(0)
  // Held so a real flight can supersede it. Both tween camera.position, and
  // gsap's default overwrite:false would let them fight -- the hotspot rings
  // become clickable slightly before the arrival dolly has finished.
  const introTween = useRef<gsap.core.Tween | null>(null)
  const beginFlight = () => {
    introTween.current?.kill()
    introTween.current = null
    // Hand the camera to the tweens. The journey spring writes position and
    // orientation every frame, so left running it would simply overwrite the
    // flight and the camera would never leave the path. Here rather than in
    // flyTo so zoomIn is covered by the same guarantee.
    journey.current.active = false
    journey.current.v = 0
    activeFlights.current += 1
    setCameraFlying(true)
  }
  const endFlight = () => {
    activeFlights.current = Math.max(0, activeFlights.current - 1)
    if (activeFlights.current === 0) setCameraFlying(false)
  }

  // Seed the aim before anything can layer a look-offset on top of it.
  // CameraLook mounts later (it waits for `started`) and would otherwise find
  // an identity quaternion and swing the camera to face world -Z.
  useEffect(() => {
    initCameraBase(camera.quaternion)
  }, [camera])

  const syncOrbitTarget = (rotation: THREE.Euler, distance = 10) => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target
    if (!target) return
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(rotation)
    target.copy(camera.position).addScaledVector(forward, distance)
  }

  // The journey's state. All refs: this runs in the frame loop and in scroll
  // handlers, neither of which wants a re-render.
  const journey = useRef({
    active: false,
    /** Where the scroll says we should be, 0..1 along the whole path. */
    target: 0,
    /** Where the spring actually is -- may sit just outside 0..1 mid-settle. */
    u: 0,
    /** ...and its velocity, in units of u per second. */
    v: 0,
  })
  const journeyScratch = useMemo(() => ({ position: new THREE.Vector3(), look: new THREE.Vector3() }), [])

  // The sky journey's state. Separate from the island journey above because it
  // is a different kind of motion: that one is a spring along an authored
  // curve, this one damps toward a scrolled offset -- and it uses the SAME
  // damping constant as AvatarController, deliberately. Two different smoothing
  // constants would let the camera and the avatar slide apart while the wheel
  // is moving, and this whole sequence is the camera holding the avatar in
  // frame.
  const sky = useRef({ active: false, target: 0, display: 0 })
  const skyScratch = useMemo(() => ({ position: new THREE.Vector3(), look: new THREE.Vector3() }), [])

  useFrame((_state, delta) => {
    // --- the sky journey ---------------------------------------------------
    //
    // Runs before the island journey and returns: the two can never both own
    // the camera, and `flying` outranks both -- a hotspot flight or the fly-up
    // itself is a gsap tween writing camera.position, and this must not fight
    // it.
    const s = sky.current
    if (s.active) {
      if (activeFlights.current === 0) {
        if (prefersReducedMotion()) {
          s.display = s.target
        } else {
          easing.damp(s, "display", s.target, SKY_SCROLL_SMOOTH_TIME, Math.min(delta, MAX_DELTA))
        }
        // Where the avatar is, computed from the SAME table it reads rather
        // than asked for: both controllers damp the same offset with the same
        // constant, so they agree by construction, and the camera stays
        // decoupled from the avatar's ref. The idle bob is deliberately not
        // included -- a camera that followed it would read as seasick.
        const pose = avatarSkyPose(s.display)
        cameraSkyPose(
          s.display,
          { x: pose.x, y: AVATAR_BASE_POSITION[1] + SKY_RISE + pose.yOffset, z: pose.z },
          skyScratch.position,
          skyScratch.look,
        )
        camera.position.copy(skyScratch.position)
        camera.lookAt(skyScratch.look)
        // Published like every other rotation writer, or CameraLook composes
        // its cursor offset onto a stale aim.
        setCameraBase(camera.quaternion)
        syncOrbitTarget(camera.rotation)
      }
      return
    }

    // --- the island journey ------------------------------------------------
    const j = journey.current
    if (!j.active) return

    if (prefersReducedMotion()) {
      // Overshoot is exactly what this setting exists to remove, so the spring
      // is not softened here -- it is skipped.
      j.u = j.target
      j.v = 0
    } else {
      const dt = Math.min(delta, MAX_DELTA)
      // Semi-implicit (symplectic) Euler: velocity first, then integrate the
      // NEW velocity into position. Explicit Euler with the same constants
      // gains energy every step and walks the camera away.
      j.v += (JOURNEY_STIFFNESS * (j.target - j.u) - JOURNEY_DAMPING * j.v) * dt
      j.u += j.v * dt

      // The rubber band. Clamping u alone would let the spring keep pushing
      // against the wall and then snap; zeroing the outward velocity at the
      // limit is what makes it turn around.
      const low = -JOURNEY_RUBBER_BAND
      const high = 1 + JOURNEY_RUBBER_BAND
      if (j.u < low) { j.u = low; if (j.v < 0) j.v = 0 }
      else if (j.u > high) { j.u = high; if (j.v > 0) j.v = 0 }

      if (Math.abs(j.target - j.u) < JOURNEY_REST_EPSILON && Math.abs(j.v) < JOURNEY_REST_EPSILON) {
        j.u = j.target
        j.v = 0
      }
    }

    journeyPose(j.u, journeyScratch.position, journeyScratch.look)
    camera.position.copy(journeyScratch.position)
    // lookAt rather than a slerp between the two nearest viewpoints: the path
    // curves, so an orientation interpolated only between destinations would
    // have the camera facing off into open water for most of a leg. Aiming at
    // the look curve keeps the cluster framed the whole way, and at each
    // destination the look point sits on that viewpoint's own view axis, so
    // the arrival framing is identical to a hotspot flight's.
    camera.lookAt(journeyScratch.look)
    // Publish the aim, like every other rotation writer -- CameraLook composes
    // its cursor offset on this, and a writer that skips it desyncs the two.
    setCameraBase(camera.quaternion)
    syncOrbitTarget(camera.rotation)
  })

  useImperativeHandle(ref, () => ({
    setJourney: (u, enterAt) => {
      const j = journey.current
      if (!j.active) {
        // Where the spring starts when the journey is taken up, which is not
        // always where the scroll says -- a caller returning from a flight
        // knows the camera is already at a particular point on the path and
        // passes it, so the camera glides from there rather than snapping.
        j.active = true
        j.u = enterAt ?? u
        j.v = 0
        // The arrival dolly tweens camera.position too, and gsap's default
        // overwrite:false would let the two fight. Same reason beginFlight
        // kills it.
        introTween.current?.kill()
        introTween.current = null
      }
      j.target = u
    },
    endJourney: () => {
      journey.current.active = false
      journey.current.v = 0
      // The sky latch too. handleGoHome calls this on the way back from the
      // sky, and a camera still being driven by the sky path would fight the
      // flight home for the whole of its duration.
      sky.current.active = false
      sky.current.target = 0
      sky.current.display = 0
    },
    zoomIn: () =>
      new Promise<void>((resolve) => {
        beginFlight()
        // Started from the *aim*, not from camera.rotation -- the latter
        // carries CameraLook's cursor offset, which gsap would capture as the
        // tween's start value and then never unwind. Writing it back into
        // camera.rotation first is what gsap.to() reads a beat later.
        const startRotation = new THREE.Euler().setFromQuaternion(cameraBase, camera.rotation.order)
        camera.lookAt(AVATAR_POSITION)
        const targetRotation = camera.rotation.clone()
        camera.rotation.copy(startRotation)

        const forward = new THREE.Vector3(0, 0, -1).applyEuler(targetRotation)
        const endPosition = camera.position.clone().addScaledVector(forward, ZOOM_IN_DISTANCE)

        gsap.to(camera.position, {
          x: endPosition.x,
          y: endPosition.y,
          z: endPosition.z,
          duration: tweenDuration(2),
          ease: "power2.inOut",
          onComplete: () => {
            endFlight()
            resolve()
          },
        })
        gsap.to(camera.rotation, {
          x: targetRotation.x,
          y: targetRotation.y,
          z: targetRotation.z,
          duration: tweenDuration(2),
          ease: "power2.inOut",
          // gsap writes camera.rotation, we publish it as the new aim, and
          // CameraLook re-applies its offset on top a fraction of a frame
          // later. Publishing here rather than letting the look read
          // camera.rotation back is what keeps the offset out of the aim.
          onUpdate: () => {
            setCameraBaseFromEuler(camera.rotation)
            syncOrbitTarget(camera.rotation)
          },
        })
      }),
    flyUp: () =>
      new Promise<void>((resolve) => {
        const fixedRotation = camera.rotation.clone()
        gsap.to(camera.position, {
          x: "+=1",
          y: "+=100",
          duration: tweenDuration(5),
          ease: "power2.inOut",
          onUpdate: () => syncOrbitTarget(fixedRotation),
          onComplete: () => resolve(),
        })
      }),
    // Takes up the camera at the top of the fly-up. No pose is captured here,
    // unlike the avatar's: the camera path's first stop is DERIVED from where
    // flyUp leaves both of them (see CAMERA_STOPS in config/skyJourney.ts), so
    // offset 0 already is the current pose and there is nothing to blend out.
    // `dive()` lived here -- move to a vantage, follow the avatar down, go
    // under. Removed with the dive itself; /portfolio is entered through the
    // Models portal now.
    beginSkyJourney: () => {
      sky.current.active = true
      sky.current.target = 0
      sky.current.display = 0
    },
    setSkyOffset: (offset) => {
      sky.current.target = offset
    },
    // Must be called before the flight home, not after.
    //
    // The driver stands down while a flight is active, but `active` alone is
    // not enough: once flyTo finishes and activeFlights drops back to zero the
    // driver would resume and snap the camera straight back to the sky path,
    // undoing the trip home a frame after it landed. Dropping the latch first
    // is what makes flyTo the sole owner for the whole descent.
    //
    // This exists separately from endJourney because handleGoHome only calls
    // that one on a coarse pointer -- the island journey's spring is never
    // taken up on desktop -- so relying on it left the camera stuck at
    // altitude on every desktop return.
    endSkyJourney: () => {
      sky.current.active = false
      sky.current.target = 0
      sky.current.display = 0
    },
    // The arrival move, fired at the same moment as the loading screen's
    // burst() rather than after it -- the snap to the wide start below happens
    // while the plate is still opaque, so what you see as it dissolves is a
    // camera already settling instead of a static frame.
    //
    // Position only. A rotation tween here would have to be unwound by
    // flyTo's quaternion slerp the moment you click a hotspot, for no visual
    // gain at this distance.
    //
    // Deliberately does NOT call beginFlight(): cameraFlying gates hint
    // sequencing and Thunder, and an arrival is not a journey.
    intro: (duration = 2.8) =>
      new Promise<void>((resolve) => {
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(ISLAND_CAMERA_ROTATION)
        camera.position
          .copy(ISLAND_CAMERA_POSITION)
          .addScaledVector(forward, -INTRO_PULLBACK)
          .setY(ISLAND_CAMERA_POSITION.y + INTRO_LIFT)
        camera.rotation.copy(ISLAND_CAMERA_ROTATION)
        setCameraBaseFromEuler(ISLAND_CAMERA_ROTATION)
        syncOrbitTarget(camera.rotation)

        introTween.current = gsap.to(camera.position, {
          x: ISLAND_CAMERA_POSITION.x,
          y: ISLAND_CAMERA_POSITION.y,
          z: ISLAND_CAMERA_POSITION.z,
          duration: tweenDuration(duration),
          // Decelerating rather than symmetric: this should read as arriving
          // somewhere, not as a camera being moved.
          ease: "power2.out",
          onUpdate: () => syncOrbitTarget(camera.rotation),
          // Resolved on interrupt as well as completion, so an early hotspot
          // click can never leave handleEnter awaiting a promise that will
          // now never settle.
          onInterrupt: () => resolve(),
          onComplete: () => {
            introTween.current = null
            resolve()
          },
        })
      }),
    flyRoute: (route) =>
      new Promise<void>((resolve) => {
        beginFlight()
        const seconds = THREE.MathUtils.clamp(
          route.length / ROUTE_UNITS_PER_SECOND,
          ROUTE_MIN_SECONDS,
          ROUTE_MAX_SECONDS,
        )
        const progress = { t: 0 }
        // Seeded from the route's own start so the first frame writes the
        // departure pose rather than leaving the camera wherever it was for a
        // tick -- gsap does not call onUpdate until the ticker comes round.
        route.poseAt(0, journeyScratch.position, journeyScratch.look)
        gsap.to(progress, {
          t: 1,
          duration: tweenDuration(seconds),
          // LINEAR, with the shaping done by the journey's own trapezoid below.
          // Not a stylistic preference: gsap's power eases are continuous, so
          // their speed peaks at roughly twice the mean in the middle of the
          // flight -- which on these routes is exactly where the corners are.
          // trapezoid ramps up, holds a CONSTANT cruise for about two thirds of
          // the way, then ramps down, so the fastest moment is only ~1.2x the
          // mean. It is the same profile the scroll uses, imported rather than
          // reimplemented so the two can never drift apart.
          ease: "none",
          onUpdate: () => {
            route.poseAt(trapezoid(progress.t), journeyScratch.position, journeyScratch.look)
            camera.position.copy(journeyScratch.position)
            camera.lookAt(journeyScratch.look)
            // Published like every other rotation writer, or CameraLook
            // composes its cursor offset onto a stale aim.
            setCameraBase(camera.quaternion)
            syncOrbitTarget(camera.rotation)
          },
          onComplete: () => {
            endFlight()
            resolve()
          },
          onInterrupt: () => {
            endFlight()
            resolve()
          },
        })
      }),
    flyTo: (position, rotation, duration = 2.5) =>
      new Promise<void>((resolve) => {
        beginFlight()
        const total = tweenDuration(duration)
        // The aim, not camera.quaternion: starting the slerp from the offset
        // orientation would carry the cursor's tilt all the way to the
        // destination, and the arrival rotation would be off by it. Visually
        // continuous either way, because CameraLook keeps adding the same
        // offset on top of whatever the slerp publishes.
        const startQuaternion = cameraBase.clone()
        const endQuaternion = new THREE.Quaternion().setFromEuler(rotation)
        const rotateProgress = { t: 0 }
        const turnFraction = 0.75
        const turnStart = total * (1 - turnFraction)
        const turnDuration = total * turnFraction

        const timeline = gsap.timeline({
          onComplete: () => {
            endFlight()
            resolve()
          },
        })
        timeline.to(
          camera.position,
          {
            x: position.x,
            y: position.y,
            z: position.z,
            duration: total,
            ease: "power2.inOut",
            onUpdate: () => syncOrbitTarget(camera.rotation),
          },
          0,
        )
        timeline.to(
          rotateProgress,
          {
            t: 1,
            duration: turnDuration,
            ease: "power2.inOut",
            onUpdate: () => {
              camera.quaternion.slerpQuaternions(startQuaternion, endQuaternion, rotateProgress.t)
              setCameraBase(camera.quaternion)
              syncOrbitTarget(camera.rotation)
            },
          },
          turnStart,
        )
      }),
  }))

  return null
})

CameraController.displayName = "CameraController"
