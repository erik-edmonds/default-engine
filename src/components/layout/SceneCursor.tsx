"use client"

import { useEffect, useRef, useState } from "react"

import {
  TRAIL_LENGTH,
  activateTarget,
  cursorLock,
  cursorNode,
  cursorTrailNodes,
  pointerState,
  setCursorHover,
  subscribeCursorView,
  type CursorSpeedTier,
  type CursorState,
} from "@/helpers/cursor"

/** Elements that should put the cursor into its hover state without each
 *  component having to opt in. One delegated listener covers the sound toggle,
 *  the phase cube, the home logo and the loading screen's Enter button. */
const DOM_HOVER_SELECTOR = "button, a, [data-cursor]"

/** Velocity is measured from pointermove deltas, which are noisy at high
 *  polling rates; this smooths them into something the visuals can follow. */
const VELOCITY_SMOOTHING = 0.25

/** Elements that should put the cursor into its text state. */
const TEXT_SELECTOR = '[data-cursor="text"]'
/** How often the text elements' boxes are re-measured. getBoundingClientRect
 *  forces layout, so this is not something to do on every pointermove; the
 *  elements it tracks are static chrome that only moves on resize. */
const TEXT_RECT_REFRESH_MS = 400

// ---------------------------------------------------------------- palette
//
// Dark linework, not the reference sheet's pale blue. The sheet is drawn on
// near-black, but this scene is pale sky and near-white water -- a #cfe6ff
// cursor over it is barely a smudge, which the recording showed plainly. What
// darkens is the linework; the gem keeps its facets and its bright core,
// because the lit core is what makes it read as a lens rather than a sticker.
const INK = "#12283a"
const ACCENT = "#c2490d"
/** A crisp white outline around every dark stroke, plus a soft glow.
 *
 *  Four 1px offset shadows, not one blurred one: a soft glow alone was not
 *  enough, and the states made purely of linework -- text especially, which has
 *  no gem to carry it -- disappeared against the dark rock and the island's
 *  shaded side. Offsetting the same shadow in four directions traces an actual
 *  contour, so the dark ink reads on pale water AND the white edge reads on
 *  dark rock. The blurred pass on the end softens it back down so it doesn't
 *  look like a sticker. */
const HALO = [
  "drop-shadow(1px 0 0 rgba(255,255,255,0.95))",
  "drop-shadow(-1px 0 0 rgba(255,255,255,0.95))",
  "drop-shadow(0 1px 0 rgba(255,255,255,0.95))",
  "drop-shadow(0 -1px 0 rgba(255,255,255,0.95))",
  "drop-shadow(0 0 5px rgba(255,255,255,0.45))",
].join(" ")

const STROKE = { fill: "none", stroke: INK, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const

/** Corner tracking brackets, at a given half-extent. */
function Brackets({ r, color = INK }: { r: number; color?: string }) {
  const a = 7
  return (
    <g data-part="brackets" style={{ fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" }}>
      <path d={`M${-r},${-r + a} L${-r},${-r} L${-r + a},${-r}`} />
      <path d={`M${r - a},${-r} L${r},${-r} L${r},${-r + a}`} />
      <path d={`M${-r},${r - a} L${-r},${r} L${-r + a},${r}`} />
      <path d={`M${r - a},${r} L${r},${r} L${r},${r - a}`} />
    </g>
  )
}

/** The faceted lens. Geometry is centred on (0,0); the parent <svg> carries a
 *  symmetric viewBox, and the rotation is applied here as an SVG transform
 *  attribute rather than via CSS transform-origin -- with a negative-origin
 *  viewBox, `transform-origin: center` resolves in user space in Chrome and
 *  threw the spinning gem ~80px off the cursor. An explicit rotate() about
 *  (0,0) has no such ambiguity. */
function Gem({ spin, open }: { spin: number; open: number }) {
  const R = 20
  const p = (n: number, radius: number) => {
    const a = (Math.PI / 3) * n - Math.PI / 2
    return [Math.cos(a) * radius, Math.sin(a) * radius] as const
  }
  const outer = Array.from({ length: 6 }, (_, i) => p(i, R))
  const inner = Array.from({ length: 6 }, (_, i) => p(i, R * 0.5))
  const faces = ["#f2fbff", "#a9cfe8", "#5d89ab", "#27506f", "#3d6c8e", "#cfe6f7"]

  return (
    <g data-part="gem" transform={`rotate(${spin})`}>
      {/* Solid body, so the lens is never see-through where the blades open. */}
      <polygon points={outer.map((q) => q.join(",")).join(" ")} fill="#1d3f5c" />
      {outer.map((q, i) => {
        const n = outer[(i + 1) % 6]
        const qi = inner[i]
        const ni = inner[(i + 1) % 6]
        return (
          <polygon
            key={i}
            points={`${q.join(",")} ${n.join(",")} ${ni.join(",")} ${qi.join(",")}`}
            fill={faces[i]}
            stroke="#0d2032"
            strokeWidth={0.6}
          />
        )
      })}
      {/* Aperture blades, contracting as the lens opens. */}
      <g transform={`scale(${1 - open * 0.35}) rotate(${open * -36})`}>
        {inner.map((q, i) => {
          const n = inner[(i + 1) % 6]
          return (
            <polygon key={i} points={`${q.join(",")} ${n.join(",")} 0,0`} fill={faces[(i + 3) % 6]} stroke="#0d2032" strokeWidth={0.5} />
          )
        })}
      </g>
      <polygon points={outer.map((q) => q.join(",")).join(" ")} fill="none" stroke={INK} strokeWidth={1.6} />
    </g>
  )
}

/** The bright centre point. Present in every state that isn't text. */
function Core({ r = 3 }: { r?: number }) {
  return (
    <>
      <circle data-part="core" cx={0} cy={0} r={r * 3} fill="rgba(255,255,255,0.35)" />
      <circle cx={0} cy={0} r={r} fill="#ffffff" stroke={INK} strokeWidth={1} />
    </>
  )
}

/** One orbiting arc: a gapped segment on its own radius, turning at its own
 *  rate. Deliberately NOT a closed circle -- closed rings read as the camera
 *  hotspot markers already in the scene, where these should read as electrons
 *  round a nucleus. */
function Orbit({ r, sweep, spin, width = 2 }: { r: number; sweep: number; spin: number; width?: number }) {
  const circumference = 2 * Math.PI * r
  return (
    <circle
      data-part="orbit"
      cx={0}
      cy={0}
      r={r}
      fill="none"
      stroke={INK}
      strokeWidth={width}
      strokeLinecap="round"
      // One visible arc of `sweep` degrees, the rest gap.
      strokeDasharray={`${(circumference * sweep) / 360} ${circumference}`}
      transform={`rotate(${spin})`}
    />
  )
}

// The pixels half of the cursor: an always-mounted, never-interactive overlay
// that CursorDriver moves from inside <Canvas>.
export function SceneCursor() {
  const nodeRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<(HTMLDivElement | null)[]>([])
  const domHoverToken = useRef({})
  const [view, setView] = useState<{ state: CursorState; tier: CursorSpeedTier }>({ state: "idle", tier: "slow" })
  /** Free-running angle for the orbits and the gem's idle rotation. */
  const [spin, setSpin] = useState(0)

  useEffect(() => {
    cursorNode.current = nodeRef.current
    cursorTrailNodes.current = trailRef.current.filter(Boolean) as HTMLElement[]
    return () => {
      cursorNode.current = null
      cursorTrailNodes.current = []
    }
  }, [])

  // Which artwork to draw comes from the driver, not from CSS. See the note on
  // publishCursorView in helpers/cursor.ts for why.
  useEffect(() => {
    subscribeCursorView((v) => setView((prev) => (prev.state === v.state && prev.tier === v.tier ? prev : v)))
    return () => subscribeCursorView(null)
  }, [])

  // Rotation is driven here rather than by a CSS animation for the same reason
  // the artwork is: a stale stylesheet must not be able to freeze it.
  useEffect(() => {
    // Honoured here rather than by a CSS media query, since the animation
    // itself moved into JS. The cursor stays fully usable without it; what
    // stops is the decorative rotation and the orbiting.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (reduced.matches) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      setSpin((s) => (s + dt * 60) % 360)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Hide the OS pointer for as long as this is mounted. On <html> as well as
  // <body>: `cursor` does not propagate from body up to the viewport.
  useEffect(() => {
    document.documentElement.classList.add("custom-cursor")
    document.body.classList.add("custom-cursor")
    return () => {
      document.documentElement.classList.remove("custom-cursor")
      document.body.classList.remove("custom-cursor")
    }
  }, [])

  useEffect(() => {
    let lastTime = performance.now()
    let textRects: DOMRect[] = []
    let rectsMeasuredAt = 0

    const onMove = (event: PointerEvent) => {
      const now = performance.now()
      const dt = Math.max((now - lastTime) / 1000, 0.001)
      lastTime = now

      // Text is hit-tested against boxes rather than through pointer events:
      // the name stamp lives inside a pointer-events:none container, so it
      // never receives pointerover and elementFromPoint over it returns the
      // canvas underneath. Comparing rectangles sidesteps hit-testing and
      // leaves clicks falling through to the scene exactly as before.
      if (now - rectsMeasuredAt > TEXT_RECT_REFRESH_MS) {
        rectsMeasuredAt = now
        textRects = Array.from(document.querySelectorAll(TEXT_SELECTOR), (el) => el.getBoundingClientRect())
      }
      const { clientX: px, clientY: py } = event
      pointerState.overText = textRects.some(
        (r) => r.width > 0 && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom,
      )

      const vx = (event.clientX - pointerState.x) / dt
      const vy = (event.clientY - pointerState.y) / dt
      if (pointerState.seen) {
        pointerState.vx += (vx - pointerState.vx) * VELOCITY_SMOOTHING
        pointerState.vy += (vy - pointerState.vy) * VELOCITY_SMOOTHING
      }

      pointerState.x = event.clientX
      pointerState.y = event.clientY
      pointerState.speed = Math.hypot(pointerState.vx, pointerState.vy)
      pointerState.movedAt = now
      pointerState.inWindow = true
      pointerState.seen = true
    }

    // Capture phase on window: the pointer spends most of its time over the
    // r3f canvas, which handles pointer events itself and can stop them
    // propagating. Same reasoning as page.tsx's InteractionHint dismissal.
    const capture = { capture: true, passive: true } as const

    const onDown = () => { pointerState.down = true }
    const onUp = () => { pointerState.down = false }
    const onEnter = () => { pointerState.inWindow = true }
    const onLeave = () => {
      pointerState.inWindow = false
      pointerState.down = false
      pointerState.vx = 0
      pointerState.vy = 0
      pointerState.speed = 0
    }

    // Assisted click: when the cursor is visually locked onto a target the true
    // pointer may be tens of pixels off it, and without this the lock would be
    // a lie. activateTarget debounces, so a click landing on the object anyway
    // still counts once.
    const onClick = () => {
      const target = cursorLock.current
      if (target?.activate) activateTarget(target)
    }

    const onOver = (event: PointerEvent) => {
      const el = event.target as Element | null
      const match = el?.closest?.(DOM_HOVER_SELECTOR) as HTMLElement | null | undefined
      // data-cursor="text" matches the selector too but wants the caret, and
      // hover outranks text in the driver's chain -- reporting it would mask it.
      if (!match || match.hasAttribute("disabled") || match.dataset.cursor === "text") {
        setCursorHover(domHoverToken.current, null)
        return
      }
      setCursorHover(domHoverToken.current, "interactive")
    }

    window.addEventListener("pointermove", onMove, capture)
    window.addEventListener("pointerover", onOver, capture)
    window.addEventListener("pointerdown", onDown, capture)
    window.addEventListener("pointerup", onUp, capture)
    window.addEventListener("click", onClick, capture)
    document.addEventListener("pointerenter", onEnter, capture)
    document.addEventListener("pointerleave", onLeave, capture)
    window.addEventListener("blur", onLeave)

    const token = domHoverToken.current
    return () => {
      window.removeEventListener("pointermove", onMove, capture)
      window.removeEventListener("pointerover", onOver, capture)
      window.removeEventListener("pointerdown", onDown, capture)
      window.removeEventListener("pointerup", onUp, capture)
      window.removeEventListener("click", onClick, capture)
      document.removeEventListener("pointerenter", onEnter, capture)
      document.removeEventListener("pointerleave", onLeave, capture)
      window.removeEventListener("blur", onLeave)
      setCursorHover(token, null)
      pointerState.down = false
    }
  }, [])

  const { state, tier } = view
  const moving = state === "scan"
  // Only the movement state gets a trail, and only at its slowest band -- the
  // sheet asks for lines behind a slow cursor, rings around a faster one.
  const showTrail = moving && tier === "slow"

  return (
    <>
      {/* Trail ghosts, positioned by the driver from a ring buffer of recent
          cursor positions. Short dashes rather than lens outlines: the sheet's
          slow-movement cue is a trail of lines. */}
      {Array.from({ length: TRAIL_LENGTH }, (_, i) => (
        <div
          key={i}
          ref={(el) => { trailRef.current[i] = el }}
          aria-hidden="true"
          className="scene-cursor-ghost"
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            zIndex: 2147482999,
            pointerEvents: "none",
            opacity: 0,
            display: showTrail ? "block" : "none",
            willChange: "transform, opacity",
          }}
        >
          <svg width="30" height="30" viewBox="-15 -15 30 30" style={{ position: "absolute", left: -15, top: -15, overflow: "visible", filter: HALO }}>
            <line x1={-6} y1={0} x2={6} y2={0} stroke={INK} strokeWidth={2} strokeLinecap="round" />
          </svg>
        </div>
      ))}

      <div
        ref={nodeRef}
        aria-hidden="true"
        className="scene-cursor"
        data-cursor-state="idle"
        // Above everything, including app/loading.tsx's full-screen panel.
        // Never interactive: a cursor that can swallow its own click would be
        // worse than no cursor.
        style={{ position: "fixed", left: 0, top: 0, zIndex: 2147483000, pointerEvents: "none" }}
      >
        {/* Zero-size box, so the transform the driver writes lands the centre
            of the artwork exactly on the cursor point. */}
        <div className="scene-cursor-inner" style={{ position: "relative", width: 0, height: 0 }}>
          <svg
            width={120}
            height={120}
            viewBox="-60 -60 120 120"
            style={{ position: "absolute", left: -60, top: -60, overflow: "visible", filter: HALO }}
          >
            {/* 07 MOVEMENT -- a dot with broken rings orbiting it. No gem, no
                brackets: this state describes motion, not a target. */}
            {moving && (
              <>
                {/* Two orbits at any speed, a third once you're moving fast.
                    Each on its own radius, with its own rate, and one turning
                    against the others so they never read as a single rigid
                    object. */}
                <Orbit r={17} sweep={120} spin={spin * 2.2} />
                <Orbit r={26} sweep={85} spin={-spin * 1.6 + 40} />
                {tier === "fast" && <Orbit r={34} sweep={55} spin={spin * 1.1 + 200} width={1.6} />}
                <Core r={3.4} />
              </>
            )}

            {/* 06 TEXT -- brackets and a caret, no gem. */}
            {state === "text" && (
              <>
                <Brackets r={16} />
                <line data-part="caret" x1={0} y1={-11} x2={0} y2={11} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
              </>
            )}

            {/* 04 PROJECT FOCUS -- a box standing inside the brackets. */}
            {state === "projectFocus" && (
              <>
                <Brackets r={34} color={ACCENT} />
                <g data-part="box" style={{ ...STROKE, stroke: ACCENT }}>
                  <path d="M-16,-4 L4,-16 L24,-4 L24,16 L4,28 L-16,16 Z" opacity={0.9} />
                  <path d="M-16,-4 L4,8 L24,-4" />
                  <path d="M4,8 L4,28" />
                </g>
              </>
            )}

            {/* 03 INTERACTIVE -- gem with outward chevrons. */}
            {state === "interactive" && (
              // Scaled down as a whole: at full size this was the largest state
              // of the set, and it fires constantly while approaching any
              // magnet, so it dominated the screen.
              <g transform="scale(0.72)">
                <g data-part="chevrons" style={STROKE}>
                  <path d="M-7,-30 L0,-37 L7,-30" />
                  <path d="M-7,30 L0,37 L7,30" />
                  <path d="M-30,-7 L-37,0 L-30,7" />
                  <path d="M30,-7 L37,0 L30,7" />
                </g>
                <Gem spin={spin * 0.35} open={0.7} />
                <Core />
              </g>
            )}

            {/* 01 IDLE / 02 HOVER / 08 LOCKED -- gem inside brackets. */}
            {(state === "idle" || state === "hover" || state === "locked") && (
              <>
                <Brackets r={state === "locked" ? 24 : 28} color={state === "locked" ? ACCENT : INK} />
                <Gem spin={state === "locked" ? 0 : spin * 0.25} open={state === "locked" ? 1 : state === "hover" ? 0.35 : 0} />
                <Core />
              </>
            )}
          </svg>
        </div>
      </div>
    </>
  )
}
