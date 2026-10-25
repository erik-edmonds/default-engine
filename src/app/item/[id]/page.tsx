import { IslandMount } from "@/components/island/IslandMount"

/**
 * The shareable portal URL.
 *
 * Card.tsx enters a portal by pushing `/item/:id` through wouter, and until now
 * there was no Next route behind that path at all. The URL bar changed, the
 * portal opened, and everything looked right -- but refreshing or sharing the
 * link hit the server, matched nothing, and served the 404. That is the one URL
 * a visitor is most likely to copy. It also destroyed the `/portfolio` URL the
 * same way, since opening a card there pushes the same path.
 *
 * This mounts the island itself, unchanged -- and it mounts IslandMount
 * rather than the home route, so the home page's own copy (the hero, the
 * structured data) does not appear over a shared portal link. A visitor
 * following `/item/02` asked for a portal, not a pitch. No new wiring is needed to open
 * the right portal: wouter reads `location` at render, sees `/item/01`, and
 * Card.tsx's existing `useRoute('/item/:id')` damps that portal's blend open on
 * its own -- the same code path a double-click uses.
 */
export function generateStaticParams() {
  // Prerendered rather than dynamic, so a shared link is served from the CDN
  // exactly like `/`. These are the ids in HOTSPOT_PORTALS and the four frames
  // on /portfolio; an id outside the list simply opens no portal, which is a
  // better failure than a 404.
  return [{ id: "01" }, { id: "02" }, { id: "03" }, { id: "04" }]
}

export default function ItemPage() {
  return <IslandMount />
}
