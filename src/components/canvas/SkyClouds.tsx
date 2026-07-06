"use client"

import { Cloud } from "@/components/models/Cloud"

// Anchor: roughly where the camera/avatar sit once the sky journey starts
// (camera lands around y=100 after flyUp(), z=6 after zoomIn() — see
// CameraController). Scroll then moves both forward (-Z) from here, so each
// cloud sits further "ahead" (more negative Z) than the last, along the
// direction of travel. Y stays constant since only Z changes during this phase.
const SKY_ANCHOR_Y = 100
const SKY_ANCHOR_Z = 6
const CLOUD_SPACING = 100
const CLOUD_COUNT = 5

// Pushed well clear of the avatar's straight flight path (x=-1.3) since they
// were previously close enough to clip it.
const CAMERA_X = 20
// Assumed viewing distance (units of Z) used only to estimate the world-space
// X offset for the 10%-from-edge placement below — tune by eye once visible.
const CLOUD_APPROACH_DISTANCE = 50

// Rough perspective estimate for "10% in from the screen edge" at
// CLOUD_APPROACH_DISTANCE units away (45° vertical FOV, ~1400/900 aspect ratio).
const ASPECT_RATIO = 1400 / 900
const HALF_FOV_TAN = Math.tan(( Math.PI) / 180 / 2) * ASPECT_RATIO
const EDGE_FRACTION = 0.4 // 0.5 (center) - 0.1 (10% from edge)
const EDGE_X_OFFSET = EDGE_FRACTION * HALF_FOV_TAN * 2 * CLOUD_APPROACH_DISTANCE

// Each cloud's left/right offset is rotated 15° off pure-sideways (instead of
// straight perpendicular to the flight path), giving a diagonal "weave" rather
// than a rigid zigzag. This is applied per-cloud to its own offset vector, not
// to the row's overall Z-progression — rotating the whole row around a single
// pivot instead makes lateral drift grow unbounded relative to the (shrinking)
// remaining forward distance, pushing later clouds out of view entirely.

const CLOUD_POSITIONS: [number, number, number][] = Array.from({ length: CLOUD_COUNT }, (_, i) => {
  const side = i % 2 === 0 ? -1 : 1 // alternate left/right
  const z = SKY_ANCHOR_Z - CLOUD_SPACING * (i + 1) + side * EDGE_X_OFFSET
  const x = CAMERA_X
  return [x, SKY_ANCHOR_Y, z]
})

export function SkyClouds() {
  return (
    <>
      {CLOUD_POSITIONS.map((position, i) => (
        <Cloud key={i} position={position} scale={4} />
      ))}
    </>
  )
}
