"use client"

import { useCallback, useEffect, useRef } from "react"
import * as THREE from "three"
import { useAtomValue, useSetAtom } from "jotai"

import { cameraFlying, musicEnabled, openPortalId, rainRequest } from "@/helpers/StateProvider"
import {
  ARRIVAL_SETTLE_MS,
  HINT_ABANDON_MS,
  HINT_MAX_VISIBLE_MS,
  HINT_MIN_VISIBLE_MS,
  HOME_BUTTON_HINT_ANCHOR,
  PORTAL_INSIDE_SETTLE_MS,
  activeHint,
  hintOnScreen,
  type ActiveHint,
  type HintId,
  PORTAL_HINT_MAX_DISTANCE,
} from "@/helpers/hints"
import {
  FIRST_SUGGESTION_IDLE_MS,
  activeSuggestion,
  advanceSuggestion,
  remainingSuggestions,
  suggestions,
  suggestionsMuted,
  suggestionsSatisfied,
  suggestionsSeen,
} from "@/helpers/avatarBubble"
import { SUGGESTIONS, type SuggestionSubject } from "@/config/suggestions"
import { useCoarsePointer } from "@/helpers/useCoarsePointer"

/** Priority order, highest first. Only one hint is ever on screen; a
 *  higher-priority one may take the slot from a lower one, but only once the
 *  lower one has served its minimum visible time.
 *
 *  Both of the two left are portal beats. The three discovery nudges that used
 *  to sit below them -- guitar, clouds, pokeball -- are suggestions in the
 *  avatar's queue now; hints.ts's header says why those could move and these
 *  two could not. With them went the whole idle-and-re-arm apparatus that
 *  existed to ration one slot between four competing nudges, two of which
 *  realistically never appeared. A queue the visitor steps through does not
 *  need rationing. */
const PRIORITY: HintId[] = ["portalExit", "portalEnter"]

const EVALUATE_INTERVAL_MS = 400

/** Which portal, once entered, retires which suggestion.
 *
 *  Keyed by the ids in config/portals.ts. He should not still be recommending
 *  the thing you are standing inside. */
const PORTAL_SATISFIES: Record<string, SuggestionSubject> = {
  "01": "models",
  "02": "about",
  "03": "contact",
}

export interface HintDirectorInput {
  /** The loading screen is done and the scene is live. */
  started: boolean
  /** InteractionHint has been dismissed -- the "click to explore" beat is
   *  over, so contextual nudges may begin. Ignored on touch, where that hint
   *  is never rendered at all; see `introFinished` below. */
  hasInteracted: boolean
  /** hotspotNav.current from page.tsx. */
  currentHotspot: string
  /** Whether the Poke Ball has been opened and the gear used. Unlike the
   *  guitar and the clouds there is no existing atom that says so -- the
   *  props report to a single callback each and nothing else -- and
   *  hasInteracted is far too coarse, since every hotspot flight sets it. */
  pokeballUsed: boolean
  /** Where each portal-bearing hotspot's hint should pin itself, keyed by
   *  hotspot id. Hotspots with no portal (home) are simply absent. */
  portalTargets: Record<string, THREE.Vector3>
}

// Decides which hint, if any, should be on screen right now -- and keeps the
// avatar's suggestion queue honest.
//
// THE TWO JOBS ARE HERE TOGETHER FOR ONE REASON: both depend on the same
// discovery state, and this hook already read all of it. musicEnabled says the
// guitar has been found, rainRequest says a cloud has, openPortalId says which
// portal has been entered. The hint half consumes that to decide what to show;
// the queue half consumes it to decide what to stop offering. Splitting them
// would mean two subscriptions to the same six atoms and two statements of
// what "the visitor already found this" means.
//
// Runs on an interval rather than purely on dependency changes because most of
// the conditions are *elapsed time* (idle for long enough, arrived long enough
// ago) and nothing re-renders when time passes.
export function useHintDirector({ started, hasInteracted, currentHotspot, pokeballUsed, portalTargets }: HintDirectorInput) {
  const setActive = useSetAtom(activeHint)
  const musicOn = useAtomValue(musicEnabled)
  const rainCount = useAtomValue(rainRequest)
  const openPortal = useAtomValue(openPortalId)
  const flying = useAtomValue(cameraFlying)
  const onScreen = useAtomValue(hintOnScreen)
  const coarse = useCoarsePointer()

  const setSuggestions = useSetAtom(suggestions)
  const setSatisfied = useSetAtom(suggestionsSatisfied)
  const advance = useSetAtom(advanceSuggestion)
  const remaining = useAtomValue(remainingSuggestions)
  const seen = useAtomValue(suggestionsSeen)
  const speaking = useAtomValue(activeSuggestion)
  const muted = useAtomValue(suggestionsMuted)

  // "The onboarding beat is over." On a mouse that's InteractionHint being
  // dismissed, which happens on the first pointermove. On touch there is no
  // pointermove until something is deliberately tapped -- and page.tsx doesn't
  // render InteractionHint on coarse pointers anyway -- so waiting for it there
  // means a phone visitor who never navigates never gets a discovery nudge at
  // all. Nothing to wait behind, so don't wait.
  const introFinished = coarse || hasInteracted

  // Sticky "the user has done this" flags. Sticky matters: openPortalId goes
  // back to null the moment you leave, and without this the director would
  // decide the portal was unentered all over again and re-offer the
  // instruction for something demonstrably already done.
  const done = useRef<Record<HintId, boolean>>({
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
  const input = useRef({
    started, introFinished, currentHotspot, portalTargets, flying, openPortal, onScreen,
    hasRemaining: remaining.length > 0, hasSeenAny: seen.size > 0, speaking: speaking !== null, muted,
  })
  input.current = {
    started, introFinished, currentHotspot, portalTargets, flying, openPortal, onScreen,
    hasRemaining: remaining.length > 0, hasSeenAny: seen.size > 0, speaking: speaking !== null, muted,
  }

  // The queue, published once. Static today; an atom rather than a constant
  // because retiring entries is a write and the bubble reads it from the far
  // side of the canvas boundary.
  useEffect(() => {
    setSuggestions(SUGGESTIONS)
  }, [setSuggestions])

  /** Retire a suggestion's subject because the visitor got there first.
   *
   *  Additive and idempotent: this is called from four separate effects and
   *  nothing ever un-finds something. Memoised on jotai's setter, which is
   *  itself stable, so the four effects below do not re-run every render. */
  const satisfy = useCallback(
    (subject: SuggestionSubject) => {
      setSatisfied((prev) => (prev.has(subject) ? prev : new Set(prev).add(subject)))
    },
    [setSatisfied],
  )

  // Discovery. Each flips once and stays flipped. These are the same four
  // signals the discovery hints used to key off; they retire queue entries now
  // instead of cancelling captions.
  useEffect(() => {
    if (musicOn) satisfy("guitar")
  }, [musicOn, satisfy])
  useEffect(() => {
    if (rainCount > 0) satisfy("clouds")
  }, [rainCount, satisfy])
  useEffect(() => {
    if (pokeballUsed) satisfy("pokeball")
  }, [pokeballUsed, satisfy])
  useEffect(() => {
    if (openPortal === null) {
      // Left the portal: the exit hint has served its purpose whether or not
      // it was ever shown.
      if (enteredAt.current !== null) done.current.portalExit = true
      enteredAt.current = null
      return
    }
    done.current.portalEnter = true
    if (enteredAt.current === null) enteredAt.current = performance.now()
    const subject = PORTAL_SATISFIES[openPortal]
    if (subject) satisfy(subject)
  }, [openPortal, satisfy])

  // The idle clock. Reset by anything that counts as the user engaging with
  // the scene -- a cloud, the guitar, arriving somewhere new, opening a
  // portal, or the first pointer move that dismisses InteractionHint.
  useEffect(() => {
    idleSince.current = performance.now()
  }, [musicOn, rainCount, pokeballUsed, currentHotspot, openPortal, introFinished, started])

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
          // A portal is 4.5 units from its own viewpoint (PORTAL_VIEW_DISTANCE)
          // and 30-45 from any other, so this cleanly separates "you are stood
          // at it" from "you can see it across the water". Without it the hint
          // appeared at the Home viewpoint, captioning a portal far out of
          // reach -- on screen, because it projects into frame, but impossible
          // to double-click.
          return { id, target: { kind: "world", position, maxDistance: PORTAL_HINT_MAX_DISTANCE } }
        }
      }
    }

    const retire = (id: HintId, now: number) => {
      spent.current.add(id)
      activeId.current = null
      shownAt.current = null
      activatedAt.current = null
      idleSince.current = now
      setActive(null)
    }

    /** HE OPENS THE FIRST ONE HIMSELF, AND ONLY THE FIRST.
     *
     *  A numbered badge over a character in a 3D scene is not self-evidently
     *  something you click. One unprompted line teaches the mechanic; from
     *  then on the badge is enough and the pace is the visitor's. Gated on the
     *  same conditions the discovery nudges had -- at home, nothing else going
     *  on, and a real idle stretch -- because interrupting someone who is
     *  already busy is the thing worth not doing. */
    const maybeOpenFirst = (now: number) => {
      const state = input.current
      // Muted means he has been asked to stop; the unprompted opener is
      // exactly the thing that must not come back after that.
      if (state.muted) return
      if (state.hasSeenAny || state.speaking || !state.hasRemaining) return
      if (!state.introFinished || state.currentHotspot !== "home") return
      if (state.flying || state.openPortal !== null) return
      if (now - idleSince.current < FIRST_SUGGESTION_IDLE_MS) return
      advance()
    }

    const evaluate = () => {
      const now = performance.now()
      maybeOpenFirst(now)
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
  }, [started, setActive, advance])

  // Clear on unmount so a hint can't outlive the page it points into.
  useEffect(() => () => setActive(null), [setActive])
}
