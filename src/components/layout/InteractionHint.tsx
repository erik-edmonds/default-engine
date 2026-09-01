"use client"

import { useEffect, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faHandPointer } from "@fortawesome/free-solid-svg-icons"

// Brief onboarding nudge shown once the loading screen finishes: a pulsing
// "tap" icon (echoing CameraHotspot's own sonar-ping hover animation, so
// the same "this pulses = interactive" language applies to both the 3D
// markers and this DOM hint) above a glass pill caption. Says "Click to
// Explore" rather than the more common "drag to look around" -- this site
// has no drag/orbit control, only click-driven navigation (hotspots, the
// Poke Ball, the Gear), so the copy has to match what's actually true here.
const APPEAR_DELAY_MS = 1200

interface InteractionHintProps {
  visible: boolean // true once the loading screen has finished (site "started")
  dismissed: boolean // true once the user has interacted, or the hint has timed out
}

export function InteractionHint({ visible, dismissed }: InteractionHintProps) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!visible) {
      setEntered(false)
      return
    }
    const timer = setTimeout(() => setEntered(true), APPEAR_DELAY_MS)
    return () => clearTimeout(timer)
  }, [visible])

  const shown = entered && !dismissed

  return (
    <div
      className="pointer-events-none absolute left-1/2 z-10 flex flex-col items-center gap-3"
      style={{
        top: "73%",
        opacity: shown ? 1 : 0,
        transform: `translate(-50%, calc(-50% + ${shown ? "0px" : "8px"}))`,
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      <div className="relative flex h-40 w-40 items-center justify-center">
        <FontAwesomeIcon
          icon={faHandPointer}
          className="hint-icon relative text-white"
          style={{ fontSize: 144 }}
        />
      </div>
      <div
        className="font-nunito text-xs sm:text-sm uppercase tracking-[0.2em] text-white rounded-[2px] px-5 py-2"
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
