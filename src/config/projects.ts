/** The four projects, in the order the card column runs.
 *
 *  These used to be the drei portals example's own props -- a jar of pickles, a
 *  teacup and an orange twice -- with three of the four frames named "2" and a
 *  stranger's name on every one. The four project pages they should have been
 *  pointing at have existed in this repo the whole time, linked from nothing.
 *
 *  Each interior is a generated point cloud rather than a downloaded model:
 *  distinct per project by colour and density, owes nobody an attribution, and
 *  adds nothing to the download.
 *
 *  This table lived in app/portfolio/page.tsx, which no longer exists. The
 *  cards are inside the Models portal now -- you scroll down through the pool
 *  past them -- so the one place that owned the list is gone and the config is
 *  where it belongs.
 */

export interface Project {
  id: string
  /** Shown after the slash on a card face, when that is not the id. */
  label: string
  title: string
  blurb: string
  href: string
  accent: string
  count: number
  bg: string
}

/** Kept, unused for the moment, and deliberately so.
 *
 *  These four hung in the Models portal's pool as MeshPortalMaterial cards --
 *  a portal inside a portal, four extra render targets per frame. They were
 *  taken out so the items can go into the water directly instead, and this
 *  table is what they will be built from when they do. The four project pages
 *  under /portfolio/ are live and reachable; nothing currently links to them.
 *
 *  `id` is "work-01".."work-04" rather than "01".."04" on purpose: the wouter
 *  route while you are inside the Models portal IS /item/01, and anything in
 *  there sharing that id blends itself open. Whatever replaces the cards
 *  inherits that constraint. */
export const PROJECTS: Project[] = [
  { id: "work-01", label: "01", title: "Election", blurb: "D3 · county, race, age, education", href: "/portfolio/election", accent: "#6fa8ff", count: 1800, bg: "#0d1b2a" },
  { id: "work-02", label: "02", title: "Detection", blurb: "object detection", href: "/portfolio/detection", accent: "#ffb37a", count: 1100, bg: "#1b1410" },
  { id: "work-03", label: "03", title: "Driving", blurb: "autonomous driving · CARLA", href: "/portfolio/driving", accent: "#7ce3b1", count: 1400, bg: "#0c1a16" },
  { id: "work-04", label: "04", title: "Gaussian", blurb: "gaussian splatting", href: "/portfolio/gaussian", accent: "#d9a7ff", count: 2200, bg: "#150f1c" },
]

/** Vertical gap between cards in the pool, in world units.
 *
 *  Its own constant rather than CameraHelpers' FRAME_SPACING: that one is tied
 *  to the page camera's dolly and to WaterScene's default pool height, and this
 *  column is read through a portal window at a different scale. A card is 2.06
 *  tall at CARD_SCALE, so this leaves about a card's half-height of water
 *  between them. */
export const CARD_GAP = 3.2

/** Where the first card sits, relative to the interior group's origin.
 *
 *  Just below the frame's bottom edge rather than centred in it: the camera
 *  sees open water with the top of a card intruding, which is what says there
 *  is something to scroll to. Centring the first card instead makes the portal
 *  look finished and nobody scrolls. */
export const CARD_TOP = -1.2

/** Card size in the pool. The default Frame is 1.5 x 2.427; at this scale it is
 *  1.28 x 2.06, about two thirds of the frame height when the portal is open
 *  (the camera sees 3.08 units of height at the column's distance). */
export const CARD_SCALE = 0.85
