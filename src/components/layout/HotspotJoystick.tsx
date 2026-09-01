"use client"

import { useRef, useState } from "react"
import { useSfx } from "@/helpers/useSfx"

const BASE_SIZE = 112 // px, glass puck diameter
const STICK_SIZE = 46 // px, outer ring/collar diameter
const RING_THICKNESS = 5 // px, how much of the collar shows around the cap
const DEAD_ZONE = 16 // px of drag before a direction is considered "chosen"
const MAX_STICK_DISPLACEMENT = 24 // px, how far the knob can travel from center

type Direction = "up" | "down" | "left" | "right"

export interface HotspotJoystickDirection {
  id: string
  label: string
  onSelect: () => void
}

interface HotspotJoystickProps {
  directions: Record<Direction, HotspotJoystickDirection>
  /** The hotspot the camera is currently at -- dims the live label if it's
   *  ever dragged toward this direction (pressing it is still harmless;
   *  flyToHotspot already no-ops for the current location), since there's
   *  nowhere to go that way. */
  currentId: string
  visible: boolean
}

/* ------------------------------------------------------------------ *
 * Mobile-only directional joystick: press anywhere on the base and drag
 * toward a direction; release to fly there. Directions are fixed
 * screen-space slots (not live camera bearings), so this is a plain
 * event-driven interaction -- ordinary React state, no per-frame
 * imperative ref-writing needed.
 *
 * Release-to-commit: `activeDirection` is re-evaluated continuously while
 * dragging (so the label above the stick can live-update as the user
 * changes their mind mid-drag) but the actual navigation only fires once,
 * in the pointerup/pointercancel handler, using whatever direction was
 * active at that moment.
 * ------------------------------------------------------------------ */

export function HotspotJoystick({ directions, currentId, visible }: HotspotJoystickProps) {
  const play = useSfx()
  const [dragging, setDragging] = useState(false)
  const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 })
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null)
  const startRef = useRef({ x: 0, y: 0 })

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    startRef.current = { x: e.clientX, y: e.clientY }
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    const dist = Math.hypot(dx, dy)
    const clamped = Math.min(dist, MAX_STICK_DISPLACEMENT)
    const angle = Math.atan2(dy, dx)
    setStickOffset({ x: Math.cos(angle) * clamped, y: Math.sin(angle) * clamped })
    setActiveDirection(
      dist < DEAD_ZONE
        ? null
        : Math.abs(dx) > Math.abs(dy)
          ? dx > 0 ? "right" : "left"
          : dy > 0 ? "down" : "up"
    )
  }

  const handlePointerUp = () => {
    if (activeDirection) {
      play("click")
      directions[activeDirection].onSelect()
    }
    setDragging(false)
    setStickOffset({ x: 0, y: 0 })
    setActiveDirection(null)
  }

  const activeIsCurrent = activeDirection !== null && directions[activeDirection].id === currentId

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: "relative",
        width: BASE_SIZE,
        height: BASE_SIZE,
        borderRadius: "9999px",
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(6px)",
        border: "1px solid rgba(255,255,255,0.25)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.4s ease",
        touchAction: "none",
        userSelect: "none",
        cursor: "pointer",
      }}
    >
      {/* Live direction readout -- only exists while a direction is
          actively chosen; gone the instant the drag returns to center or
          the press ends, matching the "no labels at rest" spec. */}
      <div
        className="font-nunito"
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "50%",
          bottom: "100%",
          marginBottom: 12,
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          padding: "6px 16px",
          borderRadius: "9999px",
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(6px)",
          border: "1px solid rgba(210,90,26,0.6)",
          fontSize: 11,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: activeIsCurrent ? "rgba(255,255,255,0.5)" : "#fff",
          opacity: activeDirection ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        {activeDirection ? directions[activeDirection].label : ""}
      </div>

      {/* Outer collar -- a metallic-ish amber sweep standing in for the
          ring/bevel on a real analog stick cap. The drag-follow transform
          lives here (on the whole assembly), not on the cap inside it. */}
      <div
        aria-hidden="true"
        className={dragging ? "" : "joystick-stick-settle"}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: STICK_SIZE,
          height: STICK_SIZE,
          borderRadius: "9999px",
          padding: RING_THICKNESS,
          background: "conic-gradient(from 180deg, #f2d9b8, #c98a4b, #7a4a22, #c98a4b, #f2d9b8)",
          boxShadow: "0 0 14px 2px rgba(210,90,26,0.5), 0 2px 4px rgba(0,0,0,0.4)",
          transform: `translate(calc(-50% + ${stickOffset.x}px), calc(-50% + ${stickOffset.y}px))`,
        }}
      >
        {/* Concave cap -- darker toward the center, brighter toward the rim
            (the rim is the highest point of a dish, so it catches the most
            light; the recessed center catches the least), plus a strong
            top-down inset shadow pooling into the depression and a thin
            bright inset lip at the bottom. The *opposite* shading direction
            of a convex dome/marble, which is what a naive bright-corner
            highlight (tried first) actually reads as. */}
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "9999px",
            background: "radial-gradient(circle at 50% 55%, #a8481a 0%, #c8531c 45%, #e8834a 85%, #f5a56a 100%)",
            boxShadow: "inset 0 6px 10px rgba(0,0,0,0.55), inset 0 -2px 3px rgba(255,255,255,0.25)",
          }}
        />
      </div>
    </div>
  )
}
