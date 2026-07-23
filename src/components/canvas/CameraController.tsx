"use client"

import { forwardRef, useImperativeHandle } from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"
import gsap from "gsap"

import { ISLAND_CAMERA_POSITION, EARTH_CROSS_FRACTION } from "./earthIntroPath"
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
  revealIsland: (onEarthCrossed?: () => void) => Promise<void>
}

export const CameraController = forwardRef<CameraControllerHandle>((_props, ref) => {
  const { camera } = useThree()

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
        })
      }),
    flyUp: () =>
      new Promise<void>((resolve) => {
        gsap.to(camera.position, {
          x: "+=1",
          y: "+=100",
          duration: tweenDuration(5),
          ease: "power2.inOut",
          onComplete: () => resolve(),
        })
      }),
    // The camera holds its post-flyUp position for the whole choreographed
    // sequence (see AvatarController) — only the avatar moves, so its
    // left/right motion and turns read clearly against a steady frame.
    beginSkyJourney: () => {},
    setSkyOffset: () => {},
    // Straight-line push forward from wherever the Earth intro left the
    // camera to the homepage's resting shot. Position-only, deliberately —
    // the camera already faces this direction from frame one (see
    // earthIntroPath.ts), so a pure dolly forward is what makes this read
    // as a satellite zooming straight in rather than swooping/turning. One
    // continuous tween the whole way -- the Earth is never faded out; it's
    // still fully opaque and filling the frame right up until the moment
    // the camera's live position (not the eased tween-time fraction, which
    // diverges from it under a non-linear ease) crosses EARTH_CROSS_FRACTION
    // of the total distance, at which point `onEarthCrossed` fires exactly
    // once so the caller can swap in the island scene and mask the swap
    // with a quick flash -- one continuous zoom "through" the Earth into
    // the island, not two scenes cutting between each other.
    revealIsland: (onEarthCrossed) =>
      new Promise<void>((resolve) => {
        const startPosition = camera.position.clone()
        const totalDistance = startPosition.distanceTo(ISLAND_CAMERA_POSITION)
        let crossed = false
        gsap.to(camera.position, {
          x: ISLAND_CAMERA_POSITION.x,
          y: ISLAND_CAMERA_POSITION.y,
          z: ISLAND_CAMERA_POSITION.z,
          duration: tweenDuration(2),
          ease: "power2.inOut",
          onUpdate: () => {
            if (crossed || !onEarthCrossed) return
            const traveled = startPosition.distanceTo(camera.position)
            if (traveled / totalDistance >= EARTH_CROSS_FRACTION) {
              crossed = true
              onEarthCrossed()
            }
          },
          onComplete: () => {
            resolve()
          },
        })
      }),
  }))

  return null
})

CameraController.displayName = "CameraController"
