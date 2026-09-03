"use client"

import { useRef, useState } from "react"
import { useSfx } from "@/helpers/useSfx"

const BASE_SIZE = 112 // px, glass puck diameter
const STICK_SIZE = 46 // px, knob diameter
const DEAD_ZONE = 16 // px of drag before a direction is considered "chosen"
const MAX_STICK_DISPLACEMENT = 24 // px, how far the knob can travel from center
const ACCENT = "#d25a1a" // the site's base accent, used flat (no gradient/shading)

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
          borderRadius: "2px",
          background: ACCENT,
          // Same reasoning as InteractionHint.tsx's caption: font-nunito was
          // already on this element and resolving, but 11px all-caps at 0.2em
          // tracking and weight 400 renders Nunito indistinguishable from
          // Helvetica. Heavier and tighter is what makes the typeface read.
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: activeIsCurrent ? "rgba(255,255,255,0.5)" : "#fff",
          opacity: activeDirection ? 1 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        {activeDirection ? directions[activeDirection].label : ""}
      </div>

      {/* Flat knob -- a single solid-color amber disc, no ring/collar or
          concave shading, per the site's flat-design direction. */}
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
          background: ACCENT,
          boxShadow: "0 0 14px 2px rgba(210,90,26,0.5)",
          transform: `translate(calc(-50% + ${stickOffset.x}px), calc(-50% + ${stickOffset.y}px))`,
        }}
      />
    </div>
  )
}
