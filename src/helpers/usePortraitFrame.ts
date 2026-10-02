"use client"

import { useCallback, useSyncExternalStore } from "react"

/** The same threshold the 3D scene lays itself out against.
 *
 *  helpers/skyFrame.ts owns PORTRAIT_ASPECT (0.9) and the argument for it:
 *  what decides whether two things fit side by side is the SHAPE of the
 *  frame, not how many pixels it has. This is that number as a media query,
 *  for the handful of DOM and scene-graph decisions that have to agree with
 *  the sky's layout -- 9/10 is 0.9.
 *
 *  Deliberately not reusing useShortViewport: that one is height-only and
 *  exists to catch a phone held SIDEWAYS, which is the opposite case. A
 *  landscape phone is short and wide; this is tall and narrow. Both are
 *  "a phone" and they want opposite things.
 */
const PORTRAIT_QUERY = "(max-aspect-ratio: 9/10)"

/** useSyncExternalStore rather than the useState-in-an-effect that
 *  useShortViewport and useCoarsePointer use.
 *
 *  Those two predate the React compiler lint being switched on and are two of
 *  the errors it already reports (`react-hooks/set-state-in-effect`: setting
 *  state synchronously inside an effect can cascade renders). Copying the
 *  shape for consistency would have meant knowingly adding a 65th error to a
 *  count this project is trying to bring down. This is what that hook shape
 *  is for: an external source of truth, subscribed to, with a server value.
 */
export function usePortraitFrame() {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia(PORTRAIT_QUERY)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PORTRAIT_QUERY).matches,
    // The server has no viewport. False matches the first client render, so
    // there is no hydration mismatch; the real value arrives immediately
    // after, the same way the other two hooks correct themselves.
    () => false,
  )
}
