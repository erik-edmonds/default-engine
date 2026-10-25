"use client"

import type * as THREE from "three"
import { atom } from "jotai"

import type { JourneyStopId } from "@/config/journey"

/** Whether the island is standing itself down for a headset, and how far
 *  through it is.
 *
 *  THE ISLAND DOES NOT GET A SECOND SCENE. Entering VR is a transition
 *  applied to the scene already running: everything incompatible with a
 *  headset is stood down, the VR pieces come up, and leaving reverses it. So
 *  there is no `/vr` route, no second <Canvas>, no duplicated island -- and
 *  nothing to keep in step with the desktop one as it changes.
 *
 *  The four phases exist because the two halves of that transition cannot
 *  happen on the same frame as the session request:
 *
 *    idle        desktop. Every gate below is false and the render path is
 *                exactly what it was before any of this existed.
 *    arming      the stand-down has been committed but the session has not
 *                started. The composer is off, the frame-loop subscribers
 *                have dropped to priority 0, the camera writers have stood
 *                down. The island still draws, through fiber's own
 *                auto-render.
 *    presenting  a session is live and three owns the camera.
 *    settling    the session has ended and the desktop state is being put
 *                back. Separate from `idle` because PerformanceMonitor must
 *                not take its first sample during the restoration spike --
 *                see IslandExperience.
 *
 *  `arming` is reachable on a desktop with no headset at all, deliberately:
 *  it is the entire black-screen risk, and it is cheaper to assert on a
 *  laptop than to debug inside a headset. */
export type XrPhase = "idle" | "arming" | "presenting" | "settling"

export const xrPhase = atom<XrPhase>("idle")

/** The one thing most readers actually want: is the desktop stood down?
 *
 *  Derived rather than stored, so it cannot disagree with the phase. Note
 *  `settling` is armed=false: the restoration runs with the desktop frame
 *  loop already back under its own control, which is the point of having a
 *  fourth phase at all. */
export const xrArmed = atom((get) => {
  const phase = get(xrPhase)
  return phase === "arming" || phase === "presenting"
})

/** Which island location you are standing at.
 *
 *  The only new piece of navigation state in the whole feature. The portals
 *  do not open in VR -- there is nothing to open, because a
 *  MeshPortalMaterial cannot render inside a session (three redirects every
 *  renderer.render to the XR array camera, so drei would write a scissored
 *  fragment of one eye into its 512 square target). What survives is the
 *  island's LOCATIONS, as the places you teleport between, which is what
 *  STOP_VIEWPOINTS already describes for the scroll journey.
 *
 *  So: no wouter, no openPortalId, no second source of truth about where you
 *  are. One atom, and it names a stop. */
export const xrStop = atom<JourneyStopId>("home")

/** The same answer as `xrPhase !== 'idle'`, where the frame loop can read it.
 *
 *  Module-level rather than an atom for the same reason as cameraShakeActive
 *  and pointerState: this is read every frame by code that must not re-render
 *  for it, and in several places that are not components at all.
 *
 *  THE INVARIANT, AND IT IS THE LOAD-BEARING LINE OF THIS FILE:
 *
 *      xrActive.current is set in the SAME SYNCHRONOUS BLOCK as
 *      setXrPhase('arming'), never from an effect.
 *
 *  An effect runs after the commit, so a React-driven update would leave one
 *  frame in which the composer has been switched off but every frame-loop
 *  writer still believes it is on desktop. That frame is the one the headset
 *  shows first, and a black first frame in a headset is the failure this
 *  whole design is arranged to avoid. `armXr`/`disarmXr` below exist so the
 *  pairing cannot be got wrong by hand. */
export const xrActive = { current: false }

/** The renderer, where a DOM button can reach it.
 *
 *  Published from the Canvas's onCreated. It exists for exactly one reason:
 *  `navigator.xr.requestSession` must be called with TRANSIENT USER
 *  ACTIVATION, which means synchronously inside the click handler. The button
 *  is DOM chrome outside the <Canvas>, so it cannot call useThree, and
 *  routing the request through an atom and an effect would put it in a later
 *  task with the activation already spent -- the session request is simply
 *  refused, with a console message and no other symptom.
 *
 *  Same shape and the same justification as cameraBase: one owner, read from
 *  somewhere React cannot reach. */
export const xrRenderer: { current: { xr: THREE.WebGLRenderer["xr"] } | null } = { current: null }

/** The handshake between the DOM button and the scene inside the <Canvas>.
 *
 *  WHY THIS EXISTS, because it looks like over-engineering and is not.
 *
 *  The obvious shape -- flushSync the arming state, then request the session
 *  in the same click -- DOES NOT WORK, and a probe caught it: at the instant
 *  requestSession was called, fiber's render-gate counter was still 4, the
 *  reference space was still unset and the camera's near plane was still the
 *  island's 0.5. The reason is structural. Everything that has to change
 *  lives INSIDE the <Canvas>, which is a separate React reconciler root with
 *  its own scheduler. flushSync on the DOM root cannot flush it. No amount of
 *  arranging the click handler can.
 *
 *  So the click no longer pretends to be synchronous. It arms, asks for the
 *  session, and then WAITS for the scene to report that it really is ready
 *  before handing three the session -- which is the moment that matters,
 *  because `gl.xr.setSession` is what starts the XR frame loop, and fiber's
 *  draw call is gated on `!state.internal.priority` in the same render
 *  function the XR loop uses.
 *
 *  `prepared` is set at the END of XrTransition's arming effect. That is a
 *  passive effect, so it runs after the layout effects of the same commit --
 *  and fiber subscribes frame callbacks from a layout effect. So `prepared`
 *  being true implies the priorities have already been re-subscribed; the
 *  counter is checked anyway, because implying is not the same as knowing. */
export const xrGate = {
  /** True once XrTransition's arming effect has run to completion. */
  prepared: false,
  /** fiber's render-gate counter, published from inside the Canvas.
   *  -1 means "nobody has published it yet". */
  priority: () => -1,
}

/** Resolve once the scene is genuinely ready to be handed to a headset.
 *
 *  Polls on animation frames rather than a timer: the thing being waited for
 *  is a React commit, and commits land on frames.
 *
 *  Resolves false on timeout rather than hanging or throwing. The caller ends
 *  the session instead of presenting -- a headset that never opens with a
 *  line of explanation is a better outcome than one that opens black, which
 *  is the failure this whole file is arranged to prevent. */
export function whenXrReady(timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeoutMs
    const poll = () => {
      if (xrGate.prepared && xrGate.priority() === 0) return resolve(true)
      if (performance.now() > deadline) return resolve(false)
      requestAnimationFrame(poll)
    }
    poll()
  })
}

/** Set the ref and hand back the phase to commit, so the two cannot drift.
 *  Call as `setXrPhase(armXr())` inside the click handler -- the ref is
 *  already true by the time React is told. */
export function armXr(): XrPhase {
  xrActive.current = true
  return "arming"
}

/** The other half. `settling` rather than `idle`: the desktop restoration is
 *  a distinct phase and the frame loop must already be back under its own
 *  control while it runs. */
export function disarmXr(): XrPhase {
  xrActive.current = false
  return "settling"
}

/** Frame-loop priority for everything that stands down in a session.
 *
 *  NOT AN UNMOUNT, AND THAT IS THE WHOLE TRICK. r3f auto-renders the scene
 *  only while its subscriber count at priority > 0 is zero -- `internal.
 *  priority` is a COUNTER, not a maximum:
 *
 *      internal.priority = internal.priority + (priority > 0 ? 1 : 0)
 *
 *  (fiber's store, in `subscribe`). Four prioritised subscribers means four,
 *  and the scene is drawn by whichever of them calls gl.render -- here, the
 *  EffectComposer at priority 1. Switch the composer off and leave the other
 *  three subscribed and the counter is still 3: nothing renders at all, and
 *  the headset shows black.
 *
 *  Unmounting the four would get the counter to zero too, but it would also
 *  rebuild the composer's pass chain on the way back (which this project has
 *  been burned by once), restore toneMapping to ACES behind our back, and
 *  leak a target per cycle. Changing the priority VALUE is enough, because
 *  fiber subscribes from a layout effect keyed on it:
 *
 *      useIsomorphicLayoutEffect(() => subscribe(ref, renderPriority, store),
 *                                [renderPriority, subscribe, store])
 *
 *  so a changed value runs the cleanup (which decrements) and re-subscribes
 *  at the new one. The counter falls to 0 with zero unmounts, and rises again
 *  on exit with the same component instances still holding their state.
 *
 *  TAKES THE ARMED FLAG AS AN ARGUMENT, NOT xrActive. That effect is keyed on
 *  the value this returns, so it has to be a RENDER value -- read from the
 *  xrArmed atom, which re-renders the component. Reading the module ref here
 *  would return the right number and change nothing, because no render would
 *  ever observe it.
 *
 *  Use as:  const armed = useAtomValue(xrArmed)
 *           useFrame(fn, xrPriority(armed, 0.5)) */
export function xrPriority(armed: boolean, desktop: number): number {
  return armed ? 0 : desktop
}
