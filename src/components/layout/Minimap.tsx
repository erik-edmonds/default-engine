"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import { Canvas } from "@react-three/fiber"

import { registerMinimapPoint } from "@/helpers/minimap"
import { MiniIsland, MiniMapCamera } from "@/components/canvas/MiniIsland"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"
import { JOURNEY_STOPS, journeyPose } from "@/config/journey"
import type { JourneyStopId } from "@/config/journey"
import * as THREE from "three"

/** The four destinations, in WORLD space.
 *
 *  World, not map percentages, and that is the change the turning map forced.
 *  These used to be `{u, v}` computed once at module load -- correct only while
 *  the view was fixed. The map swings round the island now, so a baked
 *  percentage is wrong the moment you walk anywhere, and every marker is
 *  re-projected each frame through the live heading instead (see
 *  MinimapMarker).
 *
 *  It also takes the hydration problem away rather than working around it: the
 *  old version had to round `journeyPose`'s output to six decimals because the
 *  server and the client disagreed on its last two digits and React reported a
 *  mismatch on the SVG attributes. Nothing about a position is serialised into
 *  the HTML any more.
 *
 *  The camera's ROUTE used to be drawn here too, as a 401-point polyline taken
 *  from the journey's own curve. It is gone: the moving dot already says where
 *  you are, and the line's bounds were what forced the map wide enough to leave
 *  the island small. `journeyPolyline` still exists for the `?path` debug
 *  overlay.
 */
const STOPS: { id: JourneyStopId; x: number; z: number }[] = (() => {
  const position = new THREE.Vector3()
  const look = new THREE.Vector3()
  return JOURNEY_STOPS.map((stop) => {
    journeyPose(stop.u, position, look)
    return { id: stop.id, x: position.x, z: position.z }
  })
})()

export { STOPS as MINIMAP_STOPS }

/** Registers a node as a point on the map, positioned every frame from the
 *  world coordinate it stands for. `world` null means the visitor's own dot. */
function useMinimapPoint(world: { x: number; z: number } | null) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return registerMinimapPoint({ el, world })
    // `world` is a fresh object each render for the stops, so it is compared by
    // its two numbers rather than by identity.
  }, [world?.x, world?.z, world])
  return ref
}

/** One destination marker. A div rather than an SVG circle, so the same code
 *  that moves the visitor's dot can move it -- an SVG circle is positioned by
 *  geometry attributes, not by `left`/`top`, and would have needed a second
 *  mechanism for no gain. */
function Stop({ x, z, active }: { x: number; z: number; active?: boolean }) {
  const world = useMemo(() => ({ x, z }), [x, z])
  const ref = useMinimapPoint(world) as React.RefObject<HTMLDivElement | null>
  return <div ref={ref} className="minimap-stop" data-active={active ? "true" : undefined} aria-hidden="true" />
}

/** A destination's 44px hit target, on the same footing. */
function StopHit({ x, z, label, onPick, onHover }: {
  x: number; z: number; label: string; onPick: () => void; onHover?: (on: boolean) => void
}) {
  const world = useMemo(() => ({ x, z }), [x, z])
  const ref = useMinimapPoint(world) as React.RefObject<HTMLButtonElement | null>
  return (
    <button
      ref={ref}
      type="button"
      className="minimap-hit"
      aria-label={label}
      onClick={onPick}
      // Focus as well as hover, so a keyboard visitor tabbing the map gets the
      // same preview a pointer does.
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
      onFocus={() => onHover?.(true)}
      onBlur={() => onHover?.(false)}
    />
  )
}

/** The shared innards: the island, the destinations, the dot.
 *
 *  One component for both sizes so the corner widget and the full-screen
 *  overlay cannot drift apart -- they are the same map, and the only difference
 *  between them is how big it is drawn and whether the destinations are
 *  clickable. */
export function MinimapFace({
  interactive = false,
  labels,
  onPick,
  phase = "day",
  activeStop = null,
  onHoverStop,
}: {
  interactive?: boolean
  labels?: Record<string, string>
  onPick?: (id: JourneyStopId) => void
  phase?: TimeOfDay
  /** The destination being previewed, from the list or from the map itself. */
  activeStop?: JourneyStopId | null
  onHoverStop?: (id: JourneyStopId | null) => void
}) {
  const markerRef = useMinimapPoint(null) as React.RefObject<HTMLDivElement | null>

  return (
    <div className="minimap-face">
      {/* The island, live, in its own renderer.
          
          This was a 2D canvas holding a 512-square photograph of the scene,
          which is why the map looked like a low-resolution texture at both
          sizes -- it was one, stretched. A real render at the canvas's own
          device resolution is sharp by construction.

          frameloop="demand" is what makes that affordable. Nothing in here
          animates (the sea is a flat colour, deliberately), so it draws on
          mount, on resize and on a change of light, and then never again --
          the same budget as the still it replaces.

          pointerEvents none: the 44px .minimap-hit buttons and the widget's own
          <button> have to keep receiving the clicks. */}
      <Canvas
        aria-hidden="true"
        frameloop="demand"
        orthographic
        gl={{ alpha: true, antialias: true }}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <MiniMapCamera />
        <Suspense fallback={null}>
          <MiniIsland phase={phase} />
        </Suspense>
      </Canvas>
      {/* The destinations and the visitor's dot, over the island. All of them
          are positioned every frame by MinimapMarker, because the map turns. */}
      {STOPS.map((stop) => (
        <Stop key={stop.id} x={stop.x} z={stop.z} active={stop.id === activeStop} />
      ))}
      <div ref={markerRef} className="minimap-you" aria-hidden="true" />
      {interactive && onPick && (
        <div className="minimap-hits">
          {STOPS.map((stop) => (
            <StopHit
              key={stop.id}
              x={stop.x}
              z={stop.z}
              label={`Travel to ${labels?.[stop.id] ?? stop.id}`}
              onPick={() => onPick(stop.id)}
              onHover={(on) => onHoverStop?.(on ? stop.id : null)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The corner widget.
 *
 * Desktop only, like the ring markers: touch navigates by scrolling an
 * itinerary and already has the rail, so a map there would be a third answer to
 * a question already answered twice.
 */
export function Minimap({ visible, onOpen, phase }: { visible: boolean; onOpen: () => void; phase: TimeOfDay }) {
  return (
    <button
      type="button"
      className="minimap"
      // Always ready now. It used to wait for the photograph to be published,
      // which could not happen until the island had settled; the live canvas
      // has nothing to wait for beyond its own Suspense.
      data-ready="true"
      aria-label="Open the island map"
      onClick={onOpen}
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <MinimapFace phase={phase} />
    </button>
  )
}
