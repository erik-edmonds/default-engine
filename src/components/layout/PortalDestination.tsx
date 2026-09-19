"use client"

import Link from "next/link"
import { CONTACT_LINKS_ARE_PLACEHOLDERS, type PortalDefinition } from "@/config/portals"

/**
 * What a portal actually delivers once you are inside it.
 *
 * Before this, entering a portal blended a window fullscreen and that was the
 * end of it -- there was nothing in there, nothing to do, and no way onward.
 * The three best things in the repo (four finished project pages and a complete
 * water sim) were linked from nowhere at all, and "Let's Connect — Contact Me"
 * existed only as a caption inside a `pointer-events-none` layer in a sequence
 * that could not be reached.
 *
 * DOM rather than in-scene text: these are links, and a link should be a link
 * -- focusable, hoverable, right-clickable, readable by a screen reader, and
 * openable in a new tab. Troika text in the canvas is none of those.
 */
export function PortalDestination({ portal }: { portal: PortalDefinition }) {
  const d = portal.destination
  return (
    <div
      // Bottom third, not centred: the portal interior is the subject and this
      // is the caption under it.
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(6dvh + var(--safe-bottom, 0px))",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.85rem",
        padding: "0 1.25rem",
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      <div style={{ pointerEvents: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem" }}>
        <h2
          className="scene-type"
          style={{ margin: 0, fontSize: "clamp(1.4rem, 5vw, 2.2rem)", fontWeight: 700, color: "#ffffff", letterSpacing: "0.01em" }}
        >
          {portal.title}
        </h2>
        <p
          className="scene-type"
          style={{ margin: 0, maxWidth: "42ch", fontSize: "clamp(0.85rem, 2.4vw, 1rem)", lineHeight: 1.5, color: "rgba(255,255,255,0.82)" }}
        >
          {portal.blurb}
        </p>

        {d.kind === "route" && (
          <Link href={d.href} style={ctaStyle}>
            {d.label} →
          </Link>
        )}

        {d.kind === "links" && (
          <>
            <nav style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.6rem" }}>
              {d.links.map((l) => (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={ctaStyle}>
                  {l.label}
                </a>
              ))}
            </nav>
            {/* Said out loud rather than shipped quietly: these are the
                placeholder hrefs from config/portals.ts and they do not go
                anywhere yet. A dead link presented as a real one is worse than
                an admitted gap. */}
            {CONTACT_LINKS_ARE_PLACEHOLDERS && (
              <p className="scene-type" style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#ffb37a" }}>
                Placeholder links — not yet live
              </p>
            )}
          </>
        )}

        {d.kind === "pending" && (
          <p className="scene-type" style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#ffb37a" }}>
            {d.note}
          </p>
        )}

        {/* No exit button here. The home button in the corner now steps out of
            a portal to the viewpoint it is seen from, so a second control for
            the same action -- in the most crowded part of the frame, directly
            over the name stamp -- was one too many. */}
      </div>
    </div>
  )
}

const ctaStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.55rem 1.3rem",
  border: "1px solid rgba(210,90,26,0.75)",
  borderRadius: 999,
  background: "rgba(210,90,26,0.16)",
  color: "#ffb37a",
  font: "inherit",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  textDecoration: "none",
  cursor: "pointer",
  backdropFilter: "blur(6px)",
}
