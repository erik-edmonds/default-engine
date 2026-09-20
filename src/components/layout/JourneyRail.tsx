"use client"

import { useEffect, useRef, useState } from "react"

import { JOURNEY_STOP_SCROLL, type JourneyStopId } from "@/config/journey"

/** How long after the scroll stops before the rail fades away.
 *
 *  A scrollbar lingers about a second, but this is a scrollbar you can press:
 *  the visitor stops scrolling, reads which destination is next, and reaches
 *  for it. At 1.2s the rail was already gone and the tap fell through to the
 *  scene behind -- a control that fades has to outlast the time it takes to
 *  decide to use it. Long enough to reach, short enough to still read as
 *  chrome that clears itself. */
const LINGER_MS = 2400
/** ...and how long the fade itself takes, matched to the transition below. */
const FADE_MS = 420

interface JourneyRailProps {
  /** Destination ids in journey order, mapped to their display names. Passed
   *  in rather than imported so the rail and the 3D ring markers can only ever
   *  read the same source. */
  labels: Record<string, string>
  /** True once the scene is live and the rail has something to report. */
  visible: boolean
  /** Lays the rail along the bottom edge instead of up the right one. */
  horizontal: boolean
  /** The destination the camera is parked in front of a portal at, or null
   *  anywhere else -- mid-passage, and at Home, which has no portal. This is
   *  the whole gate: it decides both whether the rail stays up and whether a
   *  tap does anything. */
  parkedAt: JourneyStopId | null
  /** Fly directly to a destination. Only ever called while `parkedAt` is set,
   *  so the caller always knows where the flight is departing from. */
  onJump: (id: JourneyStopId) => void
  /** Open the portal at the stop you are already parked at.
   *
   *  Only supplied by the keyboard rail. Without it the stop you are standing
   *  at is a disabled button -- correct for touch, where the rail is a position
   *  indicator and the portal is right there to be pressed -- but it left a
   *  keyboard user at a destination with no way to go INTO it, since entering
   *  is a double-click or a long-press and a keyboard can produce neither. */
  onEnterPortal?: (id: JourneyStopId) => void
  /** Which stops have a portal to enter. Home does not, so without this the
   *  stop you start at offered an "Enter Home" button that called a handler
   *  with nothing to open -- a dead control, and the first thing a keyboard
   *  user would land on. */
  enterableStops?: ReadonlySet<string>
}

/**
 * Where you are in the scroll journey, and how to leave for somewhere else.
 *
 * Touch only, by mount site. Desktop navigates by clicking four labelled ring
 * markers in the world, which already answer "where can I go" -- a rail there
 * would duplicate them and leave permanent chrome over the scene.
 *
 * Two behaviours, and the second follows from the first:
 *
 * - It behaves like a scrollbar. It appears while the scroll is moving and
 *   clears a couple of seconds after it stops. The journey is fourteen screens
 *   long, and without something marking the four destinations there is no way
 *   to tell how far along it you are or that it ends -- but a permanent
 *   indicator over a scene this carefully lit is a poor trade, so it earns its
 *   place only while you are travelling.
 * - EXCEPT while parked at a portal, when it stays up. Jumping is offered only
 *   there, and a control that hides itself at exactly the moment it becomes
 *   usable is no control at all. That also makes the rail's own presence the
 *   cue that you have arrived somewhere you can go into.
 *
 * A tap flies a direct route (see routeBetween in config/journey.ts). It does
 * NOT scroll the itinerary to the destination: asked for Contact from Donate,
 * that would sweep the camera through Models on the way and announce a place
 * you did not choose.
 */
export function JourneyRail({ labels, visible, horizontal, parkedAt, onJump, onEnterPortal, enterableStops }: JourneyRailProps) {
  const [progress, setProgress] = useState(0)
  const [awake, setAwake] = useState(false)
  // Set while a finger is down on the rail: a control that fades on its own is
  // only usable if touching it keeps it alive.
  const held = useRef(false)
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const read = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0)
    }
    const wake = () => {
      read()
      setAwake(true)
      if (sleepTimer.current) clearTimeout(sleepTimer.current)
      sleepTimer.current = setTimeout(() => {
        if (!held.current) setAwake(false)
      }, LINGER_MS)
    }
    read()
    window.addEventListener("scroll", wake, { passive: true })
    return () => {
      window.removeEventListener("scroll", wake)
      if (sleepTimer.current) clearTimeout(sleepTimer.current)
    }
  }, [])

  const keepAwake = () => {
    held.current = true
    setAwake(true)
    if (sleepTimer.current) clearTimeout(sleepTimer.current)
  }
  const release = () => {
    held.current = false
    if (sleepTimer.current) clearTimeout(sleepTimer.current)
    sleepTimer.current = setTimeout(() => setAwake(false), LINGER_MS)
  }

  // Which destination reads as current: the last one the scroll has reached.
  // Its hold band is generous, so this changes over exactly as you arrive.
  let current = 0
  for (let i = 0; i < JOURNEY_STOP_SCROLL.length; i++) {
    if (progress >= JOURNEY_STOP_SCROLL[i].scroll - 0.004) current = i
  }

  // Percentages, rounded to something a browser will serialise back unchanged.
  //
  // `${stop.scroll * 100}%` produces "30.16430927577099%", which is what goes
  // into the server HTML -- but a browser normalises a CSS percentage when it
  // parses it, so the hydrating client reads the property back as "30.1643%".
  // React compares the two strings, finds them different, and reports a
  // hydration mismatch.
  //
  // It never surfaced while this rail was `{isCoarsePointer && ...}`: that is
  // false on the server AND on the first client render, so the rail was not
  // part of hydration at all. Rendering it for keyboard users is what exposed
  // it.
  //
  // Number() after toFixed is the load-bearing half -- it strips trailing
  // zeros, so 71.8260 becomes 71.826, which is exactly what the browser
  // serialises. toFixed alone would swap this mismatch for a different one.
  // Three decimals is far below one device pixel on any rail height.
  const pct = (n: number) => `${Number(n.toFixed(3))}%`

  const canJump = parkedAt !== null
  const shown = visible && (awake || canJump)
  // Which axis a stop's position is written to. The rest of the difference
  // between the two orientations is CSS.
  const along = horizontal ? "left" : "top"

  return (
    <nav
      aria-label="Journey progress"
      className="journey-rail"
      data-horizontal={horizontal ? "true" : "false"}
      // Arrow keys move between stops, which is the toolbar pattern a keyboard
      // user will try first. Tab already steps through them, so this is an
      // addition rather than the only way in -- if it fails, nothing is lost.
      onKeyDown={(event) => {
        const forward = event.key === "ArrowDown" || event.key === "ArrowRight"
        const back = event.key === "ArrowUp" || event.key === "ArrowLeft"
        if (!forward && !back) return
        const stops = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button.journey-rail-stop:not([disabled])"),
        )
        if (stops.length === 0) return
        const at = stops.indexOf(document.activeElement as HTMLButtonElement)
        // Wraps, so the four stops behave as a ring rather than dead-ending.
        const next = at === -1 ? 0 : (at + (forward ? 1 : -1) + stops.length) % stops.length
        stops[next].focus()
        event.preventDefault()
      }}
      onPointerDown={keepAwake}
      onPointerUp={release}
      onPointerCancel={release}
      style={{
        opacity: shown ? 1 : 0,
        // Not `visibility`, which would still let a stray tap through on some
        // browsers mid-fade.
        pointerEvents: shown ? "auto" : "none",
        transition: `opacity ${FADE_MS}ms ease`,
      }}
    >
      <div className="journey-rail-track" aria-hidden="true">
        <div
          className="journey-rail-fill"
          style={horizontal ? { width: pct(progress * 100) } : { height: pct(progress * 100) }}
        />
      </div>

      {JOURNEY_STOP_SCROLL.map((stop, i) => {
        // Not a destination while you are already standing in it, and not one
        // at all unless you are parked somewhere you may leave from.
        const reachable = canJump && stop.id !== parkedAt
        // The stop you are standing at becomes "enter this portal" rather than
        // a dead marker, when a caller offers that.
        const isHere = stop.id === parkedAt
        const enterable = isHere && !!onEnterPortal && !!enterableStops?.has(stop.id)
        const label = labels[stop.id] ?? stop.id
        return (
          <button
            key={stop.id}
            type="button"
            className="journey-rail-stop"
            data-state={i === current ? "current" : progress > stop.scroll ? "passed" : "ahead"}
            aria-current={i === current ? "true" : undefined}
            // The rail is a position indicator first and a control second, so
            // when it cannot be used it says where you are rather than
            // advertising four dead buttons.
            disabled={!reachable && !enterable}
            aria-label={
              enterable ? `Enter ${label}` : reachable ? `Travel to ${label}` : label
            }
            onClick={
              enterable ? () => onEnterPortal!(stop.id) : reachable ? () => onJump(stop.id) : undefined
            }
            style={{ [along]: pct(stop.scroll * 100) } as React.CSSProperties}
          >
            <span className="journey-rail-mark" aria-hidden="true" />
            <span className="journey-rail-label" aria-hidden="true">
              {label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
