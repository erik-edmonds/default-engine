"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useStore, useThree } from "@react-three/fiber"
import { useAtomValue, useSetAtom } from "jotai"

import { XR_NEAR } from "@/config/xr"
import { disarmXr, xrActive, xrGate, xrPhase, xrRenderer } from "@/helpers/xr"

/** Everything `useEnterXr` needs in order to work on this route.
 *
 *  WITHOUT THIS, EVERY SESSION REQUEST FAILS -- and the symptom points at the
 *  wrong place entirely. `whenXrReady()` polls
 *  `xrGate.prepared && xrGate.priority() === 0`, and `xrGate.priority` is
 *  initialised to `() => -1` and assigned in exactly one place: the island's
 *  `XrTransition`. `xrRenderer.current` likewise comes only from
 *  `IslandExperience`'s `onCreated`.
 *
 *  So on `/scan/[id]` as it stood: `xrRenderer.current` is null, so
 *  `useEnterXr` returns before even asking for a session; and had it got
 *  past that, `priority()` would return -1 forever, `whenXrReady` would time
 *  out after two seconds, and the session would be ended with "VR couldn't
 *  start." The headset flashes and dumps you back out, and the gate's own
 *  correctness is the cause.
 *
 *  WHAT THIS DELIBERATELY DOES NOT DO, so nobody re-adds it: none of the
 *  island's stand-down. That apparatus exists because the island's Canvas
 *  carries an EffectComposer at frame priority 1 plus three other
 *  prioritised subscribers, and fiber refuses to auto-render while any
 *  exist. This Canvas has **none** -- `PointCloud`'s `useFrame` takes no
 *  priority argument -- so the render gate is already open. There is no
 *  composer to disable, no tone curve to restore, no camera tweens to abort
 *  and no PerformanceMonitor to unmount.
 *
 *  It is ~30 lines against XrTransition's 172, and that difference is the
 *  point.
 */
export function ScanXrSetup() {
  const store = useStore()
  const gl = useThree((s) => s.gl)
  const setPhase = useSetAtom(xrPhase)
  const phase = useAtomValue(xrPhase)
  const saved = useRef<{ near: number; far: number; fov: number } | null>(null)

  useEffect(() => {
    // Publish the renderer, so the DOM button can hand three a session
    // synchronously inside its click and keep the user activation.
    xrRenderer.current = gl

    // Publish fiber's render-gate counter. It is already 0 here, but
    // `whenXrReady` asks rather than assumes -- and asking is what makes the
    // same helper correct on both routes.
    xrGate.priority = () => store.getState().internal.priority

    // `xrPhase` is a module-level atom shared with the island. A client-side
    // navigation from `/` can land here with it mid-transition, which would
    // make `whenXrReady` resolve against a stale gate. Reset on arrival.
    setPhase("idle")
    xrGate.prepared = false

    return () => {
      xrGate.priority = () => -1
      xrGate.prepared = false
      if (xrRenderer.current === gl) xrRenderer.current = null
    }
  }, [store, gl, setPhase])

  // --- a session can start WITHOUT this app asking for one --------------
  //
  // `useEnterXr` is not the only way in, and treating it as such is what put
  // a live session on screen with every desktop setting still in force: the
  // rig at identity, the budget at the monitor's 1,500,000, OrbitControls
  // still mounted and writing camera.position ahead of the LOD each frame,
  // and the near plane at 1 metre. The viewer presented, correctly, into a
  // scene arranged for a monitor -- which from inside a headset is black.
  //
  // At least three routes bypass the button:
  //   - `offerSession: "immersive-vr"` on the store, which is ON BY OUR OWN
  //     CHOICE. It hands the runtime a standing offer, so the system's own
  //     "enter VR" affordance starts a session this app never requested.
  //   - A granted session the browser resumes after a reload.
  //   - The bundled iwer emulator's own goggles button.
  //
  // `gl.xr`'s own events are the authoritative signal -- three fires them
  // whenever a session is attached or detached, whoever asked for it -- so
  // the phase follows the session rather than the click.
  useEffect(() => {
    const onStart = () => {
      const { camera } = store.getState()
      // Only if `arming` never ran. On the button path it already has, and
      // re-saving here would capture the XR near plane as the desktop one.
      if (saved.current == null && camera instanceof THREE.PerspectiveCamera) {
        saved.current = { near: camera.near, far: camera.far, fov: camera.fov }
        camera.near = XR_NEAR
        camera.updateProjectionMatrix()
      }
      // Set in the same block as the phase, never from a later effect: the
      // frame loop reads the ref, and one frame of disagreement is one frame
      // of desktop settings in a headset. Same invariant as `armXr`.
      xrActive.current = true
      setPhase("presenting")
    }
    const onEnd = () => setPhase(disarmXr())
    gl.xr.addEventListener("sessionstart", onStart)
    gl.xr.addEventListener("sessionend", onEnd)
    return () => {
      gl.xr.removeEventListener("sessionstart", onStart)
      gl.xr.removeEventListener("sessionend", onEnd)
    }
  }, [gl, store, setPhase])

  // --- arming, and the one line that releases the session ---------------
  useEffect(() => {
    if (phase !== "arming") return
    const { camera } = store.getState()
    if (camera instanceof THREE.PerspectiveCamera) {
      saved.current = { near: camera.near, far: camera.far, fov: camera.fov }
      // 0.5 is a desktop composition number; worn, it is half a metre in
      // front of the eyes and clips your own hands and anything you lean
      // toward. three copies this verbatim into both eye cameras and then
      // into session.updateRenderState({depthNear}), so this is the only
      // place it can be set.
      camera.near = XR_NEAR
      camera.updateProjectionMatrix()
    }
    // LAST. This is what `whenXrReady` is waiting on, so everything above
    // must already have happened. Being a passive effect it also runs after
    // the layout effects of the same commit, which is where fiber would
    // re-subscribe frame callbacks if there were any to re-subscribe.
    xrGate.prepared = true
  }, [phase, store])

  // --- and putting the desktop camera back ------------------------------
  useEffect(() => {
    if (phase !== "settling") return
    const { camera } = store.getState()
    const was = saved.current
    if (was && camera instanceof THREE.PerspectiveCamera) {
      camera.near = was.near
      camera.far = was.far
      // FOV TOO, AND THIS ONE IS EASY TO MISS. three writes the XR union
      // fov (~100 degrees) onto the app camera every session frame, and
      // nothing re-renders drei's <PerspectiveCamera fov={55}> afterwards --
      // so without this the desktop view stays at the headset's lens.
      camera.fov = was.fov
      camera.updateProjectionMatrix()
    }
    saved.current = null
    xrGate.prepared = false
    setPhase("idle")
  }, [phase, store, setPhase])

  return null
}
