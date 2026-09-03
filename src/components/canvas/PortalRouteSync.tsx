"use client"

import { useEffect, useRef, type RefObject } from "react"
import * as THREE from "three"
import { useAtomValue } from "jotai"
import { useLocation, useRoute } from "wouter"

import { portalExitRequest } from "@/helpers/StateProvider"
import type { CameraControllerHandle } from "@/components/canvas/CameraController"

// Keeps the camera in step with the portals' own routing.
//
// Card.tsx's <Frame> owns entering a portal entirely: double-clicking it sets
// the wouter route to /item/:id, and that route is what damps its portal blend
// open. None of that is reimplemented -- this watches the same route and flies
// the camera the last few units in, then back out again when it clears.
//
// It has to live INSIDE <Canvas>. wouter's default router reads `location` at
// render time, and "/" is statically prerendered, so any wouter hook at the
// page's top level fails the build with "ReferenceError: location is not
// defined". r3f never renders Canvas children on the server, which is also why
// app/portfolio has always been able to use Card.tsx's wouter calls safely.

export interface PortalRouteSyncPortal {
  /** Matches Card.tsx's Frame id, i.e. the :id in /item/:id. */
  id: string
  /** The island waypoint this portal stands in front of. */
  hotspotId: string
  position: THREE.Vector3
  rotation: THREE.Euler
  forward: THREE.Vector3
}

export function PortalRouteSync({
  portals,
  viewpoints,
  cameraControllerRef,
  enterInset,
  onEnter,
}: {
  portals: PortalRouteSyncPortal[]
  viewpoints: Record<string, { position: THREE.Vector3; rotation: THREE.Euler }>
  cameraControllerRef: RefObject<CameraControllerHandle | null>
  /** How far short of the portal plane the camera stops. */
  enterInset: number
  onEnter?: () => void
}) {
  const [, setLocation] = useLocation()
  const [, route] = useRoute("/item/:id")
  const exitRequest = useAtomValue(portalExitRequest)

  const enteredId = route?.id ?? null
  const lastEnteredId = useRef<string | null>(null)
  // Set when something else (a ring click, the home button) closes the portal
  // on its way elsewhere, so the exit flight below doesn't fight the flight
  // that's already underway.
  const suppressExitFlight = useRef(false)

  useEffect(() => {
    const previous = lastEnteredId.current
    lastEnteredId.current = enteredId

    if (enteredId) {
      const portal = portals.find((p) => p.id === enteredId)
      if (!portal) return
      onEnter?.()
      const target = portal.position.clone().addScaledVector(portal.forward, -enterInset)
      cameraControllerRef.current?.flyTo(target, portal.rotation, 1.8)
      return
    }

    if (suppressExitFlight.current) {
      suppressExitFlight.current = false
      return
    }
    if (!previous) return
    const portal = portals.find((p) => p.id === previous)
    const viewpoint = portal && viewpoints[portal.hotspotId]
    if (viewpoint) cameraControllerRef.current?.flyTo(viewpoint.position, viewpoint.rotation, 1.8)
    // portals/viewpoints are module-level constants; onEnter is a stable
    // callback. Only the route should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enteredId])

  // Someone asked for the portal to close (see portalExitRequest).
  useEffect(() => {
    if (exitRequest === 0) return
    if (!lastEnteredId.current) return
    suppressExitFlight.current = true
    setLocation("/")
  }, [exitRequest, setLocation])

  return null
}
