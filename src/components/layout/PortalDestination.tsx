"use client"

import Link from "next/link"
import { useAtomValue } from "jotai"

import { CONTACT_LINKS_ARE_PLACEHOLDERS, type PortalDefinition } from "@/config/portals"
import { PLACES } from "@/config/places"
import { hoveredPlace } from "@/helpers/globeMarker"

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
  // Nothing to say when the interior is the destination -- the whole caption
  // bar goes, not just its button, or a bare title floats over the water.
  if (portal.destination.kind === "none") return null

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
        {/* THE GALLERY PRINTS NO HEADING AND NO CAPTION.
            
            Every other portal is captioned because its interior says one
            thing; this one is a globe you turn and read pins off, so a fixed
            paragraph under it would describe nowhere in particular -- and it
            covered the lower third of the planet while doing it. What goes
            here instead is whatever pin you are pointing at. */}
        {d.kind !== "places" && (
          <>
            <h2
              className="scene-type"
              style={{ margin: 0, fontSize: "clamp(1.4rem, 5vw, 2.2rem)", fontWeight: 700, color: "#ffffff", letterSpacing: "0.01em" }}
            >
              {portal.title}
            </h2>
            {portal.blurb && (
              <p
                className="scene-type"
                style={{ margin: 0, maxWidth: "42ch", fontSize: "clamp(0.85rem, 2.4vw, 1rem)", lineHeight: 1.5, color: "rgba(255,255,255,0.82)" }}
              >
                {portal.blurb}
              </p>
            )}
          </>
        )}

        {d.kind === "places" && <HoveredPlace />}

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

        {d.kind === "prose" && d.paragraphs.map((line) => (
          <p
            key={line}
            className="scene-type"
            style={{ margin: 0, maxWidth: "42ch", fontSize: "clamp(0.85rem, 2.4vw, 1rem)", lineHeight: 1.6, color: "rgba(255,255,255,0.9)" }}
          >
            {line}
          </p>
        ))}

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

/** What the gallery shows: the pin you are pointing at, and its link.
 *
 *  Occupies the same band the caption used to, so the globe's composition is
 *  unchanged -- the space is simply empty until you hover something. It
 *  reserves its height rather than appearing from nothing, or the planet
 *  would jump up and down the frame as the pointer crossed a pin.
 *
 *  A place with no link yet still names itself. config/places.ts ships every
 *  link empty by default, and a pin that silently did nothing would read as
 *  broken rather than as unfinished. */
function HoveredPlace() {
  const country = useAtomValue(hoveredPlace)
  const place = country ? PLACES[country] : null

  return (
    <div style={{ minHeight: "4.2rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
      {country && (
        <>
          <p className="scene-type" style={{ margin: 0, fontSize: "clamp(1.1rem, 3.4vw, 1.5rem)", fontWeight: 700, color: "#ffffff" }}>
            {country}
          </p>
          {place?.link ? (
            <a href={place.link} target="_blank" rel="noopener noreferrer" style={ctaStyle}>
              {linkLabel(place.link)} →
            </a>
          ) : (
            <p className="scene-type" style={{ margin: 0, fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>
              No link yet
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** A link's host, as its label -- "instagram.com" rather than the whole URL,
 *  which would wrap over two lines and read as noise. Falls back to the raw
 *  string for anything that is not a URL, so a relative path still shows. */
function linkLabel(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "")
  } catch {
    return href
  }
}
