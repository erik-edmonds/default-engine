"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useStore } from "@react-three/fiber"
import { useAtomValue, useSetAtom } from "jotai"

import { abortFlights } from "@/components/canvas/CameraController"
import { cameraBase, setCameraBase } from "@/helpers/cameraBase"
import { XR_NEAR, XR_SETTLE_MS } from "@/config/xr"
import { xrGate, xrPhase } from "@/helpers/xr"

/** The stand-down and the restoration, as one ordered pair.
 *
 *  Renders nothing. It exists so that the whole transition is ONE list in ONE
 *  file, in order, with its reversal immediately underneath -- rather than a
 *  dozen `armed &&` conditions spread across the scene, where a missing one
 *  is invisible until a headset shows black.
 *
 *  WHAT IS NOT HERE, and deliberately: everything expressible as a prop. The
 *  composer's `enabled`, the frame priorities, the DOM chrome and the
 *  exhibits-for-portals swap are all declarative gates at their own call
 *  sites, because a prop cannot be forgotten on the way back the way an
 *  imperative restore can. This file holds only what must be *written* to a
 *  mutable object: the renderer, the camera, and the global input latches.
 *
 *  Ordering within the effect is load-bearing and is called out line by line.
 */
export function XrTransition() {
  const phase = useAtomValue(xrPhase)
  const setPhase = useSetAtom(xrPhase)
  // THE STORE, NOT useThree(). Two reasons, and the second is the real one.
  //
  //  - react-hooks/immutability rejects mutating a value a hook returned, and
  //    the whole job of this component is mutating the camera and the
  //    renderer. The same rule is why the 404 page's camera is declarative.
  //  - More to the point, an effect that fires on a phase change wants the
  //    camera as it is AT THAT MOMENT, not the one captured when this
  //    component last rendered. Reading through the store makes that
  //    explicit instead of relying on the two being the same object.
  const store = useStore()
  /** Everything taken away on the way in, to be given back on the way out.
   *  Captured rather than recomputed: the desktop pose is wherever the
   *  visitor had got to, and there is no expression that reproduces it. */
  const saved = useRef<{
    position: THREE.Vector3
    base: THREE.Quaternion
    near: number
    toneMapping: THREE.ToneMapping
  } | null>(null)

  // Publish fiber's render-gate counter so XrButton -- which is DOM, outside
  // this Canvas and this reconciler -- can wait for it before handing three
  // the session. See whenXrReady.
  useEffect(() => {
    xrGate.priority = () => store.getState().internal.priority
    return () => { xrGate.priority = () => -1 }
  }, [store])

  useEffect(() => {
    if (phase !== "arming") return
    const { camera, gl } = store.getState()

    // 1. STOP ANYTHING THAT IS STILL WRITING THE CAMERA, FIRST.
    //    A flight is a gsap tween on camera.position with up to five seconds
    //    left to run. Hand the camera to a headset mid-flight and gsap and
    //    three's pose both write it every frame, gsap on its own ticker --
    //    on a head-tracked display that is not a glitch, it is the room
    //    sliding around someone's head. Killed, not awaited.
    abortFlights()
    //    Scene input needs nothing done to it: isSceneInputSuppressed()
    //    reads xrActive directly, so it is already false-to-true by the time
    //    this effect runs and there is nothing to restore afterwards. See
    //    the note on it in helpers/cursor.ts.

    // 2. SAVE, AND SAVE cameraBase RATHER THAN camera.quaternion.
    //    camera.quaternion carries CameraLook's live cursor offset -- up to
    //    4 degrees of yaw and 3 of pitch that are not part of the aim. Saving
    //    it would restore the desktop framing permanently tilted by whatever
    //    the cursor happened to be doing at the moment VR was entered.
    saved.current = {
      position: camera.position.clone(),
      base: cameraBase.clone(),
      near: (camera as THREE.PerspectiveCamera).near,
      toneMapping: gl.toneMapping,
    }

    // 3. THE NEAR PLANE. The island's 0.5 is a composition decision for a
    //    camera that never gets close to anything. In a headset it is 50cm
    //    in front of the wearer's eyes: their own hands, the controllers,
    //    and anything they lean toward all vanish. three copies the camera's
    //    near verbatim into both eye cameras, so this is the only place it
    //    can be set.
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = XR_NEAR
      camera.updateProjectionMatrix()
    }

    // 4. PUT THE TONE CURVE BACK ON THE RENDERER -- THE MODE ONLY.
    //    <EffectComposer> sets gl.toneMapping = NoToneMapping in a mount
    //    effect and restores it only on UNMOUNT -- and it stays mounted here,
    //    merely disabled, which is the whole point of the design. So with the
    //    composer off and nothing done about this, the scene renders with no
    //    curve at all: every value above 1 clips flat to white. AgX is the
    //    same curve the <ToneMapping> pass applies, so the headset sees the
    //    island graded as the screen does.
    //
    //    EXPOSURE IS DELIBERATELY NOT TOUCHED. Environment.tsx writes
    //    gl.toneMappingExposure every frame from the time-of-day presets,
    //    and it keeps doing so in a session -- its useFrame is at priority 0
    //    and nothing about it changed. Setting a constant here does nothing
    //    (it is overwritten on the next frame; measured at 1.063 against a
    //    1.15 that had supposedly just been written) and would be wrong if
    //    it worked, because it would flatten dusk and noon to one stop.
    gl.toneMapping = THREE.AgXToneMapping

    // 5. local-floor BEFORE the session is requested.
    //    three reads the reference-space type inside setSession, not at
    //    render time, so setting it afterwards is setting it too late and
    //    the runtime falls back to `local` -- where the origin is wherever
    //    the headset happened to be, and the floor is wrong by the wearer's
    //    height. Harmless on a desktop with no XR at all.
    gl.xr.setReferenceSpaceType("local-floor")

    // 6. AND ONLY NOW SAY SO. Last line of the effect, deliberately: this is
    //    what releases XrButton to call setSession, so everything above must
    //    already have happened. Being a passive effect, this also runs after
    //    the layout effects of the same commit -- which is where fiber
    //    re-subscribes the frame callbacks at their new priorities.
    xrGate.prepared = true
  }, [phase, store])

  useEffect(() => {
    if (phase !== "settling") return
    const { camera, gl } = store.getState()
    const was = saved.current
    if (was) {
      // In reverse. The camera first, because three leaves it holding the
      // last headset pose and every restore below is measured against the
      // desktop one.
      camera.position.copy(was.position)
      // setCameraBase, NOT initCameraBase: the latter is latched after its
      // first call and would silently do nothing here, leaving the island
      // aimed wherever the wearer was last looking. Nothing else reseeds it.
      setCameraBase(was.base)
      camera.quaternion.copy(was.base)
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.near = was.near
        camera.updateProjectionMatrix()
      }
      // Back to NoToneMapping, which is what the still-mounted composer
      // believes it has set. Restoring the SAVED value rather than naming
      // NoToneMapping here, so this stays correct if the composer is ever
      // removed. Exposure is not restored because it was never taken --
      // Environment owns it throughout.
      gl.toneMapping = was.toneMapping
    }
    saved.current = null
    xrGate.prepared = false
    // HELD IN `settling` FOR A MOMENT, not dropped straight to idle.
    // PerformanceMonitor is remounted on `idle`, and the frame that ends a
    // session is the most expensive one the page ever renders -- the canvas
    // resizes back, the composer's buffers are rebuilt and the whole island
    // is drawn again. That spike says nothing about the machine, and letting
    // the monitor take it as a first sample would ratchet dprCeiling down for
    // the rest of the session.
    const timer = setTimeout(() => setPhase("idle"), XR_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [phase, store, setPhase])

  return null
}
