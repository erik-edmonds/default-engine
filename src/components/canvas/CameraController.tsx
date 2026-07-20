"use client"

import { forwardRef, useImperativeHandle } from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"
import gsap from "gsap"

import { ISLAND_CAMERA_POSITION } from "./earthIntroPath"

// Without this, a stalled frame rate (heavy scene load, background tab, low-end
// device) makes GSAP's default lag-smoothing cap each tick's perceived delta,
// so tweens crawl for many real seconds instead of just running slightly choppy.
gsap.ticker.lagSmoothing(0)

// Matches AvatarController's BASE_POSITION — must stay in sync so the zoom-in
// (which now lerps rotation to [0,0,0]) lands with the same X/Y as the avatar,
// keeping it centered instead of relying on a fixed tilt to compensate.
const AVATAR_POSITION = new THREE.Vector3(-1.3, -0.65, 1)
// Directly in front of the avatar (avatar faces +Z) — no x/y offset.
const ZOOM_IN_DISTANCE = 4.5

export interface CameraControllerHandle {
  zoomIn: () => Promise<void>
  flyUp: () => Promise<void>
  beginSkyJourney: () => void
  setSkyOffset: (offsetZ: number) => void
  revealIsland: () => Promise<void>
}

export const CameraController = forwardRef<CameraControllerHandle>((_props, ref) => {
  const { camera } = useThree()

  useImperativeHandle(ref, () => ({
    // Move closer, straight in front of the avatar, while lerping rotation
    // from the home camera's tilted starting orientation to [0,0,0].
    zoomIn: () =>
      new Promise<void>((resolve) => {
        const endPosition = new THREE.Vector3(AVATAR_POSITION.x, AVATAR_POSITION.y, AVATAR_POSITION.z + ZOOM_IN_DISTANCE)
        gsap.to(camera.position, {
          x: endPosition.x,
          y: endPosition.y,
          z: endPosition.z,
          duration: 2,
          ease: "power2.inOut",
          onComplete: () => resolve(),
        })
        gsap.to(camera.rotation, {
          x: 0,
          y: 0,
          z: 0,
          duration: 2,
          ease: "power2.inOut",
        })
      }),
    flyUp: () =>
      new Promise<void>((resolve) => {
        gsap.to(camera.position, {
          x: "+=1",
          y: "+=100",
          duration: 5,
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
    // as a satellite zooming straight in rather than swooping/turning.
    revealIsland: () =>
      new Promise<void>((resolve) => {
        gsap.to(camera.position, {
          x: ISLAND_CAMERA_POSITION.x,
          y: ISLAND_CAMERA_POSITION.y,
          z: ISLAND_CAMERA_POSITION.z,
          duration: 2,
          ease: "power2.inOut",
          onComplete: () => resolve(),
        })
      }),
  }))

  return null
})

CameraController.displayName = "CameraController"
