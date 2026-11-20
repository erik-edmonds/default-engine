import type { Metadata } from "next"
import Link from "next/link"

import "./styles.css"

/** The written half of the site.
 *
 *  There was no layout here at all: three of the four pages rendered a bare
 *  <main> with class names (`.about-page`, `.body`) that exist in no
 *  stylesheet. This is the shared frame -- the stylesheet, the way back to
 *  the island, and metadata that is per-page rather than inherited from the
 *  homepage's "interactive 3D portfolio", which describes none of these.
 *
 *  A ROUTE GROUP, SO THE FOLDER IS NOT IN THE URL. These lived under
 *  /portfolio/<slug> behind an index page listing all four. The index is gone
 *  and the pages are top-level -- /detection, /annotation, /gaussian,
 *  /driving, /election -- because the island's portals are how the work is
 *  reached, and a section wrapper that nothing links to is just a longer URL.
 *  `(work)` keeps them sharing this frame without appearing in it.
 *
 *  The root layout already pins the home logo at top-left on every route, so
 *  there is a way out of here even with JavaScript disabled; the text link
 *  below is the one that says in words where it goes.
 */

export const metadata: Metadata = {
  title: {
    // Each page sets its own title; this is the suffix they all share.
    template: "%s | Erik Edmonds",
    default: "Work | Erik Edmonds",
  },
}

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pf">
      <div className="pf-wrap">
        <Link href="/" className="pf-back">
          <span aria-hidden="true">←</span> Back to the island
        </Link>
        {children}
      </div>
    </div>
  )
}
