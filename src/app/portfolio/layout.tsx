import type { Metadata } from "next"
import Link from "next/link"

import "./styles.css"

/** The written half of the site.
 *
 *  There was no layout here at all: three of the four pages rendered a bare
 *  <main> with class names (`.about-page`, `.body`) that exist in no
 *  stylesheet, and /portfolio itself 404'd while app/page.tsx prefetched it on
 *  every visit. This is the shared frame -- the stylesheet, the way back to
 *  the island, and metadata that is per-page rather than inherited from the
 *  homepage's "interactive 3D portfolio", which describes none of these.
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
