"use client"

import { useEffect, useState } from "react"

/** A touch device with room to spare -- in practice, a tablet.
 *
 *  Three clauses, each carrying its weight:
 *
 *  - `(pointer: coarse)` is the same signal useCoarsePointer uses, so this can
 *    only ever be true where the joystick is mounted at all.
 *  - `(min-width: 600px)` is what separates a tablet from a phone. Every iPad
 *    is 744px+ in its narrow dimension; the widest phone in portrait is 430.
 *    600 sits in the gap with room on both sides.
 *  - `(min-height: 501px)` hands a phone in landscape straight back to
 *    useShortViewport, whose threshold is `max-height: 500px`. The two
 *    together partition every touch viewport exactly once.
 */
const TABLET_QUERY = "(pointer: coarse) and (min-width: 600px) and (min-height: 501px)"

// True on tablets, in either orientation.
//
// This exists because an iPad matched none of the app's existing breakpoints.
// `(pointer: coarse)` is true, so the joystick mounts -- but the only
// *positional* breakpoint in the app is useShortViewport's `max-height: 500px`,
// and an iPad's smallest viewport is 744px tall, so it never matched in either
// orientation. The joystick therefore sat dead centre of the bottom edge, over
// the scene, on the one class of device with the most room to get out of the
// way.
//
// Same shape as useCoarsePointer and useShortViewport: fixed `false` on the
// first render so the server and the client's first render agree, corrected in
// an effect, and subscribed to `change` so rotating the device updates live.
export function useTabletViewport() {
  const [tablet, setTablet] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(TABLET_QUERY)
    setTablet(query.matches)
    const onChange = (event: MediaQueryListEvent) => setTablet(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return tablet
}
