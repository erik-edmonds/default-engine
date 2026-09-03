"use client"

import { useEffect, useState } from "react"

// The outer silhouette of Font Awesome's solid `hand-pointer`, inlined.
//
// Not <FontAwesomeIcon icon={faHandPointer}> any more: that glyph's path has
// TWO subpaths -- the hand outline, plus three rounded bars that cut the
// finger separations clean through it. Against this scene those cut-outs
// render as dark slots showing the island through the hand. Taking only the
// first subpath keeps the identical shape as one solid, filled hand.
const HAND_SILHOUETTE =
  "M128 40c0-22.1 17.9-40 40-40s40 17.9 40 40l0 148.2c8.5-7.6 19.7-12.2 32-12.2 20.6 0 38.2 13 45 31.2 8.8-9.3 21.2-15.2 35-15.2 25.3 0 46 19.5 47.9 44.3 8.5-7.7 19.8-12.3 32.1-12.3 26.5 0 48 21.5 48 48l0 112c0 70.7-57.3 128-128 128l-85.3 0c-5 0-9.9-.3-14.7-1-55.3-5.6-106.2-34-140-79L8 336c-13.3-17.7-9.7-42.7 8-56s42.7-9.7 56 8l56 74.7 0-322.7z"

// Brief onboarding nudge shown once the loading screen finishes: a pulsing
// "tap" icon (echoing CameraHotspot's own sonar-ping hover animation, so
// the same "this pulses = interactive" language applies to both the 3D
// markers and this DOM hint) above a glass pill caption. Says "Click to
// Explore" rather than the more common "drag to look around" -- this site
// has no drag/orbit control, only click-driven navigation (hotspots, the
// Poke Ball, the Gear), so the copy has to match what's actually true here.
const APPEAR_DELAY_MS = 1200
// Once it's up, the hint holds for at least this long even if the user
// dismisses it immediately. Dismissal is triggered by the first pointer move
// (page.tsx), which very often lands within a few hundred ms of the scene
// appearing -- without a floor the hint could flash on and straight back off,
// which reads as a glitch rather than as a hint.
const MIN_VISIBLE_MS = 2000

interface InteractionHintProps {
  visible: boolean // true once the loading screen has finished (site "started")
  dismissed: boolean // true once the user has interacted, or the hint has timed out
}

export function InteractionHint({ visible, dismissed }: InteractionHintProps) {
  const [entered, setEntered] = useState(false)
  // Whether the minimum on-screen time has elapsed. Tracked separately from
  // `entered` so a dismissal arriving early is deferred rather than dropped.
  const [minElapsed, setMinElapsed] = useState(false)

  useEffect(() => {
    if (!visible) {
      setEntered(false)
      setMinElapsed(false)
      return
    }
    const appear = setTimeout(() => setEntered(true), APPEAR_DELAY_MS)
    const hold = setTimeout(() => setMinElapsed(true), APPEAR_DELAY_MS + MIN_VISIBLE_MS)
    return () => {
      clearTimeout(appear)
      clearTimeout(hold)
    }
  }, [visible])

  // Stays up while the floor hasn't passed, even once dismissed -- so an
  // early dismissal delays the fade-out instead of cancelling the hint.
  const shown = entered && (!dismissed || !minElapsed)

  return (
    <div
      // gap-8 (32px), not gap-3: the hand orbits +/-30px (see
      // hint-hand-loop in globals.css) and overhangs its own 160px box by
      // ~22px at the bottom of that circle, which was carrying it down onto
      // the caption. 32px clears the orbit with room to spare, and `top` comes
      // up to compensate so the pair doesn't just sit lower on the screen.
      className="pointer-events-none absolute left-1/2 z-10 flex flex-col items-center gap-8"
      style={{
        top: "68%",
        opacity: shown ? 1 : 0,
        transform: `translate(-50%, calc(-50% + ${shown ? "0px" : "8px"}))`,
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      <div className="relative flex h-40 w-40 items-center justify-center">
        <svg
          className="hint-icon relative text-white"
          width={144}
          height={144}
          viewBox="0 0 448 512"
          aria-hidden="true"
        >
          <path d={HAND_SILHOUETTE} fill="currentColor" />
        </svg>
      </div>
      <div
        // Already Nunito before this change -- but at 12-14px, all-caps, with
        // 0.2em tracking and weight 400, every feature that makes Nunito
        // recognisable (rounded terminals, tall x-height, the lowercase forms
        // generally) was either absent or spaced into anonymity, so it read as
        // generic Helvetica. Weight 600 and much tighter tracking is what
        // actually makes the typeface show. Nunito is loaded as a variable
        // font across the 200-1000 axis, so 600 needs no change to the loader.
        className="font-nunito font-semibold text-sm sm:text-base uppercase tracking-[0.08em] text-white rounded-[2px] px-5 py-2"
        style={{
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
        }}
      >
        Click to Explore
      </div>
    </div>
  )
}
