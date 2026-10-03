import { atom } from "jotai"

/** The DOM nodes the globe's pins are drawn into, one per country.
 *
 *  Module state for the same reason hints.ts gives for `hintNode`: these are
 *  positioned every frame from inside <Canvas>, and the nodes they write to
 *  are siblings of the canvas in a different React tree. Re-rendering React
 *  to move a pin a few pixels would be absurd.
 *
 *  Why DOM pins at all, when the globe is 3D already: it lives inside a
 *  MeshPortalMaterial, which renders its children into a scene of their own.
 *  r3f's raycaster tests the portal's flat mesh, not the contents behind it,
 *  so nothing inside a portal can be hovered -- and hovering a pin is the
 *  whole interaction. The projection is the bridge: the portal is drawn with
 *  the SAME camera as the island, so a world position inside it lands on
 *  screen exactly where it appears to be. */
export const globeMarkerNodes = new Map<string, HTMLElement>()

/** Which pin the pointer is on, or null.
 *
 *  An atom rather than module state, unlike the nodes above, because this
 *  one DOES drive a render: the panel under the globe shows the hovered
 *  place's link. It changes on hover, not per frame, so a render is the
 *  right cost. */
export const hoveredPlace = atom<string | null>(null)
