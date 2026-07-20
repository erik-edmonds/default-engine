"use client"

import { forwardRef, useImperativeHandle, useRef, useState, Suspense } from "react"
import type { Group } from "three"
import gsap from "gsap"
import { Avatar } from "@/components/models/Avatar"
import { Dragonite } from "@/components/models/Dragonite"
import { Scuba } from "@/components/models/Scuba"

const BASE_POSITION: [number, number, number] = [-1.3, -0.65, 1]
const BASE_ROTATION: [number, number, number] = [0, -Math.PI/10, 0]

const KEYFRAMES: { at: number; x: number; rotY: number }[] = [
  { at: 0, x: BASE_POSITION[0], rotY: 0 },
  { at: 150, x: 1, rotY: Math.PI / 4 }, 
  { at: 300, x: -2.07, rotY: Math.PI / 2 }, 
  { at: 450, x: 4, rotY: Math.PI }, 
]

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function catmullRomTangents(values: number[], times: number[]) {
  return values.map((v, i) => {
    if (i === 0 || i === values.length - 1) return 0
    return (values[i + 1] - values[i - 1]) / (times[i + 1] - times[i - 1])
  })
}

function hermite(p0: number, m0: number, p1: number, m1: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1
}

const KEYFRAME_TIMES = KEYFRAMES.map((k) => k.at)
const X_TANGENTS = catmullRomTangents(
  KEYFRAMES.map((k) => k.x),
  KEYFRAME_TIMES,
)
const ROT_TANGENTS = catmullRomTangents(
  KEYFRAMES.map((k) => k.rotY),
  KEYFRAME_TIMES,
)

function getChoreographedPose(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), KEYFRAMES[KEYFRAMES.length - 1].at)
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i]
    const b = KEYFRAMES[i + 1]
    if (clamped <= b.at) {
      const dt = b.at - a.at
      const t = (clamped - a.at) / dt
      return {
        x: hermite(a.x, X_TANGENTS[i] * dt, b.x, X_TANGENTS[i + 1] * dt, t),
        rotY: hermite(a.rotY, ROT_TANGENTS[i] * dt, b.rotY, ROT_TANGENTS[i + 1] * dt, t),
      }
    }
  }
  const last = KEYFRAMES[KEYFRAMES.length - 1]
  return { x: last.x, rotY: last.rotY }
}

const Z_STOPS: { at: number; z: number }[] = [
  { at: 0, z: BASE_POSITION[2] },
  { at: 150, z: BASE_POSITION[2] - 1.5 },
  { at: 225, z: BASE_POSITION[2] - 1.5 },
  { at: 450, z: BASE_POSITION[2] + 1 },
]

function getSkyZ(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), Z_STOPS[Z_STOPS.length - 1].at)
  for (let i = 0; i < Z_STOPS.length - 1; i++) {
    const a = Z_STOPS[i]
    const b = Z_STOPS[i + 1]
    if (clamped <= b.at) {
      const t = (clamped - a.at) / (b.at - a.at)
      return a.z + (b.z - a.z) * smoothstep(t)
    }
  }
  return Z_STOPS[Z_STOPS.length - 1].z
}

const Y_STOPS: { at: number; yOffset: number }[] = [
  { at: 0, yOffset: 0 },
  { at: 300, yOffset: 0 },
  { at: 450, yOffset: 3 },
]

function getSkyY(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), Y_STOPS[Y_STOPS.length - 1].at)
  for (let i = 0; i < Y_STOPS.length - 1; i++) {
    const a = Y_STOPS[i]
    const b = Y_STOPS[i + 1]
    if (clamped <= b.at) {
      const t = (clamped - a.at) / (b.at - a.at)
      const isFinalStretch = i === Y_STOPS.length - 2
      const eased = isFinalStretch ? t * t * t : smoothstep(t)
      return a.yOffset + (b.yOffset - a.yOffset) * eased
    }
  }
  return Y_STOPS[Y_STOPS.length - 1].yOffset
}

export interface AvatarControllerHandle {
  spinAndTransform: (target: ModelKind) => Promise<void>
  flyUp: () => Promise<void>
  beginSkyJourney: () => void
  setSkyOffset: (offsetZ: number) => void
  moveToIslandEdge: () => Promise<void>
  diveUnderwater: () => Promise<void>
}

export type ModelKind = "base" | "dragonite" | "scuba"

// Island's sand/water boundary sits at x = -6. The walk stops well short of
// it; the dive covers the rest of the approach plus the leap out over the water.
const WALK_TARGET_X = -4.4
const DIVE_TARGET_X = -7.5
const DIVE_HOP_HEIGHT = 1
const DIVE_DEPTH = 6

export const AvatarController = forwardRef<AvatarControllerHandle>((_props, ref) => {
  const group = useRef<Group>(null)
  const [modelKind, setModelKind] = useState<ModelKind>("base")
  const skyBaseY = useRef(0)

  useImperativeHandle(ref, () => ({
    spinAndTransform: (target: ModelKind) =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap
          .timeline({ onComplete: () => resolve() })
          .to(group.current.rotation, { y: "+=" + Math.PI, duration: 0.5, ease: "power1.in" })
          .call(() => setModelKind(target))
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
    beginSkyJourney: () => {
      if (group.current) skyBaseY.current = group.current.position.y
    },
    setSkyOffset: (offset: number) => {
      if (!group.current) return
      const pose = getChoreographedPose(offset)
      group.current.position.x = pose.x
      group.current.position.y = skyBaseY.current + getSkyY(offset)
      group.current.position.z = getSkyZ(offset)
      group.current.rotation.y = pose.rotY
    },
    moveToIslandEdge: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap.to(group.current.position, {
          x: WALK_TARGET_X,
          duration: 0.9,
          ease: "power1.inOut",
          onComplete: () => resolve(),
        })
      }),
    diveUnderwater: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap
          .timeline({ onComplete: () => resolve() })
          .to(group.current.position, { x: DIVE_TARGET_X, duration: 1.7, ease: "power1.inOut" }, 0)
          .to(group.current.position, { y: "+=" + DIVE_HOP_HEIGHT, duration: 0.4, ease: "power1.out" }, 0)
          .to(group.current.position, { y: "-=" + (DIVE_HOP_HEIGHT + DIVE_DEPTH), duration: 1.3, ease: "power2.in" }, 0.4)
      }),
  }))

  return (
    <group ref={group} position={BASE_POSITION} rotation={BASE_ROTATION}>
      <Suspense fallback={null}>
        {modelKind === "base" && <Avatar scale={1.4} />}
        {modelKind === "dragonite" && <Dragonite scale={1.4} />}
        {modelKind === "scuba" && <Scuba scale={1.4} />}
      </Suspense>
    </group>
  )
})

AvatarController.displayName = "AvatarController"
