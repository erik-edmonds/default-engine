/** What each portal contains, and where it goes.
 *
 *  The journey exists to arrive at these three, and until now all three held
 *  the same `earth.glb` at three different scales with another artist's name
 *  printed on the face -- a credit inherited verbatim from the drei portals
 *  example, where it belongs to that example's pickles/tea/orange models. The
 *  arrival was the one part of the experience nobody had designed.
 *
 *  One table so a destination cannot drift out of step with itself: the rail,
 *  the ring marker, the portal face and the panel behind it all read from here.
 */

/** The island waypoint a portal stands in front of. */
export type PortalHotspotId = "left-tree" | "moon-island" | "upper"

/** Which interior renders inside the portal's own scene. */
export type PortalInteriorKind = "points" | "globe" | "avatar"

export type PortalDestination =
  /** Entering offers a link out to another page. */
  | { kind: "route"; href: string; label: string }
  /** Entering offers a set of contact links, in the scene. */
  | { kind: "links"; links: { label: string; href: string }[] }
  /** Entering tells you something, in the scene, with nowhere else to go.
   *  The paragraphs are the destination. */
  | { kind: "prose"; paragraphs: string[] }
  /** Entering offers nothing yet, and says so rather than pretending. */
  | { kind: "pending"; note: string }

export interface PortalDefinition {
  /** Matches Card.tsx's `/item/:id` route. */
  id: string
  hotspotId: PortalHotspotId
  /** Shown on the portal face, and the heading of the panel behind it. */
  title: string
  /** The small print under the title on the portal face. Describes what is
   *  actually inside -- which is the whole reason the old value was wrong. */
  credit: string
  /** The portal scene's background once its light comes up. */
  bg: string
  interior: PortalInteriorKind
  destination: PortalDestination
  /** One line inside the panel, before the call to action. */
  blurb: string
}

// ---------------------------------------------------------------------------
// THINGS ONLY YOU CAN FILL IN
//
// Two answers came back without their specifics and I would not invent either.
// Both live here, together, so they are one edit rather than a hunt:
//
//   1. CONTACT_LINKS is now real -- nothing to do there.
//   2. ABOUT_PARAGRAPHS below is the About portal's copy. It currently holds
//      the one true line the portal already had; you said you would write the
//      real thing. Replacing it is this one array -- nothing else moves, and
//      the panel sizes itself to however many paragraphs you give it.
// ---------------------------------------------------------------------------

/** The real ones, supplied by Erik. Published deliberately and on request --
 *  putting an address on a public site is the site owner's call, which is why
 *  these sat as declared placeholders rather than being guessed at. */
export const CONTACT_LINKS: { label: string; href: string }[] = [
  { label: "Email", href: "mailto:erikedmonds2019@u.northwestern.edu" },
  { label: "GitHub", href: "https://github.com/erik-edmonds" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/erik-edmonds/" },
]

/** True while the contact links are still the placeholders above. The panel
 *  reads this and says so, rather than presenting dead links as real ones. */
export const CONTACT_LINKS_ARE_PLACEHOLDERS = CONTACT_LINKS.some(
  (l) => l.href.includes("example.com") || l.href.includes("your-handle"),
)

/** REPLACE THIS with the real About copy.
 *
 *  Deliberately NOT a placeholder in the way the contact links are: every line
 *  here is already true, so the portal delivers something honest today rather
 *  than apologising for itself. It used to say "This portal is still being
 *  written" on screen, which is the one thing a finished portfolio cannot do. */
export const ABOUT_PARAGRAPHS: string[] = [
  "Data scientist, digital nomad, certified scuba diver.",
]

export const PORTALS: PortalDefinition[] = [
  {
    id: "01",
    hotspotId: "left-tree",
    title: "Models",
    credit: "point cloud · live",
    bg: "#0d1b2a",
    // A drifting point cloud rather than a downloaded prop: it is generated,
    // so it is the one interior that owes nobody a credit, and it is the
    // closest thing the scene can say about the gaussian-splatting work
    // without shipping a splat.
    interior: "points",
    blurb: "Four projects — an election map in D3, object detection, autonomous driving in CARLA, and gaussian splatting.",
    destination: { kind: "route", href: "/portfolio", label: "View the work" },
  },
  {
    id: "02",
    hotspotId: "moon-island",
    title: "About",
    credit: "earth.glb · see CREDITS.md",
    bg: "#f0f0f0",
    interior: "globe",
    blurb: "A bit about me.",
    destination: { kind: "prose", paragraphs: ABOUT_PARAGRAPHS },
  },
  {
    id: "03",
    hotspotId: "upper",
    title: "Contact",
    credit: "the avatar · this scene",
    bg: "#101820",
    // The avatar from the island itself. Costs nothing -- base.glb is already
    // loaded and cached for the scene -- and it is the only interior that is
    // unambiguously the author's own.
    interior: "avatar",
    blurb: "Let's connect.",
    destination: { kind: "links", links: CONTACT_LINKS },
  },
]

export const portalById = (id: string | null) =>
  id ? PORTALS.find((p) => p.id === id) ?? null : null
