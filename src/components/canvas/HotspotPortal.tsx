"use client"

import type { ReactNode } from "react"
import * as THREE from "three"

import Frame from "@/components/canvas/Card"

// A portfolio portal standing permanently in the island scene at a hotspot's
// viewpoint, with a carved frame around it so it reads as something built
// rather than a rectangle hanging in the air.
//
// The portal itself is the ORIGINAL <Frame> from Card.tsx -- the same
// component app/portfolio renders, with its own Text labels, rounded-plane
// geometry, MeshPortalMaterial and double-click-to-enter behaviour. Nothing
// about it is reimplemented here; this only places it and builds the frame.
//
// Navigation is unchanged: the ring markers (CameraHotspot.tsx) still own it.
// Click a ring, the camera flies to that viewpoint, and this is what's waiting
// in front of it.

const FRAME_THICKNESS = 0.08
const FRAME_DEPTH = 0.11
const FRAME_COLOR = "black"

// Card.tsx's own defaults -- WIDTH * 1.5 and GOLDEN_RATIO * 1.5. Repeated here
// so the carved frame can be built to match the portal it surrounds; if those
// defaults ever change, these follow.
const PORTAL_WIDTH = 1.5
export const PORTAL_HEIGHT = 1.61803398875 * 1.5

/** Distance in front of a viewpoint at which its portal stands. At fov 45 a
 *  ~2.43-tall portal covers roughly two-thirds of frame height here: dominant
 *  enough to be the subject, open enough that the scene still reads round it. */
export const PORTAL_VIEW_DISTANCE = 4.5

/** Where a portal goes for a given camera viewpoint. The plane's +Z is its
 *  normal, so giving it the camera's own rotation points it straight back at
 *  the camera (which looks down its own -Z). */
export function portalTransformFor(
  viewpointPosition: THREE.Vector3,
  viewpointRotation: THREE.Euler,
  distance = PORTAL_VIEW_DISTANCE,
) {
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(viewpointRotation)
  return {
    position: viewpointPosition.clone().addScaledVector(forward, distance),
    rotation: viewpointRotation.clone(),
    forward,
  }
}

/** Carved surround: four bars and four corner blocks, sized to Card.tsx's
 *  rounded-rectangle portal. Rectangular rather than an arch precisely so it
 *  matches that original shape -- an arch would leave the portal's square
 *  corners poking out of it. Low segment counts + flatShading to sit in the
 *  island's faceted art style, and a standard material so it picks up the
 *  time-of-day rig like any other object on the island. */
function CarvedFrame({ width, height }: { width: number; height: number }) {
  const outerW = width + FRAME_THICKNESS
  const outerH = height + FRAME_THICKNESS
  const bar = (args: [number, number, number], position: [number, number, number], key: string) => (
    <mesh key={key} castShadow receiveShadow position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={FRAME_COLOR} roughness={0.9} flatShading />
    </mesh>
  )

  return (
    <group>
      {bar([outerW, FRAME_THICKNESS, FRAME_DEPTH], [0, outerH / 2, 0], "top")}
      {bar([outerW, FRAME_THICKNESS, FRAME_DEPTH], [0, -outerH / 2, 0], "bottom")}
      {bar([FRAME_THICKNESS, outerH, FRAME_DEPTH], [-outerW / 2, 0, 0], "left")}
      {bar([FRAME_THICKNESS, outerH, FRAME_DEPTH], [outerW / 2, 0, 0], "right")}
      {/* Corner blocks -- the join detail that stops it reading as four
          extruded rectangles meeting at nothing. */}
      {/* {[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].map(([sx, sy]) =>
        bar(
          [FRAME_THICKNESS * 1.5, FRAME_THICKNESS * 1.5, FRAME_DEPTH * 1.4],
          [(sx * outerW) / 2, (sy * outerH) / 2, 0],
          `corner-${sx}-${sy}`,
        ),
      )} 
      {[-1, 1].map((sx) =>
        bar(
          [FRAME_THICKNESS * 2.2, FRAME_THICKNESS * 0.7, FRAME_DEPTH * 1.8],
          [(sx * outerW) / 2, -outerH / 2 - FRAME_THICKNESS * 0.7, 0],
          `plinth-${sx}`,
        ),
      )} */}
    </group>
  )
}

export interface HotspotPortalProps {
  position: THREE.Vector3
  rotation: THREE.Euler
  /** Passed straight through to Card.tsx's Frame -- this is the id its own
   *  wouter route (`/item/:id`) matches on to blend itself open. */
  id: string
  name: string
  author: string
  bg?: string
  /** Whether this portal can be opened right now -- true only once the camera
   *  is actually at the hotspot it stands in front of. The portal is always
   *  visible either way; this only controls whether it answers the pointer. */
  interactive?: boolean
  /** The portal's contents, e.g. <Gltf src="/models/tea.glb" />. */
  children: ReactNode
}

export function HotspotPortal({ position, rotation, id, name, author, bg, interactive = true, children }: HotspotPortalProps) {
  return (
    <group position={position} rotation={rotation}>
      <CarvedFrame width={PORTAL_WIDTH} height={PORTAL_HEIGHT} />
      <Frame id={id} name={name} author={author} bg={bg} interactive={interactive}>
        {children}
      </Frame>
    </group>
  )
}
