"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  LENS_HEADER,
  LENS_OFFLINE_LINE,
  LENS_PANEL_GUTTER,
  LENS_PANEL_LIFT,
  LENS_PANEL_WIDTH,
  LENS_PLACEHOLDER,
  LENS_STARTERS,
  LENS_STATUS_LABEL,
} from "@/config/lens"
import { OPTICS_BRACKET_COLOR, OPTICS_WAVE_COLOR } from "@/config/optics"
import { OPTICS_CLASS_COLOR } from "@/config/opticsTargets"
import {
  appendLensAnswer,
  closeLensPanel,
  failLensAnswer,
  finishLensAnswer,
  lensNode,
  startLensQuestion,
  useLensPanel,
} from "@/helpers/lensPanel"
import { askLens } from "@/lib/lens/ask"

const FADE_MS = 220
/** The frame's corner radius, in px of the panel's own box. */
const RADIUS = 14
/** Stroke width of the frame, in the same units. */
const STROKE = 1.25

/** The gaps in the frame, as a dash pattern over a path normalised to 100.
 *
 *  `pathLength={100}` is what makes this work at any size: the browser scales
 *  the dash pattern to the real perimeter, so a tall answer and a one-line
 *  answer get gaps in the same PROPORTIONAL places rather than the pattern
 *  marching around the outline as the box grows. Hand-authored path segments
 *  would have had to be recomputed on every resize.
 *
 *  Why gaps at all: an unbroken rounded rectangle is a card, and this is
 *  meant to read as an instrument putting up a readout. Breaking the outline
 *  is most of the difference, and it costs one attribute. */
const FRAME_DASH = "17 3 11 4 22 3 9 5 14 3 6 3"
/** A second pass at higher opacity, offset so its marks land in the first
 *  pattern's gaps -- the brighter ticks near the corners. */
const TICK_DASH = "3 22"
const TICK_OFFSET = -1.5

/** The lens panel: a chat, inside a frame the beacon is holding up.
 *
 *  SVG FOR THE FRAME, HTML FOR THE WORDS, in one positioned box. The split is
 *  not decoration. SVG cannot host a focusable text input without
 *  `foreignObject`, whose form-control support is uneven, and real HTML keeps
 *  the answer selectable and reachable by a screen reader. So the outline, its
 *  gaps and its glow are drawn in SVG underneath, and everything anybody reads
 *  or types is ordinary DOM on top.
 *
 *  Position comes from LensAnchor, inside <Canvas>, which writes a transform
 *  onto the outer node every frame. This component owns only what the panel
 *  says and how it is laid out -- the same division of labour SceneHint and
 *  HintAnchor use.
 */
export function LensPanel() {
  const { open, question, answer, status } = useLensPanel()
  const nodeRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [draft, setDraft] = useState("")
  /** The measured content box, which the SVG viewBox has to match or the
   *  frame stretches away from the thing it is framing. */
  const [box, setBox] = useState({ w: LENS_PANEL_WIDTH, h: 120 })

  // Always mounted, so the node LensAnchor writes to is stable for the life of
  // the page and there is no frame where a projected transform lands nowhere.
  // Same reasoning SceneHint records for `hintNode`.
  useEffect(() => {
    lensNode.current = nodeRef.current
    return () => {
      lensNode.current = null
    }
  }, [])

  // The frame follows the content. An answer streaming in grows the box a
  // line at a time, and a fixed viewBox would either clip it or leave the
  // outline floating away from the text.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      // BORDER BOX, NOT CONTENT BOX. `contentRect` excludes the card's
      // padding, so sizing the SVG from it drew the frame 28px narrow and
      // 22px short while still starting it at the padding box's origin --
      // an outline floating inside its own card, with the bottom edge
      // cutting through the input row. Measured, not theorised: the frame's
      // right edge landed 28px clear of the dark surface behind it.
      const size = entry.borderBoxSize?.[0]
      const width = size ? size.inlineSize : el.offsetWidth
      const height = size ? size.blockSize : el.offsetHeight
      setBox((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
    })
    observer.observe(el, { box: "border-box" })
    return () => observer.disconnect()
  }, [])

  // Focus the input when she opens, so a visitor who clicked the orb can just
  // type.
  //
  // NOT A PLAIN focus() CALL, and the reason is easy to miss: LensAnchor owns
  // this subtree's `visibility` and only clears it on its next frame inside
  // the canvas, once it has somewhere real to put the panel. Nothing inside a
  // `visibility: hidden` subtree can take focus, so focusing here silently
  // did nothing and left the caret in the page body. Wait for the frame that
  // makes it visible, then focus -- and give up rather than spin if the orb
  // is somewhere the anchor refuses to draw.
  useEffect(() => {
    if (!open) return
    let frame = 0
    let tries = 0
    const attempt = () => {
      const node = nodeRef.current
      if (node && node.style.visibility === "visible") {
        inputRef.current?.focus()
        return
      }
      if (++tries > 30) return
      frame = requestAnimationFrame(attempt)
    }
    frame = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(frame)
  }, [open])

  // Escape closes, from anywhere. A panel with a focused input swallows most
  // keys, so this is bound to the window rather than to the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeLensPanel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // A click anywhere else puts her away. Bound in the CAPTURE phase and
  // tested against the card's own bounds rather than relying on the card
  // stopping propagation: the scene is a canvas that handles its own pointer
  // events, so there is no bubbling path from it to here to intercept.
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const card = boxRef.current
      if (card && event.target instanceof Node && card.contains(event.target)) return
      closeLensPanel()
    }
    window.addEventListener("pointerdown", onDown, true)
    return () => window.removeEventListener("pointerdown", onDown, true)
  }, [open])

  // Closing abandons whatever was in flight. Without this a stream keeps
  // arriving into a panel nobody is looking at, and the request behind it
  // stays open.
  useEffect(() => {
    if (open) return
    abort.current?.abort()
    abort.current = null
  }, [open])

  // And on unmount, for the same reason.
  useEffect(() => () => abort.current?.abort(), [])

  const ask = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setDraft("")
    startLensQuestion(trimmed)
    try {
      for await (const chunk of askLens(trimmed, { signal: controller.signal })) {
        if (controller.signal.aborted) return
        appendLensAnswer(chunk)
      }
      if (!controller.signal.aborted) finishLensAnswer()
    } catch {
      // Anything the seam throws lands here. The panel says so in her own
      // slot rather than leaving an `Offline` pill over an empty frame.
      if (!controller.signal.aborted) failLensAnswer(LENS_OFFLINE_LINE)
    }
  }, [])

  const asked = question !== null
  const dot = status === "offline" ? OPTICS_BRACKET_COLOR : OPTICS_CLASS_COLOR.object

  return (
    <div
      ref={nodeRef}
      // Never swallows a click on its own: only the card inside does. A hint
      // or a panel that can eat a pointer is worse than none, because what it
      // is covering is the scene.
      className="pointer-events-none fixed left-0 top-0 z-30"
      style={{ visibility: "hidden" }}
      aria-hidden={!open}
    >
      {/* Zero-size, so LensAnchor's transform lands on the ORB and everything
          here hangs off that one point rather than being centred on it. */}
      <div style={{ position: "relative", width: 0, height: 0 }}>
        <div
          ref={boxRef}
          className="pointer-events-auto font-nunito"
          style={{
            position: "absolute",
            // Above the orb, centred on it. translate is in the element's own
            // percentages, so this stays correct as the panel grows.
            left: 0,
            bottom: LENS_PANEL_LIFT,
            transform: "translateX(-50%)",
            width: `min(${LENS_PANEL_WIDTH}px, calc(100vw - ${LENS_PANEL_GUTTER * 2}px))`,
            padding: "12px 14px 10px",
            opacity: open ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease`,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
            borderRadius: RADIUS,
            // Glow, not a drop shadow. The frame is an instrument readout,
            // not a card lifted off a page, and a shadow would read as the
            // second of those.
            boxShadow: `0 0 18px -6px ${OPTICS_WAVE_COLOR}66`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <FrameSvg width={box.w} height={box.h} />

          {/* ---- header: the label, and the state ---- */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span
              className="font-semibold uppercase"
              style={{ fontSize: 10, letterSpacing: "0.08em", color: "rgba(255,255,255,0.55)" }}
            >
              {LENS_HEADER}
            </span>
            <span
              className="font-semibold uppercase"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 9.5,
                letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.6)",
                background: "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: "3px 8px 3px 7px",
              }}
            >
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: dot,
                  // Breathes only while she is actually working, so the dot
                  // means something rather than decorating.
                  animation: status === "thinking" ? "lens-pulse 1.1s ease-in-out infinite" : undefined,
                }}
              />
              {LENS_STATUS_LABEL[status]}
            </span>
          </div>

          {/* A hairline that fades at both ends rather than a border that
              stops dead at the padding. A gradient rather than an SVG line:
              it has to sit directly under the header wherever the header
              happens to end, and in flow it does that for free. */}
          <div
            style={{
              position: "relative",
              height: 1,
              margin: "9px 0 11px",
              background: `linear-gradient(90deg, transparent, ${OPTICS_WAVE_COLOR}55 22%, ${OPTICS_WAVE_COLOR}55 78%, transparent)`,
            }}
          />

          {/* ---- the conversation ---- */}
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
            {asked && (
              <Bubble side="right">{question}</Bubble>
            )}
            {answer ? (
              <Bubble side="left">{answer}</Bubble>
            ) : status === "thinking" ? (
              <Bubble side="left">
                <span style={{ display: "inline-flex", gap: 4, alignItems: "center", height: 12 }}>
                  <Dot delay={0} />
                  <Dot delay={0.16} />
                  <Dot delay={0.32} />
                  <Dot delay={0.48} />
                </span>
              </Bubble>
            ) : null}

            {!asked && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {LENS_STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => ask(starter)}
                    className="font-semibold uppercase lens-starter"
                    style={{
                      fontSize: 9.5,
                      letterSpacing: "0.08em",
                      color: "rgba(255,255,255,0.68)",
                      background: "rgba(255,255,255,0.05)",
                      border: "none",
                      borderRadius: 3,
                      padding: "6px 9px",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ---- the input ---- */}
          <form
            style={{ position: "relative", marginTop: 11, display: "flex", alignItems: "center" }}
            onSubmit={(event) => {
              event.preventDefault()
              ask(draft)
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={LENS_PLACEHOLDER}
              aria-label={LENS_PLACEHOLDER}
              className="lens-input"
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "rgba(255,255,255,0.92)",
                caretColor: OPTICS_BRACKET_COLOR,
                fontSize: 13,
                padding: "2px 0",
              }}
            />
          </form>
        </div>
      </div>
    </div>
  )
}

/** One side of the conversation.
 *
 *  Tinted apart rather than boxed apart: no border and no shadow on either.
 *  The frame around them is already the container, and two bordered boxes
 *  inside a bordered box is exactly the habit CLAUDE.md names. The corner
 *  that points at its own side stays square, which is the oldest trick in
 *  messaging UI for saying who is talking without writing it down. */
function Bubble({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  const mine = side === "right"
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "86%",
          padding: "7px 10px",
          fontSize: 13,
          lineHeight: 1.5,
          color: mine ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.93)",
          background: mine ? `${OPTICS_BRACKET_COLOR}24` : `${OPTICS_WAVE_COLOR}1f`,
          borderRadius: mine ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 4,
        height: 4,
        borderRadius: 999,
        background: "rgba(255,255,255,0.6)",
        animation: `lens-pulse 1.1s ease-in-out ${delay}s infinite`,
      }}
    />
  )
}

/** The frame: a rounded rectangle with the outline deliberately broken.
 *
 *  `preserveAspectRatio="none"` is wrong here and is NOT used -- the viewBox
 *  is set to the measured pixel box so one user unit is one pixel, which keeps
 *  the corner radius circular and the stroke even on all four sides however
 *  the panel is shaped. */
function FrameSvg({ width, height }: { width: number; height: number }) {
  if (width <= 0 || height <= 0) return null
  const inset = STROKE / 2
  const d = roundedRect(inset, inset, width - STROKE, height - STROKE, RADIUS)
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none", overflow: "visible" }}
    >
      <path
        d={d}
        fill="none"
        stroke={OPTICS_WAVE_COLOR}
        strokeWidth={STROKE}
        strokeOpacity={0.55}
        pathLength={100}
        strokeDasharray={FRAME_DASH}
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke={OPTICS_WAVE_COLOR}
        strokeWidth={STROKE}
        strokeOpacity={0.95}
        pathLength={100}
        strokeDasharray={TICK_DASH}
        strokeDashoffset={TICK_OFFSET}
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A rounded rectangle as a single closed path.
 *
 *  Written out rather than using <rect rx>, because a dash pattern over a
 *  <rect> starts at a corner in every browser and the gaps then land on the
 *  curves, where they read as mistakes rather than as deliberate breaks.
 *  Starting the path on the top edge puts the first gap on a straight run. */
function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  return [
    `M ${x + radius} ${y}`,
    `H ${x + w - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + w} ${y + radius}`,
    `V ${y + h - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h}`,
    `H ${x + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x} ${y + h - radius}`,
    `V ${y + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + radius} ${y}`,
    "Z",
  ].join(" ")
}
