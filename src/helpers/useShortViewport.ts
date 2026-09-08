"use client"

import { useEffect, useState } from "react"

/** Below this the scene's chrome has to get out of its own way. A landscape
 *  phone is roughly 390-430px tall before Safari's toolbar and ~330-350 after,
 *  while a portrait phone is 800+; 500 separates them cleanly and never catches
 *  a laptop. */
const SHORT_VIEWPORT_QUERY = "(max-height: 500px)"

// True when there is very little vertical room -- in practice, a phone held
// sideways.
//
// This exists because every breakpoint in the app is width-only, and a
// landscape iPhone is 844-932px WIDE. Tailwind's `md:` therefore applies, so
// the name renders at its 60px desktop size on a viewport with about 350px of
// visible height, and the joystick (112px tall, sitting 112px up) takes roughly
// two thirds of it. Width tells you nothing useful here; height does.
//
// Same shape as useCoarsePointer: fixed `false` on the first render so the
// server and the client's first render agree, corrected in an effect, and
// subscribed to `change` so rotating the device updates live rather than
// needing a reload.
export function useShortViewport() {
  const [short, setShort] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(SHORT_VIEWPORT_QUERY)
    setShort(query.matches)
    const onChange = (event: MediaQueryListEvent) => setShort(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return short
}
