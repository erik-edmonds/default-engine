"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useAtomValue, useSetAtom } from "jotai"

import { cameraFlying, musicEnabled, openPortalId, rainRequest } from "@/helpers/StateProvider"
import {
  ARRIVAL_SETTLE_MS,
  DISCOVER_IDLE_MS,
  GUITAR_HINT_POSITION,
  HINT_ABANDON_MS,
  HINT_MAX_VISIBLE_MS,
  HINT_MIN_VISIBLE_MS,
  HOME_BUTTON_HINT_ANCHOR,
  PORTAL_INSIDE_SETTLE_MS,
  activeHint,
  cloudOnScreen,
  hintOnScreen,
  type ActiveHint,
  type HintId,
} from "@/helpers/hints"
import { useCoarsePointer } from "@/helpers/useCoarsePointer"

/** Priority order, highest first. Only one hint is ever on screen; a
 *  higher-priority one may take the slot from a lower one, but only once the
 *  lower one has served its minimum visible time. */
const PRIORITY: HintId[] = ["portalExit", "portalEnter", "guitar", "clouds"]

const EVALUATE_INTERVAL_MS = 400

export interface HintDirectorInput {
  /** The loading screen is done and the scene is live. */
  started: boolean
  /** InteractionHint has been dismissed -- the "click to explore" beat is
   *  over, so contextual nudges may begin. Ignored on touch, where that hint
   *  is never rendered at all; see `introFinished` below. */
  hasInteracted: boolean
  /** hotspotNav.current from page.tsx. */
  currentHotspot: string
  /** Where each portal-bearing hotspot's hint should pin itself, keyed by
   *  hotspot id. Hotspots with no portal (home) are simply absent. */
  portalTargets: Record<string, THREE.Vector3>
}

// Decides which hint, if any, should be on screen right now.
//
// Everything it needs to know about discovery it reads from atoms that already
// existed -- musicEnabled says the guitar has been found, rainRequest says a
// cloud has -- so neither Guitar.tsx nor Sky.tsx has to report anything. The
// two portal beats key off openPortalId, which PortalRouteSync publishes from
// the wouter route.
//
// Runs on an interval rather than purely on dependency changes because most of
// the conditions are *elapsed time* (idle for long enough, arrived long enough
// ago) and nothing re-renders when time passes.
export function useHintDirector({ started, hasInteracted, currentHotspot, portalTargets }: HintDirectorInput) {
  const setActive = useSetAtom(activeHint)
  const musicOn = useAtomValue(musicEnabled)
  const rainCount = useAtomValue(rainRequest)
  const openPortal = useAtomValue(openPortalId)
  const flying = useAtomValue(cameraFlying)
  const cloudVisible = useAtomValue(cloudOnScreen)
  const onScreen = useAtomValue(hintOnScreen)
  const coarse = useCoarsePointer()

  // "The onboarding beat is over." On a mouse that's InteractionHint being
  // dismissed, which happens on the first pointermove. On touch there is no
  // pointermove until something is deliberately tapped -- and page.tsx doesn't
  // render InteractionHint on coarse pointers anyway -- so waiting for it there
  // means a phone visitor who never navigates never gets a discovery nudge at
  // all. Nothing to wait behind, so don't wait.
  const introFinished = coarse || hasInteracted

  // Sticky "the user has done this" flags. Sticky matters: musicEnabled goes
  // back to false when the user toggles the guitar off again (and page.tsx
  // clears it outright on the fly-up and the dive), and without this the
  // director would decide the guitar was undiscovered all over again and nag
  // about something they demonstrably already found.
  const done = useRef<Record<HintId, boolean>>({
    guitar: false,
    clouds: false,
    portalEnter: false,
    portalExit: false,
  })
  /** Hints already shown and retired. A hint appears at most once per load. */
  const spent = useRef<Set<HintId>>(new Set())
  const shownAt = useRef<number | null>(null)
  const activatedAt = useRef<number | null>(null)
  const activeId = useRef<HintId | null>(null)
  const idleSince = useRef(0)
  const arrivedAt = useRef<number | null>(null)
  const enteredAt = useRef<number | null>(null)
  const wasFlying = useRef(false)

  // Latest inputs, read by the interval below without making it re-subscribe
  // every time one of them changes.
  const input = useRef({ started, introFinished, currentHotspot, portalTargets, flying, openPortal, cloudVisible, onScreen })
  input.current = { started, introFinished, currentHotspot, portalTargets, flying, openPortal, cloudVisible, onScreen }

  // Discovery. Each flips once and stays flipped.
  useEffect(() => {
    if (musicOn) done.current.guitar = true
  }, [musicOn])
  useEffect(() => {
    if (rainCount > 0) done.current.clouds = true
  }, [rainCount])
  useEffect(() => {
    if (openPortal !== null) {
      done.current.portalEnter = true
      if (enteredAt.current === null) enteredAt.current = performance.now()
    } else {
      // Left the portal: the exit hint has served its purpose whether or not
      // it was ever shown.
      if (enteredAt.current !== null) done.current.portalExit = true
      enteredAt.current = null
    }
  }, [openPortal])

  // The idle clock. Reset by anything that counts as the user engaging with
  // the scene -- a cloud, the guitar, arriving somewhere new, opening a
  // portal, or the first pointer move that dismisses InteractionHint.
  useEffect(() => {
    idleSince.current = performance.now()
  }, [musicOn, rainCount, currentHotspot, openPortal, introFinished, started])

  // Flight edges. A hotspot hint waits for the camera to actually land.
  useEffect(() => {
    if (wasFlying.current && !flying) arrivedAt.current = performance.now()
    wasFlying.current = flying
  }, [flying])

  useEffect(() => {
    if (!started) return

    const eligible = (id: HintId, now: number): ActiveHint | null => {
      const state = input.current
      if (spent.current.has(id) || done.current[id]) return null

      switch (id) {
        case "portalExit":
          if (state.openPortal === null) return null
          if (enteredAt.current === null || now - enteredAt.current < PORTAL_INSIDE_SETTLE_MS) return null
          return { id, target: { kind: "screen", ...HOME_BUTTON_HINT_ANCHOR } }

        case "portalEnter": {
          if (state.openPortal !== null || state.flying) return null
          if (arrivedAt.current === null || now - arrivedAt.current < ARRIVAL_SETTLE_MS) return null
          const position = state.portalTargets[state.currentHotspot]
          if (!position) return null
          return { id, target: { kind: "world", position } }
        }

        // The two discovery nudges share a gate: only at the home viewpoint
        // (both objects are there), only once the onboarding hint is done,
        // only while nothing else is going on, and only after a real idle
        // stretch.
        case "guitar":
        case "clouds": {
          if (!state.introFinished || state.currentHotspot !== "home") return null
          if (state.flying || state.openPortal !== null) return null
          if (now - idleSince.current < DISCOVER_IDLE_MS) return null
          if (id === "guitar") return { id, target: { kind: "world", position: GUITAR_HINT_POSITION } }
          // Cloud positions are randomised per load, so there may be no cloud
          // in frame to point at. Spending the hint on one that's off-screen
          // would burn it silently.
          if (!state.cloudVisible) return null
          return { id, target: { kind: "cloud" } }
        }
      }
    }

    const retire = (id: HintId, now: number) => {
      spent.current.add(id)
      activeId.current = null
      shownAt.current = null
      activatedAt.current = null
      // Restart the idle clock so a second discovery nudge waits its own full
      // window rather than following straight on from the first.
      idleSince.current = now
      setActive(null)
    }

    const evaluate = () => {
      const now = performance.now()
      const current = activeId.current

      if (current) {
        const elapsed = now - (shownAt.current ?? now)
        const satisfied = done.current[current]

        // A hint the user has already acted on is finished, and this is
        // checked before the visibility hold below on purpose. Acting on a
        // hint frequently moves its own subject out of frame -- entering a
        // portal flies the camera past the very marker that said to enter it
        // -- so an off-screen satisfied hint would otherwise sit on the single
        // slot until the abandon timer, delaying the hint that should follow
        // it (in that case, how to get back out). Off screen it goes at once,
        // since there is no visible flicker to protect against; on screen it
        // still serves its floor.
        if (satisfied && (!input.current.onScreen || elapsed >= HINT_MIN_VISIBLE_MS)) {
          retire(current, now)
          return
        }

        // Both clocks measure time the hint was actually *visible*. A
        // world-anchored hint isn't drawn until the projector's next frame
        // places it; without this a hint can spend its entire maximum never
        // having been drawn once, which is what happens whenever the render
        // loop stalls.
        if (!input.current.onScreen) {
          shownAt.current = now
          // ...but not forever: if it never becomes visible at all, give up
          // rather than blocking every later hint behind it.
          if (activatedAt.current !== null && now - activatedAt.current > HINT_ABANDON_MS) retire(current, now)
          return
        }

        if (elapsed < HINT_MIN_VISIBLE_MS) return
        // Timed out, or displaced by something more urgent.
        const outranked = PRIORITY.slice(0, PRIORITY.indexOf(current)).some((id) => eligible(id, now) !== null)
        if (elapsed > HINT_MAX_VISIBLE_MS || outranked) retire(current, now)
        return
      }

      for (const id of PRIORITY) {
        const hint = eligible(id, now)
        if (!hint) continue
        activeId.current = id
        shownAt.current = now
        activatedAt.current = now
        setActive(hint)
        return
      }
    }

    const timer = setInterval(evaluate, EVALUATE_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [started, setActive])

  // Clear on unmount so a hint can't outlive the page it points into.
  useEffect(() => () => setActive(null), [setActive])
}
