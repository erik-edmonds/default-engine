"use client"

import { useEffect, useRef } from "react"
import { useSetAtom } from "jotai"

import { PLACE_LIST, PIN_COLOUR } from "@/config/places"
import { globeMarkerNodes, hoveredPlace } from "@/helpers/globeMarker"

/** The pins on the globe inside the Gallery portal.
 *
 *  The DOM half. Position comes from PlacePinsAnchor, inside <Canvas>, which
 *  writes a transform onto each node every frame -- this component owns only
 *  what a pin looks like and says. Same split as HintAnchor / SceneHint.
 *
 *  A <button> rather than a div with a :hover rule, for two reasons. Hover
 *  does not exist on a phone, and the link behind a pin is the point of the
 *  gallery -- so a tap has to work as well as a pointer. And a control only
 *  a mouse can reach is unreachable by keyboard; as a button it takes focus,
 *  and focus reveals the same link hover does. */
export function GlobeMarker() {
  return (
    <>
      {PLACE_LIST.map(({ country, kind }) => (
        <Pin key={country} country={country} colour={PIN_COLOUR[kind]} />
      ))}
    </>
  )
}

function Pin({ country, colour }: { country: string; colour: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const setHovered = useSetAtom(hoveredPlace)

  // Always mounted, so the node the anchor writes to is stable for the life
  // of the page -- the same reasoning SceneHint records for hintNode. It
  // starts hidden and stays hidden until a projected frame places it, or it
  // would flash at the viewport's top-left corner.
  useEffect(() => {
    const node = ref.current
    if (node) globeMarkerNodes.set(country, node)
    return () => {
      globeMarkerNodes.delete(country)
      // Never leave the panel showing a link for a pin that has gone.
      setHovered((at) => (at === country ? null : at))
    }
  }, [country, setHovered])

  return (
    <div ref={ref} className="globe-pin" style={{ visibility: "hidden" }}>
      <button
        type="button"
        className="globe-pin-hit"
        aria-label={country}
        onPointerEnter={() => setHovered(country)}
        onPointerLeave={() => setHovered((at) => (at === country ? null : at))}
        onFocus={() => setHovered(country)}
        onBlur={() => setHovered((at) => (at === country ? null : at))}
      >
        {/* The teardrop map pin, drawn rather than pulled from an icon font:
            one <path> weighs nothing against a dependency, and the colour has
            to come from the place's own kind. The tip of the drop is at the
            bottom of the viewBox, which is what lets the wrapper sit exactly
            on the country and the pin stand above it. */}
        <svg className="globe-pin-drop" viewBox="0 0 24 32" aria-hidden="true">
          <path
            d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 20 12 20s12-11.6 12-20c0-6.6-5.4-12-12-12z"
            fill={colour}
          />
          <circle cx="12" cy="12" r="4.4" fill="#fff" />
        </svg>
        <span className="globe-pin-label">{country}</span>
      </button>
    </div>
  )
}
