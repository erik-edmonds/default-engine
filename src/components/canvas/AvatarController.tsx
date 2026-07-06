"use client"

import { forwardRef, useImperativeHandle, useRef, useState, Suspense } from "react"
import type { Group } from "three"
import gsap from "gsap"
import { Avatar } from "@/components/models/Avatar"
import { Dragonite } from "@/components/models/Dragonite"
import { Scuba } from "@/components/models/Scuba"

// Matches the Avatar's position/rotation in Scene.tsx
const BASE_POSITION: [number, number, number] = [-1.3, -0.65, 1]
const BASE_ROTATION: [number, number, number] = [0, 0, 0]

// Choreographed stops the avatar interpolates between as the user scrolls —
// x is world-space (camera sits fixed at x=-1.3, see CameraController), rotY
// is the avatar's own yaw (0 = facing +Z = facing the camera, since the
// camera and avatar face each other at rest; π/2 = facing +X = facing screen-
// right; π = facing -Z = facing away from camera). yOffset is added on top of
// wherever flyUp() left the avatar (captured in beginSkyJourney) — it's 0
// until the final stop, where the avatar rises toward the top-right corner as
// it turns away. Z stays fixed throughout — a staged performance, not travel.
const KEYFRAMES: { at: number; x: number; yOffset: number; rotY: number }[] = [
  { at: 0, x: BASE_POSITION[0], yOffset: 0, rotY: 0 }, // original position, facing camera
  { at: 150, x: 1.7, yOffset: 0, rotY: 0 }, // right side of screen, still facing camera
  // Smaller offset than the right-side stop above — rotated to a narrow side
  // profile here (no wide wingspan giving visual margin like the front-facing
  // pose), so the same offset would push it almost entirely off-screen.
  { at: 300, x: -2.3, yOffset: 0, rotY: Math.PI / 2 }, // left side of screen, facing screen-right
  { at: 450, x: 6.7, yOffset: 3.5, rotY: Math.PI }, // rises toward top-right (not all the way), exits off-screen, facing away
]

function getChoreographedPose(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), KEYFRAMES[KEYFRAMES.length - 1].at)
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i]
    const b = KEYFRAMES[i + 1]
    if (clamped <= b.at) {
      const t = (clamped - a.at) / (b.at - a.at)
      // Ease-in (cubic) for the rise only — subtle at first, quicker toward
      // the end — while x/rotY keep a steady, linear pace.
      const yT = t * t * t
      return {
        x: a.x + (b.x - a.x) * t,
        yOffset: a.yOffset + (b.yOffset - a.yOffset) * yT,
        rotY: a.rotY + (b.rotY - a.rotY) * t,
      }
    }
  }
  const last = KEYFRAMES[KEYFRAMES.length - 1]
  return { x: last.x, yOffset: last.yOffset, rotY: last.rotY }
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

// Roughly the water's edge on the island's left/west side — approximate,
// tune by eye. Water surface is a good deal below the resting height.
const ISLAND_EDGE_X = -6
// The walk only covers the first half of the distance; the jump/dive covers
// the rest (see moveToIslandEdge/diveUnderwater), like a running leap into
// the water rather than walking right up to the edge first.
const ISLAND_HALFWAY_X = (BASE_POSITION[0] + ISLAND_EDGE_X) / 2
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
          // Spin halfway (now facing away) before swapping the model — hides
          // the hard mesh-swap cut, since a model switch can't be crossfaded.
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
    // Captures the height flyUp() landed at, so KEYFRAMES' yOffset can rise
    // relative to it (z stays fixed — no equivalent capture needed there).
    beginSkyJourney: () => {
      if (group.current) skyBaseY.current = group.current.position.y
    },
    // Moves through the KEYFRAMES sequence (x + y + facing) as offset increases.
    setSkyOffset: (offset: number) => {
      if (!group.current) return
      const pose = getChoreographedPose(offset)
      group.current.position.x = pose.x
      group.current.position.y = skyBaseY.current + pose.yOffset
      group.current.rotation.y = pose.rotY
    },
    // Slides left only halfway to the water edge — no camera movement, no
    // rotation change, just a straightforward glide. The rest of the distance
    // is covered by the leap in diveUnderwater.
    moveToIslandEdge: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap.to(group.current.position, {
          x: ISLAND_HALFWAY_X,
          duration: 1.1,
          ease: "power1.inOut",
          onComplete: () => resolve(),
        })
      }),
    // A running leap from the halfway point: covers the remaining horizontal
    // distance to the water's edge over the whole jump, while hopping up then
    // plunging down below the surface.
    diveUnderwater: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap
          .timeline({ onComplete: () => resolve() })
          .to(group.current.position, { x: ISLAND_EDGE_X, duration: 1.7, ease: "power1.inOut" }, 0)
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
