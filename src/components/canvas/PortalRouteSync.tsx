"use client"

import { useEffect, useRef, type RefObject } from "react"
import * as THREE from "three"
import { useAtomValue, useSetAtom } from "jotai"
import { useLocation, useRoute } from "wouter"

import { openPortalId, portalEnterRequest, portalExitRequest } from "@/helpers/StateProvider"
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
  /** Called with the portal being entered, so the page can record WHERE that
   *  is. It used to take no argument and only played a sound, which was enough
   *  while every entry came from double-clicking a portal you had already flown
   *  to -- the hotspot was recorded on the way in. Landing straight on
   *  /item/:id skips that flight entirely, so nothing knew which destination
   *  the camera was standing at, and the next trip home computed its route from
   *  "home" to "home" and did nothing at all. */
  onEnter?: (portal: PortalRouteSyncPortal) => void
}) {
  const [, setLocation] = useLocation()
  const [, route] = useRoute("/item/:id")
  const exit = useAtomValue(portalExitRequest)
  const enter = useAtomValue(portalEnterRequest)
  const setOpenPortalId = useSetAtom(openPortalId)

  const enteredId = route?.id ?? null

  // Mirror the route out to an atom. The route stays the source of truth; this
  // is purely so code outside <Canvas> -- which can't call wouter at all, see
  // the note above -- can tell whether a portal is open. Currently that's the
  // hint director.
  useEffect(() => {
    setOpenPortalId(enteredId)
    return () => setOpenPortalId(null)
  }, [enteredId, setOpenPortalId])
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
      onEnter?.(portal)
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

  // Someone asked for a portal to open -- the keyboard rail, currently. Routed
  // through wouter exactly as a double-click is, so there is one way a portal
  // opens rather than two that can drift.
  useEffect(() => {
    if (enter.seq === 0 || !enter.id) return
    setLocation(`/item/${enter.id}`)
  }, [enter, setLocation])

  // Someone asked for the portal to close (see portalExitRequest).
  //
  // `flyBack` is the caller's intent, and it decides whether the exit flight
  // above runs. A jump or a ring click is already flying somewhere else and
  // suppresses it; the home button pressed inside a portal wants exactly that
  // flight -- back out to the viewpoint the portal is seen from -- and is the
  // reason this atom carries an intent rather than being a bare counter.
  useEffect(() => {
    if (exit.seq === 0) return
    if (!lastEnteredId.current) return
    suppressExitFlight.current = !exit.flyBack
    setLocation("/")
  }, [exit, setLocation])

  return null
}
