"use client"

import { useEffect, useState } from "react"

/** Whether this browser can actually open an immersive VR session.
 *
 *  Three states, not two, and the third is why this is a hook rather than a
 *  one-line check: `null` means "no session available (yet)" -- either the
 *  support query has not come back or there is no WebXR here at all.
 *  Deliberately not distinguished: only `true` renders anything, so nothing
 *  can tell them apart, and collapsing them keeps the effect free of a
 *  synchronous setState. `navigator.xr.isSessionSupported`
 *  is async, so there is a real window -- a frame or two, longer on a headset
 *  browser enumerating hardware -- in which the honest answer is neither yes
 *  nor no. The button renders nothing until it is yes, so that window shows no
 *  control rather than a control that might vanish.
 *
 *  Fixed `null` on the first render so the server and the client's first
 *  render agree: `/` is prerendered, and reading navigator in useState() would
 *  run only on the client and mismatch. Same shape as useCoarsePointer.
 *
 *  UNSUPPORTED RENDERS NOTHING, deliberately -- no greyed-out button, no
 *  "your browser doesn't support VR" line. Most visitors are on a laptop with
 *  no headset, and for them VR is not a feature that is broken, it is a
 *  feature that does not apply. A dead control is worse than no control.
 */
export function useXrSupport() {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr
    // No WebXR at all: LEAVE IT null rather than setting false. The two are
    // indistinguishable to every caller -- only `true` renders a control --
    // and a synchronous setState in an effect body is a cascading render
    // that react-hooks/set-state-in-effect rejects for good reason.
    if (!xr?.isSessionSupported) return
    let live = true
    xr.isSessionSupported("immersive-vr").then(
      (ok) => { if (live) setSupported(ok) },
      // A rejection is a no, not an error worth surfacing. Some browsers
      // reject rather than resolve false when the feature is behind a flag or
      // blocked by permissions policy.
      () => { if (live) setSupported(false) },
    )
    return () => { live = false }
  }, [])

  return supported
}
