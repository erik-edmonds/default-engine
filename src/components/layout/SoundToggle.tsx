"use client"

import { useEffect, useState } from "react"
import { useAtom } from "jotai"
import { Howl } from "howler"
import { sfxEnabled } from "@/helpers/StateProvider"
import { useSfx } from "@/helpers/useSfx"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"

// Same per-phase language as the logo (Icon.tsx's Favicon, via
// Interfaces.tsx's `themes` table) where it coincides (dawn/evening);
// day/night are this control's own values, per explicit design direction
// rather than a 1:1 reuse of that table (themes.day is "white", not black).
const BAR_COLOR_BY_PHASE: Record<TimeOfDay, string> = {
  dawn: "#ffb37a",
  day: "#000000",
  evening: "#000000",
  night: "#d25a1a",
}

// Per-track, not shared: tides.wav is mastered far hotter than waves.mp3, so
// matching their gain made night blare against the day. Night is meant to sit
// just perceptibly above day as a background bed, not draw attention, which
// at these source levels means a much lower nominal number -- the two are not
// comparable as raw gains.
const AMBIENT_VOLUME = 0.35
const NIGHT_AMBIENT_VOLUME = 0.05
// Long enough to read as the tide coming in rather than a track change. The
// visual transition into night is far longer (AUTO_TRANSITION_SECONDS), so
// there's no risk of the audio outlasting the phase it belongs to.
const CROSSFADE_MS = 4000

const SIZE = 56
// Per-bar (duration, delay) so the bars bounce out of sync with each other
// -- an organic equalizer, not four bars moving in lockstep.
const BARS = [
  { duration: 0.8, delay: 0 },
  { duration: 1.0, delay: 0.15 },
  { duration: 0.7, delay: 0.05 },
  { duration: 0.95, delay: 0.25 },
]

export default function SoundToggle({ currentPhase }: { currentPhase: TimeOfDay }) {
  const [enabled, setEnabled] = useAtom(sfxEnabled)
  const play = useSfx()

  const [waves] = useState(() => new Howl({
    src: ["/sound/waves.mp3"],
    volume: AMBIENT_VOLUME,
    loop: true,
    preload: false,
    // Howler's default (Web Audio API) decoding has to fetch AND fully
    // decode the whole file before any playback can start -- for a 29MB
    // file that's the multi-second delay before waves audibly starts.
    // html5: true switches to native <audio> streaming instead, which
    // starts as soon as the first chunk buffers.
    html5: true,
  }))

  // Night's ambient bed. Starts silent: whichever track isn't current sits at
  // volume 0 rather than paused, so a crossfade can raise it from nothing
  // without a play() click at the top of the fade.
  const [tides] = useState(() => new Howl({
    src: ["/sound/tides.wav"],
    volume: 0,
    loop: true,
    preload: false,
    // 12MB, same streaming reasoning as waves.mp3 above.
    html5: true,
  }))

  // currentPhase (useTimeOfDayCycle) only flips once a transition has fully
  // landed, so this goes true at the exact moment night arrives on screen --
  // which is where the crossfade should start.
  const isNight = currentPhase === "night"

  useEffect(() => {
    if (!enabled) {
      // Guarded on playing(): pausing a Howl that was never started still
      // makes Howler touch its underlying <audio> element, and with
      // html5 streaming that tears down an in-flight range request --
      // which Chrome reports as `net::ERR_ABORTED /sound/tides.wav` in the
      // console. Nothing is actually broken by it, but it's noise, and
      // there's no reason to pause a track that never began.
      if (waves.playing()) waves.pause()
      if (tides.playing()) tides.pause()
      return
    }

    const [incoming, outgoing] = isNight ? [tides, waves] : [waves, tides]
    const incomingVolume = isNight ? NIGHT_AMBIENT_VOLUME : AMBIENT_VOLUME

    if (incoming.state() === "unloaded") incoming.load()
    if (!incoming.playing()) incoming.play()
    incoming.fade(incoming.volume(), incomingVolume, CROSSFADE_MS)

    // Only fade the outgoing track if it's actually audible -- fading a
    // stopped Howl from 0 to 0 is a no-op that still schedules a timer.
    let stopOutgoing: ReturnType<typeof setTimeout> | undefined
    if (outgoing.playing()) {
      outgoing.fade(outgoing.volume(), 0, CROSSFADE_MS)
      // Pause once silent rather than leaving a second stream decoding
      // forever. Cleared below if the phase flips back mid-fade, so a
      // fast dawn<->night bounce can't pause the track it just revived.
      stopOutgoing = setTimeout(() => outgoing.pause(), CROSSFADE_MS)
    }

    return () => {
      if (stopOutgoing) clearTimeout(stopOutgoing)
    }
  }, [enabled, isNight, waves, tides])

  // Same orphaned-instance risk Speaker.tsx has -- stop cleanly on unmount
  // rather than leaving a looping ambient track running with nothing left
  // to control it.
  useEffect(() => () => {
    if (waves.playing()) waves.stop()
    if (tides.playing()) tides.stop()
  }, [waves, tides])

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
        // instead of freezing mid-bounce. Color eases across phase changes
        // via the same transition property, rather than snapping.
        <span
          key={i}
          aria-hidden="true"
          className={enabled ? "eq-bar eq-bar-animating" : "eq-bar"}
          style={{
            display: "inline-block",
            width: 4,
            height: 20,
            borderRadius: 2,
            background: BAR_COLOR_BY_PHASE[currentPhase],
            animationDuration: `${bar.duration}s`,
            animationDelay: `${bar.delay}s`,
          }}
        />
      ))}
    </button>
  )
}
