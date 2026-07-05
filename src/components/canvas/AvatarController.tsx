"use client"

import { forwardRef, useImperativeHandle, useRef, useState, Suspense } from "react"
import type { Group } from "three"
import gsap from "gsap"
import { Avatar } from "@/components/models/Avatar"
import { Dragonite } from "@/components/models/Dragonite"

// Matches the Avatar's position/rotation in Scene.tsx
const BASE_POSITION: [number, number, number] = [-1.3, -0.65, 1]
const BASE_ROTATION: [number, number, number] = [0, 0, 0]

export interface AvatarControllerHandle {
  spinAndTransform: () => Promise<void>
  flyUp: () => Promise<void>
  beginSkyJourney: () => void
  setSkyOffset: (offsetZ: number) => void
}

type ModelKind = "base" | "dragonite"

export const AvatarController = forwardRef<AvatarControllerHandle>((_props, ref) => {
  const group = useRef<Group>(null)
  const [modelKind, setModelKind] = useState<ModelKind>("base")
  const skyBaseZ = useRef(0)

  useImperativeHandle(ref, () => ({
    spinAndTransform: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap
          .timeline({ onComplete: () => resolve() })
          // Spin halfway (now facing away) before swapping the model — hides
          // the hard mesh-swap cut, since a model switch can't be crossfaded.
          .to(group.current.rotation, { y: "+=" + Math.PI, duration: 0.5, ease: "power1.in" })
          .call(() => setModelKind("dragonite"))
          .to(group.current.rotation, { y: "+=" + Math.PI, duration: 0.5, ease: "power1.out" })
      }),
    flyUp: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap.to(group.current.position, {
          y: "+=100",
          duration: 5,
          ease: "power2.inOut",
          onComplete: () => resolve(),
        })
      }),
    // Same anchor-and-offset scheme as CameraController.setSkyOffset, kept in
    // lockstep by page.tsx calling both with the same offsetZ each scroll tick.
    beginSkyJourney: () => {
      if (group.current) skyBaseZ.current = group.current.position.z
    },
    // offsetZ is a positive magnitude; scroll moves the avatar forward (-Z).
    setSkyOffset: (offsetZ: number) => {
      if (group.current) group.current.position.z = skyBaseZ.current - offsetZ
    },
  }))

  return (
    <group ref={group} position={BASE_POSITION} rotation={BASE_ROTATION}>
      <Suspense fallback={null}>{modelKind === "base" ? <Avatar scale={1.4} /> : <Dragonite scale={1.4} />}</Suspense>
    </group>
  )
})

AvatarController.displayName = "AvatarController"
