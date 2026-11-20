"use client"

import { useCallback, useRef, useState, useSyncExternalStore } from "react"

/** Getting at a camera, and saying what went wrong when you cannot.
 *
 *  THE SHAPE IS useXrSupport'S, WITH ONE DELIBERATE DIVERGENCE.
 *
 *  `EnterVrButton` renders nothing at all when WebXR is unavailable, and its
 *  reasoning is sound for VR: most visitors are on a laptop with no headset,
 *  and for them VR is not broken, it simply does not apply. A dead control is
 *  worse than no control.
 *
 *  That reasoning inverts here. On /detection the camera IS the feature, and
 *  `navigator.mediaDevices` being undefined is almost never missing hardware
 *  -- it is an INSECURE ORIGIN. Any plain-http:// page gets `undefined`, and
 *  this project is served over LAN http during development
 *  (`allowedDevOrigins` in next.config.ts names 192.168.0.17), so a phone on
 *  the dev server hits exactly that. Silently rendering nothing there is
 *  indistinguishable from a bug, and it is the single most likely way someone
 *  concludes this page is broken when it is fine.
 *
 *  So this reports WHY, and the caller shows it.
 *
 *  useSyncExternalStore rather than useState-in-an-effect, following
 *  helpers/usePortraitFrame.ts: the older shape in useCoarsePointer.ts is one
 *  of the `react-hooks/set-state-in-effect` errors in the tolerated lint
 *  baseline, and new code should not add to a count the project is trying to
 *  bring down.
 */

export type CameraAvailability =
  | { kind: "ready" }
  /** The API exists nowhere on this page, and the origin explains it. */
  | { kind: "insecure" }
  /** Secure origin, but no getUserMedia at all. A very old browser. */
  | { kind: "unsupported" }

/** Static for the life of the page: neither the origin nor the presence of
 *  `mediaDevices` can change without a navigation. Subscribing to nothing is
 *  correct, and is what lets this be useSyncExternalStore without a store. */
const subscribeNever = () => () => {}

/** THESE CONSTANTS ARE THE WHOLE POINT. Do not inline them back into `read`.
 *
 *  `useSyncExternalStore` compares what getSnapshot returns with `Object.is`
 *  to decide whether the store changed. A fresh object literal is never `is`
 *  the previous one, so returning `{ kind: "ready" }` from the reader makes
 *  React believe the store changes on every single read -- it re-renders, it
 *  reads again, it sees another new object, and it never stops.
 *
 *  Measured: it threw "Maximum update depth exceeded", preceded by React's own
 *  warning, "The result of getSnapshot should be cached to avoid an infinite
 *  loop", which is the clearest possible statement of this bug. The error
 *  surfaced as the whole live mode failing to mount.
 *
 *  helpers/usePortraitFrame.ts never hits this because it returns a boolean,
 *  and a boolean is always `is` itself. Anything returning an object has to
 *  hand back the SAME object. */
const READY: CameraAvailability = { kind: "ready" }
const INSECURE: CameraAvailability = { kind: "insecure" }
const UNSUPPORTED: CameraAvailability = { kind: "unsupported" }

function read(): CameraAvailability {
  // `isSecureContext` is the actual gate the browser applies, rather than
  // sniffing the protocol: it is true for https, for localhost AND for
  // 127.0.0.1, which is what makes `adb reverse` work for a tethered phone.
  if (typeof navigator === "undefined") return UNSUPPORTED
  if (!navigator.mediaDevices?.getUserMedia) {
    return window.isSecureContext ? UNSUPPORTED : INSECURE
  }
  return READY
}

/** The server has no navigator. READY rather than a failure, so the first
 *  paint shows the control rather than an error that then vanishes. */
const readServer = (): CameraAvailability => READY

export function useCameraAvailability(): CameraAvailability {
  return useSyncExternalStore(subscribeNever, read, readServer)
}

/** DOMException `name`, turned into something worth reading.
 *
 *  The NAME, never the message: DOMException puts the machine-readable part in
 *  `name` and leaves `message` to the browser, which phrases and translates it
 *  however it likes. helpers/useEnterXr.ts makes the same point for
 *  `requestSession` and is the pattern this follows. */
export function cameraProblem(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ""
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera was declined. Allow it in the address bar and try again."
    case "AbortError":
      return "Camera start was interrupted."
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera found on this device."
    case "NotReadableError":
      return "The camera is in use by another app."
    default:
      return "The camera couldn't start."
  }
}

export interface CameraStream {
  stream: MediaStream
  /** What the camera actually gave us, which is rarely what was asked for. */
  width: number
  height: number
  label: string
}

/** Open a camera.
 *
 *  MUST BE CALLED SYNCHRONOUSLY INSIDE A CLICK. `getUserMedia` consumes the
 *  transient user activation, and a call made after an `await` has lost it and
 *  is refused -- the identical constraint useEnterXr.ts documents for
 *  `requestSession`. Do not wrap this in anything that defers.
 *
 *  `facingMode: "environment"` is a REQUEST, not a requirement: as `ideal` a
 *  laptop with only a front camera still opens rather than rejecting with
 *  OverconstrainedError, while a phone picks the rear lens -- which is the one
 *  anybody will point at a room.
 */
export function useCamera() {
  const [problem, setProblem] = useState<string | null>(null)
  const [active, setActive] = useState<CameraStream | null>(null)
  const [busy, setBusy] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    // Every track, not just the first: a stream can carry more than one, and a
    // track left live keeps the camera indicator on, which is alarming.
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setActive(null)
  }, [])

  const start = useCallback(
    (requested: { width: number; height: number }) => {
      setProblem(null)
      setBusy(true)
      // Not awaited before the call: see the note above.
      const pending = navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: requested.width },
          height: { ideal: requested.height },
        },
        audio: false,
      })
      return pending.then(
        (stream) => {
          streamRef.current = stream
          const track = stream.getVideoTracks()[0]
          const settings = track?.getSettings() ?? {}
          const opened: CameraStream = {
            stream,
            width: settings.width ?? requested.width,
            height: settings.height ?? requested.height,
            label: track?.label ?? "camera",
          }
          setActive(opened)
          setBusy(false)
          return opened
        },
        (error: unknown) => {
          setProblem(cameraProblem(error))
          setBusy(false)
          return null
        },
      )
    },
    [],
  )

  return { start, stop, active, problem, busy, setProblem }
}
