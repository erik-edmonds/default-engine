"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import {
  AUTO_TRANSITION_SECONDS,
  CLICK_DWELL_SECONDS,
  TRANSITION_SECONDS,
  nextPhase,
  type TimeOfDay,
} from "@/components/canvas/environmentPresets"
import { prefersReducedMotion } from "@/helpers/motion"

// `from`/`phase`/`seconds` together describe ONE transition: animate from
// `from`'s preset into `phase`'s preset, taking `seconds`. Every consumer
// (Environment, the ocean shader, the phase cube) uses this directly to
// initialize its own starting values AND drive its own tween in an effect
// keyed on `phase` -- deliberately not just `{ phase, seconds }`: a consumer
// that only knows the TARGET has to assume it's already sitting at that
// target the first time it ever sees it (nothing else to initialize a
// starting point from), which is wrong whenever this component happens to
// mount mid-transition -- and since Environment/OceanWater/PhaseCube are
// Suspense-gated behind 3D asset loading while this hook (living in
// page.tsx, unsuspended) starts advancing immediately, "mounts mid-
// transition" is the common case, not an edge case. Explicitly carrying
// `from` means a late-mounting consumer can initialize AT the correct
// starting preset and animate for the full `seconds`, regardless of when it
// actually mounts -- no coordination with mount timing required at all.
export interface TimeOfDayTransition {
  from: TimeOfDay
  phase: TimeOfDay
  /** Duration for the transition INTO `phase`, handed to consumers as
   *  `transitionSeconds`. 0 means snap, no animation. */
  seconds: number
  /** How long until the NEXT auto-advance fires, timed from when THIS
   *  transition was set. Equals `seconds` for a snap or an auto-tick (so
   *  auto segments stay back-to-back with no dwell), but is LONGER than
   *  `seconds` for a click: the tween itself still only takes
   *  TRANSITION_SECONDS, but the arrived-at phase then holds, fully
   *  settled, for CLICK_DWELL_SECONDS before auto-progression resumes --
   *  without that gap this field would just always equal `seconds`, and a
   *  click's own resume-timer (armed for exactly as long as its tween)
   *  would fire the instant the tween finishes, pulling away again before
   *  the clicked-to phase was ever visible at rest. */
  holdSeconds: number
}

export function useTimeOfDayCycle(initialPhase: TimeOfDay) {
  const [transition, setTransition] = useState<TimeOfDayTransition>({
    from: initialPhase,
    phase: initialPhase,
    seconds: 0,
    holdSeconds: 0,
  })

  // `initialPhase` is a fixed SSR-safe placeholder, not a real reading of
  // the clock -- resetTo() below corrects it to the real hour once we're on
  // the client. Auto-progression must not start counting from the
  // placeholder: without this guard the effect below schedules its own
  // immediate advance off of `initialPhase` before resetTo has a chance to
  // run, racing it and sometimes winning, which sends the very first
  // transition to the wrong phase (observed: starting from the "day"
  // placeholder instead of the real current hour).
  const startedRef = useRef(false)

  // Jump straight to a phase with no animation -- used once at mount to
  // correct the SSR-safe placeholder to the real clock hour. `from` equals
  // `phase` here on purpose (an instant snap has nothing to animate from).
  // Also releases the guard above, since this is what makes the phase
  // trustworthy enough to start auto-progressing from.
  const resetTo = useCallback((phase: TimeOfDay) => {
    startedRef.current = true
    setTransition({ from: phase, phase, seconds: 0, holdSeconds: 0 })
  }, [])

  // The cube's click: skip ahead fast, then hold there (see holdSeconds'
  // own doc comment) before auto-progression resumes. A functional update
  // (rather than trusting a phase value computed elsewhere) means a click
  // landing in the same React batch as an auto-tick still advances from the
  // tick's result instead of clobbering it with a stale value.
  const skipAhead = useCallback(() => {
    setTransition((prev) => ({
      from: prev.phase,
      phase: nextPhase(prev.phase),
      seconds: TRANSITION_SECONDS,
      holdSeconds: TRANSITION_SECONDS + CLICK_DWELL_SECONDS,
    }))
  }, [])

  useEffect(() => {
    if (prefersReducedMotion()) return
    if (!startedRef.current) return

    // Fire when the CURRENT transition's hold finishes (holdSeconds), not
    // always AUTO_TRANSITION_SECONDS later -- otherwise the scene sits
    // frozen for the rest of a full segment after every snap (holdSeconds:
    // 0, from resetTo) before the next transition starts, instead of
    // transitioning continuously. Using `seconds` here instead (the click
    // case's tween duration) would reintroduce a different bug: the resume
    // timer would fire the instant a click's tween finishes, giving the
    // clicked-to phase zero time on screen before immediately continuing on
    // -- see holdSeconds' doc comment. The step this timer schedules is
    // always full-length (AUTO_TRANSITION_SECONDS) with no extra hold, so
    // ONE click's fast skip-and-hold is followed by normal back-to-back
    // auto-progression from there, not a repeating hold every segment. This
    // effect is intentionally free of any "wait for the scene to be
    // ready/mounted" gate -- an earlier version gated it on drei's
    // useProgress, which not only oscillates several times during load
    // (each bounce re-triggering and silently resetting an already-ticking
    // countdown back to full length) but, more fundamentally, ties the
    // sky's very first movement to ALL of the page's assets finishing
    // (avatar, dragonite, shark, props -- far more than the sky/sun/moon
    // system actually needs), which on a slow load is exactly the "doesn't
    // start for a full minute" symptom this is meant to fix. The `from`
    // field on TimeOfDayTransition is what makes this safe to fire
    // immediately instead: consumers no longer need to already be mounted
    // to animate correctly.
    const id = setTimeout(() => {
      setTransition((prev) => ({
        from: prev.phase,
        phase: nextPhase(prev.phase),
        seconds: AUTO_TRANSITION_SECONDS,
        holdSeconds: AUTO_TRANSITION_SECONDS,
      }))
    }, Math.max(transition.holdSeconds, 0) * 1000)

    // Keying this effect on the transition object is what makes "a click
    // resets the clock to the next boundary" fall out for free: every phase
    // change -- click-driven or timer-driven -- produces a fresh object,
    // which tears down the pending timeout and schedules a new one timed to
    // this change's own duration.
    return () => clearTimeout(id)
  }, [transition])

  return { from: transition.from, phase: transition.phase, transitionSeconds: transition.seconds, skipAhead, resetTo }
}
