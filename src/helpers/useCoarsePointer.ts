"use client"

import { useEffect, useState } from "react"

// True on touch-first devices.
//
// Fixed `false` on the first render so the server and the client's first
// render always agree -- reading matchMedia directly in useState() would run
// only on the client and mismatch the prerendered "/" -- then corrected in an
// effect. Same shape as getTimeOfDay() in page.tsx and the theme atom in
// StateProvider.tsx. Anything gated on this must be safe to render once as its
// fine-pointer variant.
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)")
    setCoarse(query.matches)
    // Not one-shot: a tablet gaining or losing a trackpad, and devtools'
    // device-emulation toggle, both flip this with no reload.
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches)
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  return coarse
}
