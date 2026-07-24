"use client"

import { forwardRef, useImperativeHandle } from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"
import gsap from "gsap"

import { tweenDuration } from "@/helpers/motion"

// Without this, a stalled frame rate (heavy scene load, background tab, low-end
// device) makes GSAP's default lag-smoothing cap each tick's perceived delta,
// so tweens crawl for many real seconds instead of just running slightly choppy.
gsap.ticker.lagSmoothing(0)

// The avatar isn't exactly on the resting camera's optical axis -- for a
// point that's off-axis, a straight dolly with *no* rotation change
// necessarily drifts it further toward the frame edge as distance shrinks
// (the perpendicular offset stays constant in world space while the
// forward distance shrinks, so the angle atan(perp/forward) grows). See
// zoomIn below for how this is corrected without any animated rotation.
const AVATAR_POSITION = new THREE.Vector3(-1.3, -0.65, 1)
// How far to dolly in along the camera's viewing direction (see zoomIn
// below) -- tuned so the avatar fills the frame at the end.
const ZOOM_IN_DISTANCE = 8

export interface CameraControllerHandle {
  zoomIn: () => Promise<void>
  flyUp: () => Promise<void>
  beginSkyJourney: () => void
  setSkyOffset: (offsetZ: number) => void
  flyTo: (position: THREE.Vector3, rotation: THREE.Euler, duration?: number) => Promise<void>
}

export const CameraController = forwardRef<CameraControllerHandle>((_props, ref) => {
  const { camera, controls } = useThree()

  // <OrbitControls makeDefault /> (see page.tsx -- added for debugging)
  // recomputes the camera's rotation from its own `target` every single
  // frame via camera.lookAt(target), regardless of what anything else
  // sets camera.rotation to. With no explicit target that defaults to the
  // origin, so the moment any tween below sets a custom rotation, it gets
  // silently forced back toward "look at (0,0,0)" on the very next frame
  // -- position survives (OrbitControls resyncs its internal spherical
  // coords from the live position each frame, so it's self-consistent),
  // but any scripted rotation does not. Keeping OrbitControls' own target
  // pointed at whatever direction we actually intend the camera to face
  // -- recomputed continuously while a tween runs -- makes the two
  // cooperate instead of fight, without having to touch OrbitControls
  // itself. No-ops harmlessly if `controls` isn't an OrbitControls
  // instance (or isn't mounted yet).
  const syncOrbitTarget = (rotation: THREE.Euler, distance = 10) => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target
    if (!target) return
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(rotation)
    target.copy(camera.position).addScaledVector(forward, distance)
  }

  useImperativeHandle(ref, () => ({
    // Dolly in toward the avatar, animating position and rotation together.
    // The very first version translated toward a fixed world-space point
    // while separately animating rotation all the way to [0,0,0] over the
    // same 2s; those two target angles didn't match, so the combined motion
    // read as a pan-and-zoom. The next version fixed that by snapping
    // camera.lookAt(AVATAR_POSITION) *instantly*, before the tween started --
    // but an instant reorientation is still a discrete jump in a single
    // frame, just a smaller one, and it reads as "camera jumps, then zooms
    // in." This version computes the same lookAt-corrected target rotation
    // (via a throwaway lookAt call, captured then immediately undone) but
    // animates *to* it smoothly, in sync with the position tween, so
    // whatever small correction is needed happens as part of one continuous
    // motion instead of a pop before it.
    zoomIn: () =>
      new Promise<void>((resolve) => {
        const startRotation = camera.rotation.clone()
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
          onComplete: () => resolve(),
        })
        gsap.to(camera.rotation, {
          x: targetRotation.x,
          y: targetRotation.y,
          z: targetRotation.z,
          duration: tweenDuration(2),
          ease: "power2.inOut",
          onUpdate: () => syncOrbitTarget(camera.rotation),
        })
      }),
    flyUp: () =>
      new Promise<void>((resolve) => {
        // Position-only -- rotation doesn't change, but the camera is
        // still moving, so OrbitControls' target has to keep following it
        // (at the same fixed forward direction) or the forced lookAt
        // above would visibly reorient the camera toward the origin as it
        // climbs.
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
    // The camera holds its post-flyUp position for the whole choreographed
    // sequence (see AvatarController) — only the avatar moves, so its
    // left/right motion and turns read clearly against a steady frame.
    beginSkyJourney: () => {},
    setSkyOffset: () => {},
    // Generic named-viewpoint fly-to for in-world hotspots (see
    // CameraHotspot.tsx). Position and rotation used to tween together,
    // simultaneously, over the same window -- but since they're two
    // independent interpolations, the camera could easily be positioned
    // somewhere mid-flight while *already* rotated most of the way toward
    // the destination's orientation, so it spent a chunk of the transition
    // pointed at nothing coherent (blank sky, empty space) instead of
    // anything meaningful. Splitting into two sequential phases -- pan to
    // the destination first (rotation held fixed at the starting
    // orientation), then rotate in place once arrived -- keeps every frame
    // legible: the whole pan reads as one steady, coherent camera move,
    // and the reorientation only happens once, standing still, at the end.
    flyTo: (position, rotation, duration = 2.5 * 8) =>
      new Promise<void>((resolve) => {
        const startRotation = camera.rotation.clone()
        const total = tweenDuration(duration)
        // Panning covers the "travel," so it gets the bigger share; the
        // in-place reorientation is comparatively quick, just settling the
        // final framing.
        const panDuration = total * 0.6
        const rotateDuration = total * 0.4

        const timeline = gsap.timeline({ onComplete: () => resolve() })
        timeline.to(camera.position, {
          x: position.x,
          y: position.y,
          z: position.z,
          duration: panDuration,
          ease: "power2.inOut",
          onUpdate: () => syncOrbitTarget(startRotation),
        })
        timeline.to(camera.rotation, {
          x: rotation.x,
          y: rotation.y,
          z: rotation.z,
          duration: rotateDuration,
          ease: "power2.inOut",
          onUpdate: () => syncOrbitTarget(camera.rotation),
        })
      }),
  }))

  return null
})

CameraController.displayName = "CameraController"
