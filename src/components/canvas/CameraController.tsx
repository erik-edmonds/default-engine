"use client"

import { forwardRef, useImperativeHandle, useRef } from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"
import { useSetAtom } from "jotai"
import gsap from "gsap"

import { tweenDuration } from "@/helpers/motion"
import { cameraFlying } from "@/helpers/StateProvider"

gsap.ticker.lagSmoothing(0)
const AVATAR_POSITION = new THREE.Vector3(-1.3, -0.65, 1)
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
  const setCameraFlying = useSetAtom(cameraFlying)
  // Counted, not a bare boolean: flights can overlap (a click landing while an
  // earlier one is still running), and the first to finish must not report
  // "done" on behalf of the one still going.
  const activeFlights = useRef(0)
  const beginFlight = () => {
    activeFlights.current += 1
    setCameraFlying(true)
  }
  const endFlight = () => {
    activeFlights.current = Math.max(0, activeFlights.current - 1)
    if (activeFlights.current === 0) setCameraFlying(false)
  }

  const syncOrbitTarget = (rotation: THREE.Euler, distance = 10) => {
    const target = (controls as { target?: THREE.Vector3 } | null)?.target
    if (!target) return
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(rotation)
    target.copy(camera.position).addScaledVector(forward, distance)
  }

  useImperativeHandle(ref, () => ({
    zoomIn: () =>
      new Promise<void>((resolve) => {
        beginFlight()
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
          onUpdate: () => syncOrbitTarget(camera.rotation),
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
    beginSkyJourney: () => {},
    setSkyOffset: () => {},
    flyTo: (position, rotation, duration = 2.5) =>
      new Promise<void>((resolve) => {
        beginFlight()
        const total = tweenDuration(duration)
        const startQuaternion = camera.quaternion.clone()
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
