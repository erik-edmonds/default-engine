"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"

import type { JourneyStopId } from "@/config/journey"
import { MINIMAP_STOPS, MinimapFace } from "@/components/layout/Minimap"
import { mapHeading } from "@/config/minimap"
import { setMinimapHeadingFocus } from "@/helpers/minimap"
import { prefersReducedMotion, tweenDuration } from "@/helpers/motion"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"

/** ONE MAP. The corner widget and the expanded map are the same element.
 *
 *  THEY USED TO BE TWO, and the seam was visible. Opening unmounted the
 *  corner `<Minimap>` and mounted a fresh `<MinimapFace>` inside an overlay,
 *  with a FLIP tween to make the second grow out of where the first had been.
 *  The tween was correct and ran exactly as written. It was also invisible,
 *  for a reason that only a measurement finds: the new face brings a new
 *  `<Canvas>`, and a new Canvas is a new WebGL context that has to be created,
 *  have the island loaded into it, and be drawn.
 *
 *  Measured on this machine, from the click:
 *
 *      t = +128 ms   the fourth renderer is created
 *      t = +146 ms   it draws for the first time
 *      t = +139 ms   the grow is already at scale 0.90
 *
 *  So for the first ~146 ms the thing being grown was an EMPTY BOX, and by the
 *  time anything appeared in it the animation was 90% finished. What a person
 *  sees is a dark scrim and then a full-size map, which is exactly what was
 *  reported: "the large one just appears".
 *
 *  Growing one element removes the cause rather than hiding it. There is a
 *  single Canvas, created once with the page, never unmounted, already drawn
 *  long before anyone clicks. It also takes the page from four live WebGL
 *  contexts back to three, which is the thing the old comment here was worried
 *  about in the first place.
 *
 *  TRANSFORM, NEVER WIDTH AND HEIGHT. The element is laid out at its EXPANDED
 *  size and scaled DOWN into the corner, so the canvas's backing store is
 *  sized once, for the big view, and never resized by the animation -- a
 *  resize would reallocate the drawing buffer and redraw the island on every
 *  frame of the transition. The corner map is then a 702px render displayed in
 *  222px, i.e. supersampled roughly 3x, which is sharper than the 222px canvas
 *  it replaces.
 */
export function MinimapStage({
  open,
  visible,
  labels,
  currentStop,
  onOpen,
  onClose,
  onPick,
  phase = "day",
}: {
  open: boolean
  /** The corner map hides during the sky sequence and inside a portal. */
  visible: boolean
  labels: Record<string, string>
  currentStop: string
  onOpen: () => void
  onClose: () => void
  onPick: (id: JourneyStopId) => void
  phase?: TimeOfDay
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const namesRef = useRef<HTMLElement>(null)
  const [hovered, setHovered] = useState<JourneyStopId | null>(null)

  /** Pointing at a destination turns the island to show it from THAT
   *  viewpoint -- a preview of where you are about to go, through the same
   *  damping the visitor's own bearing uses. */
  const hover = useCallback((id: JourneyStopId | null) => {
    setHovered(id)
    const stop = id ? MINIMAP_STOPS.find((s) => s.id === id) : null
    setMinimapHeadingFocus(stop ? mapHeading(stop.x, stop.z) : null)
  }, [])

  // Release the heading when this goes away, or closing while pointing at a
  // name leaves the island stuck facing that destination for the session.
  useEffect(() => () => setMinimapHeadingFocus(null), [])

  /** Where the corner is, relative to where the map is laid out.
   *
   *  Measured from `.minimap-slot`, an empty element carrying the corner's own
   *  CSS, so the two states have ONE definition of the corner geometry and a
   *  change to the inset or the size cannot leave the animation landing
   *  somewhere else. The map's own rect has to be read with its transform
   *  cleared, because getBoundingClientRect reports the transformed box. */
  const collapsed = useCallback(() => {
    const map = mapRef.current
    const slot = slotRef.current
    if (!map || !slot) return null
    const applied = gsap.getProperty(map, "scale")
    gsap.set(map, { clearProps: "transform" })
    const natural = map.getBoundingClientRect()
    const corner = slot.getBoundingClientRect()
    if (applied !== 1) gsap.set(map, { x: gsap.getProperty(map, "x"), y: gsap.getProperty(map, "y"), scale: applied })
    if (!natural.width || !corner.width) return null
    return {
      x: corner.left - natural.left,
      y: corner.top - natural.top,
      scale: corner.width / natural.width,
    }
  }, [])

  /** The dots are absolute pixel sizes -- 10px stops, a 13px "you are here",
   *  44px hit targets -- and they live INSIDE the scaled element, so without
   *  this they would be drawn at a third of their size in the corner. The
   *  counter is the reciprocal of whatever scale the tween is passing through,
   *  published as a custom property the dots multiply themselves by. */
  const setCounter = useCallback((scale: number) => {
    mapRef.current?.style.setProperty("--map-counter", String(1 / (scale || 1)))
  }, [])

  // Put the map in the corner before the first paint, or it shows full-screen
  // for a frame on load.
  useLayoutEffect(() => {
    const c = collapsed()
    if (!c) return
    gsap.set(mapRef.current, { transformOrigin: "0 0", ...c })
    setCounter(c.scale)
  }, [collapsed, setCounter])

  // Keep the corner geometry right across a resize. Only while closed: a
  // resize mid-animation is not worth chasing, and while open the map is at
  // its natural size anyway.
  useEffect(() => {
    if (open) return
    const onResize = () => {
      const c = collapsed()
      if (!c) return
      gsap.set(mapRef.current, { transformOrigin: "0 0", ...c })
      setCounter(c.scale)
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open, collapsed, setCounter])

  /** THE GROW, and the shrink: one tween on one element, in both directions.
   *
   *  No FLIP, no captured rectangle, no module-level handoff between an
   *  element that is unmounting and one that is mounting -- there is only ever
   *  the one element, and the two states are just two transforms. */
  useEffect(() => {
    const map = mapRef.current
    const scrim = scrimRef.current
    const names = namesRef.current
    if (!map || !scrim) return

    const target = open ? { x: 0, y: 0, scale: 1 } : collapsed()
    if (!target) return
    const reduced = prefersReducedMotion()
    const duration = reduced ? 0 : tweenDuration(open ? 0.62 : 0.44)

    const tween = gsap.to(map, {
      transformOrigin: "0 0",
      ...target,
      duration,
      // power2, NOT power3. The point of this animation is that you can see
      // the corner map travel and grow; power3.out spends half the distance
      // in the first fifth of the time, which lands it near its final size
      // before the eye has found it and reads almost like a cut. power2 keeps
      // the middle of the journey on screen long enough to be read as one.
      ease: open ? "power2.out" : "power2.in",
      // Written every frame rather than tweened as its own property, so the
      // dots cannot lag the box they sit in by even one frame.
      onUpdate: () => setCounter(gsap.getProperty(map, "scale") as number),
      onComplete: () => setCounter(target.scale),
    })
    gsap.to(scrim, { opacity: open ? 1 : 0, duration: duration * 0.8, ease: open ? "power2.out" : "power2.in" })
    if (names) {
      gsap.to(names, {
        opacity: open ? 1 : 0,
        duration: duration * 0.5,
        // The map leads and the list follows it in; on the way out the list
        // goes first, so it is never left hanging beside a map that has
        // already shrunk away.
        delay: open ? duration * 0.45 : 0,
      })
    }
    return () => { tween.kill() }
  }, [open, collapsed, setCounter])

  // Escape closes, like the backdrop and the button.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Move focus to the list on open, so a keyboard visitor lands on controls.
  useEffect(() => {
    if (!open) return
    namesRef.current?.querySelector<HTMLButtonElement>("button.minimap-name")?.focus()
  }, [open])

  return (
    <div
      className="minimap-stage"
      data-open={open ? "true" : "false"}
      ref={stageRef}
      aria-hidden={!open && !visible ? "true" : undefined}
    >
      {/* The corner's geometry, and nothing else. Never painted; it exists so
          the closed state is defined in CSS beside everything else rather
          than as numbers in a tween. */}
      <div className="minimap-slot" ref={slotRef} aria-hidden="true" />

      <div
        className="minimap-scrim"
        ref={scrimRef}
        onPointerDown={() => { if (open) onClose() }}
      />

      <div className="minimap-stage-panel">
        <div
          className="minimap-stage-map"
          ref={mapRef}
          // Hidden with the rest of the chrome during the sky sequence and
          // inside a portal -- but only while closed, since an open map is
          // the thing being looked at.
          style={{ opacity: open || visible ? 1 : 0, pointerEvents: open || visible ? "auto" : "none" }}
        >
          <MinimapFace
            interactive={open}
            labels={labels}
            onPick={onPick}
            phase={phase}
            activeStop={hovered}
            onHoverStop={hover}
          />
          {/* The whole map is the button while it is closed. An overlay rather
              than a wrapping <button>, because when open the map's own hit
              targets have to receive the clicks instead. */}
          {!open && (
            <button
              type="button"
              className="minimap-open"
              aria-label="Open the island map"
              onClick={onOpen}
            />
          )}
        </div>

        <nav className="minimap-names" aria-label="Destinations" ref={namesRef}>
          {MINIMAP_STOPS.map((stop, i) => (
            <button
              key={stop.id}
              type="button"
              className="minimap-name"
              // The stop you are already at is marked rather than removed: it
              // is the answer to "where am I", which is half of what this is
              // for.
              aria-current={stop.id === currentStop ? "true" : undefined}
              data-active={stop.id === hovered ? "true" : undefined}
              // Not reachable by Tab while closed, or there would be four
              // invisible buttons in the tab order of every page.
              tabIndex={open ? 0 : -1}
              onClick={() => onPick(stop.id)}
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

      {open && (
        <button type="button" className="minimap-close" onClick={onClose} aria-label="Close the map">
          Close
        </button>
      )}
    </div>
  )
}
