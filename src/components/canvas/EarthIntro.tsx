"use client"

import { Suspense } from "react"
import { Center } from "@react-three/drei"

import { Earth } from "@/components/models/Earth"
import { EARTH_WORLD_POSITION, EARTH_WORLD_SCALE } from "./earthIntroPath"

// Positioned directly on the camera's straight-line flight path from the
// intro's starting shot to the island's resting shot (see
// earthIntroPath.ts). Stays mounted for the whole page lifetime (never
// conditionally unmounted) -- once the camera arrives at the island's
// resting shot, Earth ends up behind the camera, at negligible render cost.

export function EarthIntro({ lit }: { lit: boolean }) {
  return (
    <>
      {/* Without this the canvas has no backdrop at all (white/transparent),
          which both looks wrong for a "spinning globe in space" shot and,
          worse, makes the white-on-day-theme "Erik Edmonds" text invisible
          against it. Harmless once the island scene mounts too -- Day/
          Evening/Night's own giant sky-sphere meshes visually cover this. */}
      <color attach="background" args={["#0a0a0a"]} />
      {/* Lights here aren't scoped to Earth -- in three.js/R3F a light
          anywhere in the tree illuminates the whole scene. That's fine
          (necessary, even) while Earth is the only thing in view, but once
          the island is actually revealed these were stacking on top of
          Day/Evening/Night's own lighting, making the resting homepage look
          permanently over-bright. `lit` is false once the reveal completes
          (Earth is behind the camera by then, so it doesn't need its own
          light anymore) so the island goes back to its originally-tuned
          brightness. */}
      {lit && (
        <>
          <ambientLight intensity={1.2} />
          <directionalLight position={[25, 25, 5]} intensity={2.5} />
        </>
      )}
      <Suspense fallback={null}>
        <group position={EARTH_WORLD_POSITION} scale={EARTH_WORLD_SCALE}>
          <Center>
            <Earth />
          </Center>
        </group>
      </Suspense>
    </>
  )
}
