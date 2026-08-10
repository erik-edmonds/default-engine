"use client"

import { useCallback, useEffect, useState } from "react"

import {
  AUTO_TRANSITION_SECONDS,
  TRANSITION_SECONDS,
  nextPhase,
  type TimeOfDay,
} from "@/components/canvas/environmentPresets"
import { prefersReducedMotion } from "@/helpers/motion"

// Phase and duration are stored as ONE object on purpose. Every consumer
// (Environment, the ocean shader, the phase cube) starts its own tween in an
// effect keyed on the phase and reads the duration alongside it -- if these
// were two separate useStates, they could in principle land in different
// renders and a consumer could start a 2-minute tween with a 3-second
// duration (or vice versa). One object behind one setState makes that
// structurally impossible.
export interface TimeOfDayTransition {
  phase: TimeOfDay
  /** Duration for the transition INTO `phase`. 0 means snap, no animation. */
  seconds: number
}

export function useTimeOfDayCycle(initialPhase: TimeOfDay) {
  const [transition, setTransition] = useState<TimeOfDayTransition>({
    phase: initialPhase,
    seconds: 0,
  })

  // Jump straight to a phase with no animation -- used once at mount to
  // correct the SSR-safe placeholder to the real clock hour.
  const resetTo = useCallback((phase: TimeOfDay) => {
    setTransition({ phase, seconds: 0 })
  }, [])

  // The cube's click: skip ahead fast. A functional update (rather than
  // trusting a phase value computed elsewhere) means a click landing in the
  // same React batch as an auto-tick still advances from the tick's result
  // instead of clobbering it with a stale value.
  const skipAhead = useCallback(() => {
    setTransition((prev) => ({ phase: nextPhase(prev.phase), seconds: TRANSITION_SECONDS }))
  }, [])

  useEffect(() => {
    // prefers-reduced-motion means "don't move things I didn't ask you to
    // move." Auto-progression is by definition unrequested, permanent
    // motion, so it's switched off entirely rather than sped up: at the
    // reduced-motion scale a 120s tween finishes in ~6s, which would just be
    // an unannounced snap every two minutes -- more jarring than the slow
    // version, not less. The cube still works as a manual control (its own
    // click-triggered tweens still animate, just fast).
    if (prefersReducedMotion()) return

    const id = setTimeout(() => {
      setTransition((prev) => ({ phase: nextPhase(prev.phase), seconds: AUTO_TRANSITION_SECONDS }))
    }, AUTO_TRANSITION_SECONDS * 1000)

    // Keying this effect on the transition object is what makes "a click
    // resets the 2-minute clock" fall out for free: every phase change --
    // click-driven or timer-driven -- produces a fresh object, which tears
    // down the pending timeout and schedules a new full-length one. There's
    // no separate explicit "reset the timer" call anywhere.
    return () => clearTimeout(id)
  }, [transition])

  return { phase: transition.phase, transitionSeconds: transition.seconds, skipAhead, resetTo }
}
