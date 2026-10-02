import type { Metadata } from "next"
import Link from "next/link"

import { CONTACT_LINKS } from "@/config/portals"
import { PROJECTS } from "@/config/projects"

/** The index of the written work.
 *
 *  THIS ROUTE DID NOT EXIST. app/page.tsx has been calling
 *  `router.prefetch("/portfolio")` on every visit since the dive was removed,
 *  against a 404 -- and the Models portal, which is the destination the whole
 *  camera journey is built to arrive at, rendered nothing at all once you got
 *  inside it. This is where it goes now.
 *
 *  A server component: there is nothing interactive on it, so there is no
 *  reason to ship it to the client. The three write-ups are the same.
 */

export const metadata: Metadata = {
  title: "Work",
  description:
    "Gaussian splatting, autonomous driving in CARLA, object detection, and an interactive election map. Erik Edmonds, data scientist — available for freelance and contract work.",
}

export default function Page() {
  return (
    <main>
      <p className="pf-eyebrow">Erik Edmonds · Data Scientist</p>
      <h1 className="pf-title">Four things I&rsquo;ve built</h1>
      <p className="pf-lead">
        I work on the end of machine learning where a model has to survive contact with the
        world: scenes reconstructed from photographs, policies driving in closed loop,
        detectors scored on the cases that actually matter. I&rsquo;m available for freelance
        and contract work.
      </p>

      <ul className="pf-list">
        {PROJECTS.map((project) => (
          <li key={project.id}>
            {/* The whole row is the link, not four words inside it -- see the
                note on .pf-row. The accent is set per row from the project's
                own colour, which is the same value its card and its point
                cloud use, so the column reads as four pieces of work. */}
            <Link
              href={project.href}
              className="pf-row"
              style={{ ["--pf-accent" as string]: project.accent }}
            >
              <span className="pf-row-num">{project.label}</span>
              <span className="pf-row-title">{project.title}</span>
              <span className="pf-row-blurb">{project.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="pf-pitch">
        <h2 className="pf-h2">Working together</h2>
        <p>
          I take on freelance and contract work — modelling, computer vision, simulation, and
          the visualisation that makes any of it legible to the people paying for it. If
          you have something in that shape, I&rsquo;d like to hear about it.
        </p>
        <p>
          The island you came in through is mine too: React Three Fiber, no template, every
          scene built and tuned by hand. It is the longest answer I have to &ldquo;can he
          ship something finished.&rdquo;
        </p>
        <ul className="pf-links">
          {CONTACT_LINKS.map((link) => (
            <li key={link.href}>
              <a className="pf-link" href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
