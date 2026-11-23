"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { lensNode, useLensPanel } from "@/helpers/lensPanel"
import { opticsRun } from "@/helpers/optics"

/** How close to the edge the orb may sit and still carry the panel.
 *
 *  The same pixel inset HintAnchor uses, and for the reason written out
 *  there: a fraction of NDC reserves ten times as much of a phone as it does
 *  of a desktop, which is backwards. */
const EDGE_INSET_PX = 24

/** Puts the lens panel where the beacon is.
 *
 *  THE BEACON'S POSITION IS ALREADY PUBLISHED. BeaconCompanion writes it into
 *  `opticsRun.beacon` every frame so OpticsPulse can use it as the sweep's
 *  origin; this costs one project() on top of that and no new plumbing at all.
 *
 *  Same split as HintAnchor and NavigationProjector, for the same two
 *  reasons: the projection needs the camera so it lives inside <Canvas>, and
 *  the thing it positions is a DOM node outside that tree. Writing
 *  `el.style.transform` in a frame callback rather than re-rendering React for
 *  a position change is the technique this project uses everywhere.
 *
 *  Deliberately not drei's <Html>: unused everywhere else here, and it would
 *  mount a wrapper div and its own per-frame transform to do what one
 *  project() call does.
 */
export function LensAnchor() {
  const { open } = useLensPanel()
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const v = useMemo(() => new THREE.Vector3(), [])
  /** Last visibility written, so a closed panel costs one assignment rather
   *  than a style write every frame. */
  const shown = useRef(false)

  useFrame(() => {
    const el = lensNode.current
    if (!el) return

    if (!open) {
      if (shown.current) {
        shown.current = false
        el.style.visibility = "hidden"
      }
      return
    }

    const point = v.copy(opticsRun.beacon).project(camera)
    // z > 1 is behind the camera, where project() still returns a plausible
    // x/y mirrored through the origin -- which would park the panel on the
    // opposite side of the frame from the orb it belongs to. The same trap
    // HintAnchor documents.
    const marginX = 1 - (2 * EDGE_INSET_PX) / size.width
    const marginY = 1 - (2 * EDGE_INSET_PX) / size.height
    if (point.z > 1 || Math.abs(point.x) > marginX || Math.abs(point.y) > marginY) {
      if (shown.current) {
        shown.current = false
        el.style.visibility = "hidden"
      }
      return
    }

    const x = (point.x * 0.5 + 0.5) * size.width
    const y = (-point.y * 0.5 + 0.5) * size.height
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`
    if (!shown.current) {
      shown.current = true
      el.style.visibility = "visible"
    }
  })

  return null
}
