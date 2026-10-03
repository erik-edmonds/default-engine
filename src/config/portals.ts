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
export type PortalInteriorKind = "points" | "water" | "avatar" | "globe" | "minigame"

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
  /** Entering shows a gallery of places, and the panel is driven by what you
   *  hover rather than by this table.
   *
   *  The globe portal has no fixed caption: the whole point is that each pin
   *  carries its own link, so a paragraph printed under it would be saying
   *  something about nowhere in particular. config/places.ts is the content. */
  | { kind: "places" }
  /** Entering shows nothing at all, because the interior IS the destination.
   *
   *  Models is the case: you are floating in the pool with the four projects
   *  hanging in it. A title, a blurb and a "View the work" button on top of
   *  that would be telling you to go and see the thing you are looking at. */
  | { kind: "none" }

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

/** The About portal's copy.
 *
 *  THREE PARAGRAPHS, AND A CEILING. The panel is 42ch wide and sits in the
 *  bottom third of the frame over a live point cloud
 *  (PortalDestination.tsx), so this is a caption, not an essay -- past about
 *  three short paragraphs it covers the interior it is captioning. More
 *  depth belongs at /portfolio, which has a column and room to use it.
 *
 *  Every line here is true of what is in this repository or of what Erik has
 *  said. Nothing about employers, dates or titles appears, because none of
 *  that is anywhere in the repo and it is not mine to invent -- that is the
 *  one paragraph still worth adding here, and it is yours to write. */
export const ABOUT_PARAGRAPHS: string[] = [
  "Data scientist. I work where a model has to meet the world — scenes reconstructed from photographs, driving policies tested in simulation, detectors scored on the cases that actually matter.",
  "Also a digital nomad and a certified scuba diver, which between them explain most of the choices made on this island.",
  "Available for freelance and contract work.",
]

export const PORTALS: PortalDefinition[] = [
  {
    id: "01",
    hotspotId: "left-tree",
    title: "Models",
    credit: "the water · live simulation",
    bg: "#06222b",
    // The real underwater scene, running. Entering this portal goes to
    // /portfolio, which IS that scene -- so the window shows its own
    // destination rather than standing in for it. It replaced the point cloud
    // when the dive was removed: the gear on the beach was a second entrance to
    // this same page, and the less findable of the two.
    interior: "water",
    blurb: "Gaussian splatting, autonomous driving in CARLA, object detection, and an interactive election map.",
    // A ROUTE AGAIN, and this time to a page that exists.
    //
    // This was `kind: "none"`, justified in a comment as "you are floating in
    // the pool with the four projects hanging in it". That premise stopped
    // being true the day the cards came out of the water
    // (PortalInteriors.tsx) -- the flagship destination, reached by the
    // hardest interaction on the site, blended open on an empty pool and
    // offered nothing. The written work is at /portfolio now, and this is the
    // mechanism that was already built for exactly this and never used.
    destination: { kind: "route", href: "/portfolio", label: "See the work" },
  },
  {
    id: "02",
    hotspotId: "moon-island",
    title: "Gallery",
    credit: "the places · a turning globe",
    // Dark, where the globe wanted light. The point cloud is unlit
    // meshBasicMaterial with toneMapped off, tuned against this exact value in
    // its old home -- on the old #f0f0f0 it washed out to nothing.
    bg: "#0d1b2a",
    // The globe, turning, with a pin on where Erik currently is -- which is
    // the question the portal's name asks. It replaced a generated point
    // cloud chosen back when this portal was called "About" and the brief was
    // "something abstract".
    interior: "globe",
    // Empty on purpose. The panel under this portal shows a hovered pin's
    // link and nothing otherwise -- see PortalDestination's "places" branch.
    blurb: "",
    destination: { kind: "places" },
  },
  {
    id: "03",
    hotspotId: "upper",
    title: "Mini-Game!",
    credit: "drive it · R3F + cannon",
    bg: "#101820",
    // THE GAME ITSELF, not the avatar that used to stand here.
    //
    // A portal should show what is behind it, and this one showed a figure
    // with no connection to a racing game. The track and the car are the
    // same models /mini-game loads, turning slowly -- no physics world, see
    // MiniGameInterior.
    interior: "minigame",
    // A ROUTE, LIKE MODELS, AND FOR THE SAME REASON.
    //
    // This portal was "Contact" and offered CONTACT_LINKS. It is now the
    // mini-game, and the three things a portal says -- its title, its blurb
    // and where entering it goes -- have to agree or the panel contradicts
    // the face you pressed. The game is a full page with its own canvas and
    // physics world; it could not be the interior of a window in the island
    // scene without running a second simulation behind the first.
    //
    // The contact links did not vanish with it: CONTACT_LINKS is still the
    // one table of them, and the sky journey's own contact card renders from
    // it.
    blurb: "A little car racing game. Drive it with WASD.",
    destination: { kind: "route", href: "/mini-game", label: "Play it" },
  },
]

export const portalById = (id: string | null) =>
  id ? PORTALS.find((p) => p.id === id) ?? null : null
