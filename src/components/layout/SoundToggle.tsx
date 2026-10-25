"use client"

import { useEffect, useState } from "react"
import { useAtom, useAtomValue } from "jotai"
import { sfxBlocked, sfxEnabled, soundOffNudge } from "@/helpers/StateProvider"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"

/** THE SWITCH, AND ONLY THE SWITCH.
 *
 *  The three ambient Howls this used to own now live in AmbientBeds, mounted
 *  once at the top of the page. The reason is in that file: SiteMenu renders
 *  this control in two different places in the tree -- parked off-screen
 *  while the menu is shut, inside the settings panel while it is open -- and
 *  React treats that as an unmount and a remount, which ran the cleanup that
 *  unloaded all three beds. The sound went off by itself the moment the
 *  settings tab was opened, before the switch had been touched.
 *
 *  Owning no audio, this is now free to be mounted wherever, as often as
 *  needed. It reads and writes one atom. */

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

const SIZE = 56
// Short and sharp: long enough to read four words, gone before it becomes
// something to dismiss.
const NUDGE_VISIBLE_MS = 2600
const ACCENT = "#d25a1a"
// Per-bar (duration, delay) so the bars bounce out of sync with each other
// -- an organic equalizer, not four bars moving in lockstep.
const BARS = [
  { duration: 0.8, delay: 0 },
  { duration: 1.0, delay: 0.15 },
  { duration: 0.7, delay: 0.05 },
  { duration: 0.95, delay: 0.25 },
]

export default function SoundToggle({
  currentPhase,
  bare = false,
}: {
  currentPhase: TimeOfDay
  /** Drop the white disc and draw the bars alone.
   *
   *  Inside the settings panel the control sits in a row of values on a
   *  dark sheet, where a white circle reads as a button that has escaped
   *  from somewhere else. */
  bare?: boolean
}) {
  const [enabled, setEnabled] = useAtom(sfxEnabled)
  const blocked = useAtomValue(sfxBlocked)

  // Something audible-only was activated while muted. Keyed on the counter, so
  // a second attempt while the callout is still up restarts it rather than
  // being swallowed.
  const nudgeCount = useAtomValue(soundOffNudge)
  const [nudging, setNudging] = useState(false)
  useEffect(() => {
    if (nudgeCount === 0) return
    setNudging(true)
    const timer = setTimeout(() => setNudging(false), NUDGE_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [nudgeCount])

  // Turning sound on is the thing the callout was asking for -- retract it
  // immediately rather than leaving it nagging about a solved problem.
  useEffect(() => {
    if (enabled) setNudging(false)
  }, [enabled])

  const handleClick = () => {
    setEnabled((v) => !v)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      // No hover sound -- see Icon.tsx. Doubly odd on this control, which is
      // the one that decides whether sounds play at all.
      aria-label={enabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={enabled}
      style={{
        // Anchors the callout below, which is positioned against this button
        // so it tracks the icon rather than a guessed screen offset.
        position: "relative",
        width: bare ? "auto" : SIZE,
        height: SIZE,
        borderRadius: 9999,
        background: bare ? "none" : "#fff",
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
          // `&& !blocked`: the bars are the only indication that sound is on,
          // so animating them while the browser is refusing to play makes the
          // control state a lie. Flat bars with the toggle still "on" reads
          // correctly -- enabled, but not sounding.
          className={enabled && !blocked ? "eq-bar eq-bar-animating" : "eq-bar"}
          style={{
            display: "inline-block",
            width: 4,
            height: 20,
            borderRadius: 2,
            // On the dark settings sheet the phase colours are wrong --
            // day and evening are black, which is invisible there. The
            // bare variant always draws light.
            background: bare ? "rgba(255,255,255,0.92)" : BAR_COLOR_BY_PHASE[currentPhase],
            animationDuration: `${bar.duration}s`,
            animationDelay: `${bar.delay}s`,
          }}
        />
      ))}

      {/* The "you need this control" callout. Hangs off the button itself,
          below and right-aligned to it, so it always sits under the sound
          icon wherever the top-right cluster ends up. Same flat accent chip
          as HotspotJoystick's direction readout -- solid #d25a1a rather than
          the scene hints' black glass, because this one is a correction
          rather than an invitation and should read as louder than they do. */}
      <span
        className="font-nunito sound-nudge"
        aria-hidden="true"
        data-shown={nudging ? "true" : "false"}
        style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 10,
          whiteSpace: "nowrap",
          padding: "6px 14px",
          borderRadius: 2,
          background: ACCENT,
          color: "#fff",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          pointerEvents: "none",
        }}
      >
        Turn on sound first!
      </span>
    </button>
  )
}
