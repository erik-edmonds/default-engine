"use client"

import { useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"

import { angleDelta, mapHeading, worldToMap } from "@/config/minimap"
import { getMinimapHeadingFocus, getMinimapPoints, publishMinimapHeading } from "@/helpers/minimap"

// This file used to hold MinimapRenderer as well: 250 lines that photographed
// the island into a 512-square render target once per session, hiding every
// light, nulling the scene background and fog, overriding the ocean shader's
// uniforms and putting all of it back afterwards. The map renders itself now
// (see canvas/MiniIsland.tsx), so none of that mutation happens at all.
//
// What is left is the half that was never about the photograph.

/** How fast the map swings round to the visitor's side of the island.
 *
 *  Damped rather than followed exactly, for two reasons. The camera's azimuth
 *  jitters under the cursor-parallax look, and a map that mirrored it would
 *  shimmer; and a routed flight changes bearing much faster than anything worth
 *  watching, so the model would whip round and arrive before you did. This is
 *  slow enough to read as the map catching up with you. */
const HEADING_SMOOTH = 2.2

/** Below this, a change of heading is not worth a redraw.
 *
 *  The mini canvas renders on demand, so every published heading is a frame it
 *  has to draw. Half a degree is under one pixel of movement at the widget's
 *  size, and this is what lets a parked camera settle to no draws at all
 *  instead of trembling forever a thousandth of a radian short. */
const HEADING_EPSILON = 0.009

/**
 * Where the visitor is, and which way the map is facing.
 *
 * Runs in the ISLAND's canvas, not the map's, because both answers come from
 * the island camera. Writes straight onto the DOM nodes rather than lifting
 * anything into React state -- the same technique HintAnchor uses, and for the
 * same reason: these change every frame, and a re-render per frame to move a
 * handful of dots would be the most expensive cheap feature in the project.
 */
export function MinimapMarker() {
  const { camera } = useThree()
  const smoothed = useRef<number | null>(null)
  const published = useRef(0)

  useFrame((_state, delta) => {
    // A hovered destination in the expanded map takes over, so the island
    // turns to show that viewpoint. It runs through the same damping as the
    // visitor's own bearing, which is what makes it a swing rather than a cut.
    const target = getMinimapHeadingFocus() ?? mapHeading(camera.position.x, camera.position.z)

    // First frame snaps; after that it eases. Starting from 0 would spin the
    // map from its old fixed bearing to wherever you actually are, once, on
    // every load.
    if (smoothed.current === null) smoothed.current = target
    else {
      const step = angleDelta(smoothed.current, target)
      smoothed.current += step * Math.min(1, delta * HEADING_SMOOTH)
    }
    const heading = smoothed.current

    if (Math.abs(angleDelta(published.current, heading)) > HEADING_EPSILON) {
      published.current = heading
      publishMinimapHeading(heading)
    }

    const points = getMinimapPoints()
    if (points.size === 0) return
    for (const point of points) {
      const world = point.world ?? camera.position
      const { u, v } = worldToMap(world.x, world.z, published.current)
      // Clamped rather than hidden: the camera can sit a little outside the
      // square during a wide flight, and a dot that blinks out mid-journey
      // reads as broken. Far outside -- the sky journey, 100 units up -- the
      // whole widget is unmounted by the page instead.
      point.el.style.left = `${Math.min(100, Math.max(0, u * 100)).toFixed(2)}%`
      point.el.style.top = `${Math.min(100, Math.max(0, v * 100)).toFixed(2)}%`
    }
  })

  return null
}
