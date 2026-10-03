"use client"

import { createContext, useContext, type RefObject } from "react"

/** How open a portal is, 0..1, published to whatever is inside it.
 *
 *  HotspotPortal already keeps this ramp -- it is what fades the room's lights
 *  up as you arrive and down as you leave (`live` at HotspotPortal.tsx). Until
 *  now only PortalRoom could see it, because the interior is passed in as
 *  `children` from app/page.tsx and there is no prop path from the portal to
 *  its own contents.
 *
 *  An interior needs it for the same reason the lights do: a portal is a small
 *  window in the island when it is shut and the whole screen when it is open,
 *  and content sized for one is wrong for the other. The globe showed this
 *  plainly -- tuned to fill the open view, it overflowed and cropped inside the
 *  closed window.
 *
 *  Context rather than module state keyed by id: MeshPortalMaterial renders its
 *  children into a scene of their own but they are still the same React tree,
 *  so a provider reaches them, and an interior does not have to know which
 *  portal it is in.
 *
 *  A ref, not a value -- this changes every frame and must not re-render. Read
 *  it inside useFrame. */
export const PortalLiveContext = createContext<RefObject<{ value: number }> | null>(null)

/** The live ramp of the portal this component is inside, or null when it is
 *  not inside one. Callers must cope with null: /portfolio renders the same
 *  interiors outside any portal. */
export function usePortalLive() {
  return useContext(PortalLiveContext)
}
