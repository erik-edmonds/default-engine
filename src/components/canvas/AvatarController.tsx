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
// until the final stop. The final stop's x/yOffset are pulled back from an
// earlier corner-exit design (they used to send the avatar off-screen
// top-right) — now that Z_STOPS below brings the avatar closer to the camera
// for this same stretch, it needs to stay within the (shrinking, as it gets
// closer) frustum instead of exiting via x, so it ends up rising and turning
// away modestly while staying on screen.
const KEYFRAMES: { at: number; x: number; yOffset: number; rotY: number }[] = [
  { at: 0, x: BASE_POSITION[0], yOffset: 0, rotY: 0 }, // original position, facing camera
  // rotY is already a quarter of the way to facing screen-right here (not
  // held at 0) so the turn starts the instant the avatar begins moving
  // right, at the same constant rate all the way through KF2.
  { at: 150, x: 1.53, yOffset: 0, rotY: Math.PI / 4 }, // right side of screen, turning right
  // Smaller offset than the right-side stop above — rotated to a narrow side
  // profile here (no wide wingspan giving visual margin like the front-facing
  // pose), so the same offset would push it almost entirely off-screen.
  { at: 300, x: -2.07, yOffset: 0, rotY: Math.PI / 2 }, // left side of screen, facing screen-right
  { at: 450, x: 4, yOffset: 3, rotY: Math.PI }, // rises while turning fully away, staying visible for most of the approach but clearing the frustum entirely by the very end
]

// Ease-in-out (smoothstep) — zero velocity at both ends of a segment, so
// consecutive segments meet without a sudden change in speed/direction at the
// keyframe in between. Plain linear segments were meeting at sharp angles,
// reading as an abrupt "jerk" at every turn.
function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function getChoreographedPose(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), KEYFRAMES[KEYFRAMES.length - 1].at)
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i]
    const b = KEYFRAMES[i + 1]
    if (clamped <= b.at) {
      const t = (clamped - a.at) / (b.at - a.at)
      const st = smoothstep(t)
      // Ease-in (cubic) for the rise only — subtle at first, quicker toward
      // the end — while x/rotY get the smoothstep ease-in-out above.
      const yT = t * t * t
      return {
        x: a.x + (b.x - a.x) * st,
        yOffset: a.yOffset + (b.yOffset - a.yOffset) * yT,
        rotY: a.rotY + (b.rotY - a.rotY) * st,
      }
    }
  }
  const last = KEYFRAMES[KEYFRAMES.length - 1]
  return { x: last.x, yOffset: last.yOffset, rotY: last.rotY }
}

// Depth (z) is choreographed on its own timeline, independent of the KEYFRAMES
// above — its pacing doesn't line up with the turn/rise breakpoints. The
// avatar recedes as soon as scrolling starts, holds that distance through the
// first turn, then — once the "Pokémon Trainer at Heart" text appears (offset
// 225, matching SKY_TEXT_CUES in page.tsx) — reverses and moves closer for
// the rest of the journey, ending nearer than the resting baseline.
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
    // relative to it (z is absolute world-space, no capture needed there).
    beginSkyJourney: () => {
      if (group.current) skyBaseY.current = group.current.position.y
    },
    // Moves through the KEYFRAMES sequence (x + y + facing) plus the separate
    // Z_STOPS depth timeline as offset increases.
    setSkyOffset: (offset: number) => {
      if (!group.current) return
      const pose = getChoreographedPose(offset)
      group.current.position.x = pose.x
      group.current.position.y = skyBaseY.current + pose.yOffset
      group.current.position.z = getSkyZ(offset)
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
