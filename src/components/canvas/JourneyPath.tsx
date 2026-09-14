"use client"

import { useEffect, useMemo } from "react"
import { Line } from "@react-three/drei"

import {
  JOURNEY_CONTROL_POINTS,
  JOURNEY_LENGTH,
  JOURNEY_LOOK_POINTS,
  JOURNEY_STOPS,
  JOURNEY_STOP_INDICES,
  journeyPolyline,
} from "@/config/journey"

/** The scroll journey's path, drawn in the scene.
 *
 *  Mounted only when the URL carries `?path`, so it can be switched on against
 *  a deployed build without a rebuild -- which is the point: the waypoints in
 *  config/journey.ts are meant to be tuned, and tuning a curve you cannot see
 *  is guesswork.
 *
 *  Orange is the camera's path, dim blue is what it is looking at, and the
 *  rungs between them show where the gaze points at intervals along the way --
 *  a path that clears the geometry but stares at the sky is still wrong, and
 *  the rungs are what make that visible.
 *
 *  It also publishes the sampled points on `window.__journey`, which is how the
 *  clearance check reads the curve: measuring the app's own curve rather than
 *  a reimplementation of it in the test is the difference between verifying
 *  this path and verifying a lookalike. */
export function JourneyPath() {
  const { pathPoints, lookPoints, rungs } = useMemo(() => {
    const pathPoints = journeyPolyline(400)
    const lookPoints = JOURNEY_LOOK_POINTS
    const rungs: [number, number, number][][] = []
    for (let i = 0; i < JOURNEY_CONTROL_POINTS.length; i++) {
      const a = JOURNEY_CONTROL_POINTS[i]
      const b = JOURNEY_LOOK_POINTS[i]
      rungs.push([[a.x, a.y, a.z], [b.x, b.y, b.z]])
    }
    return { pathPoints, lookPoints, rungs }
  }, [])

  useEffect(() => {
    const w = window as unknown as { __journey?: unknown }
    w.__journey = {
      path: pathPoints.map((p) => [p.x, p.y, p.z]),
      controls: JOURNEY_CONTROL_POINTS.map((p) => [p.x, p.y, p.z]),
      looks: JOURNEY_LOOK_POINTS.map((p) => [p.x, p.y, p.z]),
      stops: JOURNEY_STOPS,
      length: JOURNEY_LENGTH,
    }
    return () => {
      delete w.__journey
    }
  }, [pathPoints])

  return (
    // Named so that anything walking the scene graph can tell this overlay
    // apart from the world. The clearance check measures the path against the
    // terrain, and without a name it measured it against these markers instead
    // -- which sit exactly ON the path, and duly reported a clearance of 0.06.
    <group name="journey-path-debug" renderOrder={2000}>
      <Line points={pathPoints} color="#ff7a1a" lineWidth={2} depthTest={false} />
      <Line points={lookPoints} color="#2f6fff" lineWidth={1} dashed dashSize={0.6} gapSize={0.4} depthTest={false} />
      {rungs.map((pts, i) => (
        <Line key={i} points={pts} color="#7a9cff" lineWidth={0.7} transparent opacity={0.5} depthTest={false} />
      ))}
      {JOURNEY_CONTROL_POINTS.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.45, 12, 12]} />
          {/* Destinations in white, tunable waypoints in orange, so it is
              obvious at a glance which spheres are yours to move. */}
          <meshBasicMaterial color={JOURNEY_STOP_INDICES.has(i) ? "#ffffff" : "#ff7a1a"} depthTest={false} />
        </mesh>
      ))}
    </group>
  )
}
