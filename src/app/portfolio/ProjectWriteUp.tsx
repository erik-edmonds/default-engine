import Link from "next/link"

import { CONTACT_LINKS } from "@/config/portals"
import { PROJECTS, type Project } from "@/config/projects"

/** One project page, rendered from config/projects.ts.
 *
 *  Colocated here rather than in components/layout because nothing outside
 *  /portfolio has any use for it. Not a route: only `page.tsx` is.
 *
 *  Three of the four pages this replaces were byte-identical placeholders, so
 *  the shape of the thing is the point -- a reader who has seen one knows
 *  where to look on the next. Problem, approach, outcome, in that order,
 *  because that is the order someone deciding whether to hire you reads in:
 *  do you understand what is hard here, how do you go at it, and did it work.
 *
 *  Sections whose data is empty are not drawn. config/projects.ts says why
 *  that matters: `stack` and `links` are Erik's to fill in, and an empty
 *  section is honest where "Coming soon" is not.
 */
export function ProjectWriteUp({ project }: { project: Project }) {
  const index = PROJECTS.findIndex((p) => p.id === project.id)
  const previous = index > 0 ? PROJECTS[index - 1] : null
  const next = index >= 0 && index < PROJECTS.length - 1 ? PROJECTS[index + 1] : null

  return (
    // The project's own accent, the same value its card and point cloud use,
    // scoped to this page.
    <main style={{ ["--pf-accent" as string]: project.accent }}>
      <p className="pf-eyebrow">{project.kicker}</p>
      <h1 className="pf-title">{project.title}</h1>
      <p className="pf-lead">{project.blurb}</p>

      <div className="pf-sections">
        <section className="pf-section">
          <h2 className="pf-h2">The problem</h2>
          <p className="pf-body">{project.problem}</p>
        </section>

        <section className="pf-section">
          <h2 className="pf-h2">The approach</h2>
          <p className="pf-body">{project.approach}</p>
        </section>

        <section className="pf-section">
          <h2 className="pf-h2">What it produced</h2>
          <p className="pf-body">{project.outcome}</p>
        </section>

        {project.stack.length > 0 && (
          <section className="pf-section">
            <h2 className="pf-h2">Built with</h2>
            <ul className="pf-chips">
              {project.stack.map((tool) => (
                <li key={tool}>{tool}</li>
              ))}
            </ul>
          </section>
        )}

        {project.links.length > 0 && (
          <section className="pf-section">
            <h2 className="pf-h2">Elsewhere</h2>
            <ul className="pf-links">
              {project.links.map((link) => (
                <li key={link.href}>
                  <a className="pf-link" href={link.href}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="pf-pitch">
        <h2 className="pf-h2">Working together</h2>
        <p>
          I&rsquo;m available for freelance and contract work. If this is the kind of problem
          you have, get in touch.
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

      <nav className="pf-nextprev">
        {previous ? (
          <Link href={previous.href}>
            <span>Previous</span>
            {previous.title}
          </Link>
        ) : (
          <Link href="/portfolio">
            <span>Index</span>
            All work
          </Link>
        )}
        {next && (
          <Link href={next.href} style={{ textAlign: "right" }}>
            <span>Next</span>
            {next.title}
          </Link>
        )}
      </nav>
    </main>
  )
}
