"use client"

import { Suspense, useEffect, useState } from "react"
import { Environment, OrbitControls, PerspectiveCamera } from "@react-three/drei"

import { Car } from "./Car"
import { Ground } from "./Ground"
import { Track } from "./Track"
import Barrels from "./Barrel"
import { RACING_ASSET } from "./paths"

/** How many camera views C cycles through: free orbit, chase, front, and
 *  the driver's own view. */
const VIEWS = 4

export function RacingScene() {
  const [cameraView, setCameraView] = useState(0)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "KeyC") return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      setCameraView((view) => (view + 1) % VIEWS)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <Suspense fallback={null}>
      {/* `background` alone, where the original passed "both". drei 10
          narrowed the prop to boolean | "only"; plain `background` is what
          "both" used to mean -- the HDR lights the scene AND is drawn
          behind it. */}
      <Environment files={RACING_ASSET("textures/envmap.hdr")} background />
      {/* Only view 0 is the camera's own; the rest are driven from Car's
          frame loop, which is why OrbitControls is mounted for that one
          view only -- two things writing camera.position would fight. */}
      <PerspectiveCamera makeDefault position={[-21, 34, 55]} fov={40} />
      {cameraView === 0 && <OrbitControls target={[0, 0, 0]} />}

      <Car cameraView={cameraView} />
      <Ground />
      <Track />
      <Barrels />
    </Suspense>
  )
}
