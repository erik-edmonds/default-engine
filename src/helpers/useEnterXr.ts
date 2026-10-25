"use client"

import { useCallback, useState } from "react"
import { flushSync } from "react-dom"
import { useSetAtom } from "jotai"

import { armXr, disarmXr, whenXrReady, xrPhase, xrRenderer } from "@/helpers/xr"

/** Enter an immersive session, in the one order that works.
 *
 *  EXTRACTED FROM XrButton, WHICH IS GONE. The corner button was removed --
 *  the 3D headset in the Models portal is the way in now -- but every line of
 *  this was measured and is load-bearing, so it moved rather than died. It
 *  has no caller yet; Phase 1's viewer is the caller.
 *
 *  The ordering, which is the whole value here:
 *
 *  1. Arm synchronously. `armXr()` sets the module ref before React is told,
 *     so the frame loop never reads a stale value.
 *  2. `flushSync` the DOM tree -- but understand what it CANNOT do. The
 *     <Canvas> is a separate reconciler root with its own scheduler, so
 *     flushSync does not touch it. Measured at the instant of the request:
 *     fiber's render gate still at 4, reference space unset, near plane still
 *     the desktop's. Hence step 4.
 *  3. Request the session inside the click, so the user activation survives.
 *     Features are OPTIONAL: a required feature the runtime cannot provide
 *     rejects the whole request.
 *  4. WAIT for the scene to actually stand down before handing three the
 *     session. `gl.xr.setSession` starts the XR frame loop, and fiber draws
 *     only when its prioritised-subscriber count is zero -- the same
 *     `if (!state.internal.priority)` the XR loop goes through. Hand it over
 *     at 4 and the headset opens on black.
 */
export function useEnterXr() {
  const setPhase = useSetAtom(xrPhase)
  const [problem, setProblem] = useState<string | null>(null)

  const enter = useCallback(() => {
    const gl = xrRenderer.current
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr
    if (!gl || !xr) return

    flushSync(() => setPhase(armXr()))
    setProblem(null)

    xr.requestSession("immersive-vr", {
      // 'layers' matters more than it looks. three takes the
      // XRProjectionLayer path on feature DETECTION alone --
      // `'createProjectionLayer' in XRWebGLBinding.prototype` -- without
      // checking `session.enabledFeatures`. On a Quest that is true, so it
      // will call createProjectionLayer whether or not the feature was
      // requested, and per the Layers spec that is gated. three's own
      // VRButton requests it. One word; without it, if the gate is
      // enforced, setSession throws and the headset opens black.
      optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "layers"],
    }).then(
      async (session) => {
        const ready = await whenXrReady()
        if (!ready) {
          // Presenting now means a black headset, which is worse than not
          // presenting at all.
          await session.end().catch(() => {})
          setPhase(disarmXr())
          setProblem("VR couldn't start.")
          window.setTimeout(() => setProblem(null), 4000)
          return
        }
        // fiber does the rest: it subscribes to the renderer's sessionstart
        // and moves the frame loop onto gl.xr.setAnimationLoop itself. No
        // @react-three/xr needed for this part.
        await gl.xr.setSession(session)
        setPhase("presenting")
        session.addEventListener("end", () => setPhase(disarmXr()), { once: true })
      },
      (error: unknown) => {
        setPhase(disarmXr())
        // The NAME, not the message: DOMException puts the machine-readable
        // part in `name` and leaves `message` to the browser, which phrases
        // and translates it however it likes.
        const name = error instanceof DOMException ? error.name : ""
        const declined = name === "NotAllowedError" || name === "AbortError"
        setProblem(declined ? "VR was declined." : "VR couldn't start.")
        window.setTimeout(() => setProblem(null), 4000)
      },
    )
  }, [setPhase])

  return { enter, problem }
}
