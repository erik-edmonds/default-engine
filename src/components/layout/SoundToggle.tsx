"use client"

import { useEffect, useState } from "react"
import { useAtom } from "jotai"
import { Howl } from "howler"
import { sfxEnabled } from "@/helpers/StateProvider"
import { useSfx } from "@/helpers/useSfx"

// The site's own orange accent, flat -- same color family as the joystick
// knob and the actual 3D Speaker prop's glow ring.
const BAR_COLOR = "#d25a1a"

const SIZE = 56
// Per-bar (duration, delay) so the bars bounce out of sync with each other
// -- an organic equalizer, not four bars moving in lockstep.
const BARS = [
  { duration: 0.8, delay: 0 },
  { duration: 1.0, delay: 0.15 },
  { duration: 0.7, delay: 0.05 },
  { duration: 0.95, delay: 0.25 },
]

export default function SoundToggle() {
  const [enabled, setEnabled] = useAtom(sfxEnabled)
  const play = useSfx()

  const [waves] = useState(() => new Howl({
    src: ["/sound/waves.mp3"],
    volume: 0.35,
    loop: true,
    preload: false,
    // Howler's default (Web Audio API) decoding has to fetch AND fully
    // decode the whole file before any playback can start -- for a 29MB
    // file that's the multi-second delay before waves audibly starts.
    // html5: true switches to native <audio> streaming instead, which
    // starts as soon as the first chunk buffers.
    html5: true,
  }))

  useEffect(() => {
    if (!enabled) {
      waves.pause()
      return
    }
    if (waves.state() === "unloaded") waves.load()
    waves.play()
    // sfxEnabled now defaults to true, so this effect's first run happens
    // on mount -- before the Enter click, before any user gesture at all.
    // Browsers block autoplay-with-sound until the page has one, so this
    // first play() attempt silently does nothing. Retry once on the page's
    // very first pointer interaction (in practice, the Enter click itself)
    // so the ambient track actually starts instead of staying silently
    // paused until someone happens to toggle the button off and back on.
    if (waves.playing()) return
    const retry = () => {
      if (!waves.playing()) waves.play()
    }
    window.addEventListener("pointerdown", retry, { once: true })
    return () => window.removeEventListener("pointerdown", retry)
  }, [enabled, waves])

  // Same orphaned-instance risk Speaker.tsx has -- stop cleanly on unmount
  // rather than leaving a looping ambient track running with nothing left
  // to control it.
  useEffect(() => () => { waves.stop() }, [waves])

  const handleClick = () => {
    setEnabled((v) => !v)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => play("click")}
      aria-label={enabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={enabled}
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: 9999,
        background: "#fff",
        cursor: "pointer",
        padding: 0,
        outlineOffset: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}
    >
      {BARS.map((bar, i) => (
        // Each bar rests at a short, flat height (see .eq-bar's own base
        // transform in globals.css) and only bounces while `enabled` --
        // toggling off just removes the animation class, letting the
        // transition ease every bar back down to that same flat height
        // instead of freezing mid-bounce.
        <span
          key={i}
          aria-hidden="true"
          className={enabled ? "eq-bar eq-bar-animating" : "eq-bar"}
          style={{
            display: "inline-block",
            width: 4,
            height: 20,
            borderRadius: 2,
            background: BAR_COLOR,
            animationDuration: `${bar.duration}s`,
            animationDelay: `${bar.delay}s`,
          }}
        />
      ))}
    </button>
  )
}
