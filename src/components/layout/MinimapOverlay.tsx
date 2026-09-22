"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import type { JourneyStopId } from "@/config/journey"
import { MINIMAP_STOPS, MinimapFace } from "@/components/layout/Minimap"
import { mapHeading } from "@/config/minimap"
import { setMinimapHeadingFocus } from "@/helpers/minimap"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"

/**
 * The island map, full screen, with the destinations named beside it.
 *
 * The markers and the list are two routes to the same `onPick`, not two
 * features. The map answers "where is that" and the list answers "what is
 * there" -- and the list is what makes this operable by keyboard at all, since
 * a marker positioned on a photograph is not something Tab can find its way
 * around sensibly.
 */
export function MinimapOverlay({
  open,
  labels,
  currentStop,
  onPick,
  onClose,
  phase = "day",
}: {
  open: boolean
  labels: Record<string, string>
  currentStop: string
  onPick: (id: JourneyStopId) => void
  onClose: () => void
  /** Lights the miniature. Passed through rather than read here so the corner
   *  widget and the expanded map cannot end up lit differently. */
  phase?: TimeOfDay
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<JourneyStopId | null>(null)

  // Pointing at a destination turns the island to show it from THAT viewpoint.
  //
  // It is a preview of where you are about to go, and it costs nothing to
  // compute: the same mapHeading the visitor's own bearing comes from, handed
  // to the same damping, so the model swings rather than cutting. Clearing it
  // hands control back and the island swings home again.
  const hover = useCallback((id: JourneyStopId | null) => {
    setHovered(id)
    const stop = id ? MINIMAP_STOPS.find((s) => s.id === id) : null
    setMinimapHeadingFocus(stop ? mapHeading(stop.x, stop.z) : null)
  }, [])

  // Released on close as well as on mouse-out. Without this, closing the map
  // while pointing at a name would leave the island stuck facing that
  // destination for the rest of the session.
  useEffect(() => {
    if (open) return
    setHovered(null)
    setMinimapHeadingFocus(null)
  }, [open])
  useEffect(() => () => setMinimapHeadingFocus(null), [])

  // Escape closes, matching the portals. Bound only while open so it cannot
  // swallow the key from anything else.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  // Move focus into the panel on open, so a keyboard visitor is where the
  // controls are rather than back at the top of the document.
  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLButtonElement>("button.minimap-name")?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="minimap-overlay" role="dialog" aria-modal="true" aria-label="Island map">
      <div className="minimap-overlay-panel" ref={panelRef}>
        <div className="minimap-overlay-map">
          <MinimapFace
            interactive
            labels={labels}
            onPick={onPick}
            phase={phase}
            activeStop={hovered}
            onHoverStop={hover}
          />
        </div>
        <nav className="minimap-names" aria-label="Destinations">
          {MINIMAP_STOPS.map((stop, i) => (
            <button
              key={stop.id}
              type="button"
              className="minimap-name"
              // The stop you are already at is marked rather than removed: it
              // is the answer to "where am I", which is half of what this
              // overlay is for.
              aria-current={stop.id === currentStop ? "true" : undefined}
              data-active={stop.id === hovered ? "true" : undefined}
              onClick={() => onPick(stop.id)}
              // Focus mirrors hover so tabbing the list previews each
              // destination exactly as pointing at it does.
              onPointerEnter={() => hover(stop.id)}
              onPointerLeave={() => hover(null)}
              onFocus={() => hover(stop.id)}
              onBlur={() => hover(null)}
            >
              <span className="minimap-name-index">{String(i + 1).padStart(2, "0")}</span>
              <span className="minimap-name-label">{labels[stop.id] ?? stop.id}</span>
            </button>
          ))}
        </nav>
      </div>
      <button type="button" className="minimap-close" onClick={onClose} aria-label="Close the map">
        Close
      </button>
    </div>
  )
}
