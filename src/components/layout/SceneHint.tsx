"use client"

import { useEffect, useRef, useState } from "react"
import { useAtomValue } from "jotai"

import { HINTS, activeHint, hintNode, type ActiveHint } from "@/helpers/hints"
import { useCoarsePointer } from "@/helpers/useCoarsePointer"

const FADE_MS = 450
const ACCENT = "#d25a1a"

// The DOM half of a scene hint: a small breathing ring with a caption beside
// it. The ring is deliberately the same white-ring-with-a-dot as
// CameraHotspot's markers, at overlay scale -- that shape already means "this
// is interactive" in this scene, so a hint reads as pointing at something
// rather than as a notification arriving.
//
// Position comes from HintAnchor, inside <Canvas>, which writes transforms
// straight onto the outer node every frame (see hints.ts's `hintNode`). This
// component only owns what the hint *says* and its fade.
export function SceneHint() {
  const hint = useAtomValue(activeHint)
  const coarse = useCoarsePointer()
  const nodeRef = useRef<HTMLDivElement>(null)
  // Held one beat longer than `hint` so the copy is still there to read while
  // the hint fades out, instead of blanking the instant it's dismissed.
  const [rendered, setRendered] = useState<ActiveHint | null>(null)

  // Always mounted, so the node HintAnchor writes to is stable for the life of
  // the page and there is no window where a projected transform lands nowhere.
  useEffect(() => {
    hintNode.current = nodeRef.current
    return () => {
      hintNode.current = null
    }
  }, [])

  useEffect(() => {
    if (!hint) {
      const timer = setTimeout(() => setRendered(null), FADE_MS)
      return () => clearTimeout(timer)
    }

    setRendered(hint)

    const node = nodeRef.current
    if (!node) return
    if (hint.target.kind === "screen") {
      // Fixed chrome (the home button) -- nothing to project, so place it here
      // and now.
      node.style.transform = `translate3d(${hint.target.left}px, ${hint.target.top}px, 0)`
      node.dataset.hintSide = "right"
      node.style.visibility = "visible"
    } else {
      // Stay hidden until HintAnchor has actually projected the target;
      // otherwise the marker flashes at the viewport's top-left corner for the
      // frame between activation and the first useFrame. That's one frame of a
      // 450ms fade, so the caption is still essentially at zero when it shows.
      node.style.visibility = "hidden"
    }
  }, [hint])

  const config = rendered ? HINTS[rendered.id] : null
  const copy = config ? config[coarse ? "coarse" : "fine"] : ""
  // Read off `rendered`, not `hint`, so both survive the fade-out.
  const showMarker = config?.marker ?? false
  const anchorKind = rendered?.target.kind === "screen" ? "screen" : "world"

  return (
    <div
      ref={nodeRef}
      aria-hidden="true"
      data-hint-side="right"
      data-hint-marker={showMarker ? "true" : "false"}
      data-hint-anchor={anchorKind}
      // z-30 sits above the scene chrome (all z-10) and below the home button
      // it sometimes points at (z-50). Never interactive: a hint that can
      // swallow a click is worse than no hint, since the thing it's pointing
      // at is exactly what the user is about to click.
      className="pointer-events-none fixed left-0 top-0 z-30"
      style={{ visibility: "hidden" }}
    >
      {/* A zero-size box, so the transform HintAnchor writes lands the *marker*
          on the target rather than centring the whole marker-plus-caption row
          on it. Everything inside is positioned off this one point.
          Opacity keys straight off `hint` rather than off a state flag set a
          frame later: this element is mounted for the life of the page, so it
          is already sitting at opacity 0 when a hint arrives and the
          transition just runs. Deferring the flip to a requestAnimationFrame
          (the obvious way to force a transition on a *newly mounted* node)
          raced instead -- any re-render in between cancelled the pending frame
          and the fade never started. */}
      <div
        style={{
          position: "relative",
          width: 0,
          height: 0,
          opacity: hint ? 1 : 0,
          transition: `opacity ${FADE_MS}ms ease`,
        }}
      >
        {showMarker && (
          <>
            <span
              className="hint-marker-ring"
              style={{
                position: "absolute",
                left: -8,
                top: -8,
                width: 16,
                height: 16,
                borderRadius: "9999px",
                border: "1.5px solid rgba(255,255,255,0.8)",
              }}
            />
            <span
              style={{
                position: "absolute",
                left: -2.5,
                top: -2.5,
                width: 5,
                height: 5,
                borderRadius: "9999px",
                background: ACCENT,
              }}
            />
          </>
        )}
        {/* Same caption system as InteractionHint and HotspotJoystick's
            direction readout: Nunito 600, uppercase, 0.08em tracking, 2px
            corners, black glass. */}
        <span
          className="hint-label font-nunito font-semibold text-xs sm:text-sm uppercase tracking-[0.08em] text-white rounded-[2px] px-4 py-2"
          style={{
            whiteSpace: "nowrap",
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(6px)",
          }}
        >
          {copy}
        </span>
      </div>
    </div>
  )
}
