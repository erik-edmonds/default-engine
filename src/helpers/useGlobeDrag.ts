"use client"

import { useEffect, useMemo, useRef } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

import { CURRENT_PLACE, GLOBE_LON_OFFSET, PLACES } from "@/config/places"
import { LONG_PRESS_SLOP_PX } from "@/helpers/hints"

/** Spin rate when nobody is touching it, radians per second.
 *
 *  Doubled from 0.12. A revolution now takes 26 seconds rather than 52, so a
 *  pin that has gone round the back comes back in half the time -- which was
 *  half of why the globe read as having no pins at all. */
const IDLE_SPIN = 0.24

/** How much of a turn a drag across the full width of the window is worth.
 *  Just over half a revolution, so you can bring any country round without
 *  letting go, and the globe does not spin wildly under a small flick. */
const DRAG_TURNS_PER_WIDTH = 0.6

/** How fast a throw decays, and how long after letting go before the idle
 *  spin creeps back. The pause matters: resuming instantly fights the reader
 *  who has just placed a country where they want it. */
const FLICK_DAMPING = 2.4
const RESUME_AFTER = 1.6

/** Where the globe has to start so a given longitude faces the lens.
 *
 *  Derived, not dialled in. A pin is placed at theta = lon + GLOBE_LON_OFFSET
 *  by latLonToVector, which puts it at z = r sin(phi) sin(theta); rotating the
 *  group about Y by `ry` simply adds ry to theta. The camera looks down -z, so
 *  the point nearest the lens is the one with the largest z, i.e. where
 *  sin(theta + ry) = 1. Hence ry = pi/2 - theta. */
function headingFor(country: string) {
  const place = PLACES[country]
  if (!place) return 0
  return Math.PI / 2 - THREE.MathUtils.degToRad(place.lon + GLOBE_LON_OFFSET)
}

/** Lets the visitor turn the globe, and spins it on its own when they are not.
 *
 *  RAW CANVAS LISTENERS, NOT r3f POINTER EVENTS. The globe is inside a
 *  MeshPortalMaterial, which renders its children into a scene of their own;
 *  r3f's raycaster tests the portal's flat mesh, not the contents behind it,
 *  so nothing in there can be picked. The water inside the Models portal has
 *  the same problem and solves it the same way -- see
 *  components/canvas/water/useWaterInteraction.ts, which binds pointerdown /
 *  move / up straight onto the canvas with pointer capture.
 *
 *  Returns an `advance(delta)` to be called from the owner's frame loop, which
 *  keeps the single writer of `rotation.y` in one place.
 */
export function useGlobeDrag(active: boolean) {
  const gl = useThree((state) => state.gl)

  const state = useRef({
    /** Current heading. Starts with the place you are in facing the camera. */
    angle: headingFor(CURRENT_PLACE),
    velocity: 0,
    dragging: false,
    pointerId: -1,
    lastX: 0,
    /** Where the press began, so a tap can be told from a drag. */
    startX: 0,
    startY: 0,
    /** Seconds since the last release, gating the idle spin's return. */
    idleFor: RESUME_AFTER,
  })

  useEffect(() => {
    if (!active) return
    const canvas = gl.domElement
    const s = state.current

    // FACE THE CURRENT COUNTRY ON OPENING, not on mounting.
    //
    // The heading is seeded with headingFor(CURRENT_PLACE) so you arrive
    // looking at where Erik is -- but the portal's room wakes as soon as the
    // camera is anywhere near it, which can be a minute before anyone steps
    // through, and the idle spin has been turning the whole time. Measured:
    // by the time a visitor actually entered, the globe was 5.5 radians past
    // its start and both pins were round the back, so the complaint that
    // began all this -- "there aren't any pins" -- came straight back.
    //
    // Re-seating it here means opening the gallery always shows the pin that
    // matters, however long you loitered outside.
    s.angle = headingFor(CURRENT_PLACE)
    s.velocity = 0
    s.idleFor = 0

    /** Let go, however the drag ended. */
    const release = (pointerId: number) => {
      s.dragging = false
      s.pointerId = -1
      if (pointerId >= 0 && canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId)
      }
    }

    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === "mouse") return
      s.dragging = true
      s.pointerId = event.pointerId
      s.lastX = event.clientX
      s.startX = event.clientX
      s.startY = event.clientY
      s.velocity = 0
      s.idleFor = 0
    }

    const move = (event: PointerEvent) => {
      if (!s.dragging || event.pointerId !== s.pointerId) return
      // A MOVE WITH NO BUTTON DOWN MEANS THE RELEASE WAS MISSED.
      //
      // This is the classic stuck-drag guard and it is here because the
      // drag did stick: measured, the globe froze after one drag and only
      // moved again when the pointer did, so a probe that dragged once then
      // watched for 35 seconds saw the planet stand still and no pin ever
      // come round. A pointerup can go astray -- swallowed by capture, lost
      // to a window blur, or simply never delivered -- and every frame
      // after that is a drag that nobody is performing.
      if (event.buttons === 0) {
        release(event.pointerId)
        return
      }
      const travelled = Math.hypot(event.clientX - s.startX, event.clientY - s.startY)
      // A PRESS IS NOT A DRAG UNTIL IT MOVES.
      //
      // The pins are DOM buttons over this same canvas, and a pin has to stay
      // clickable. LONG_PRESS_SLOP_PX is the project's existing answer to the
      // same question -- Card.tsx uses it to tell a press-and-hold from a
      // swipe -- so the two agree rather than each picking a number.
      if (travelled < LONG_PRESS_SLOP_PX) return
      // Capture only once the gesture is definitely a drag, so a tap that
      // began on a pin is never stolen from it.
      if (!canvas.hasPointerCapture(event.pointerId)) {
        try { canvas.setPointerCapture(event.pointerId) } catch { /* pointer already gone */ }
      }
      const dx = event.clientX - s.lastX
      s.lastX = event.clientX
      const turn = (dx / Math.max(1, canvas.clientWidth)) * DRAG_TURNS_PER_WIDTH * Math.PI * 2
      s.angle += turn
      // Remembered so letting go mid-sweep keeps some of the throw.
      s.velocity = turn / Math.max(1 / 120, 1 / 60)
      s.idleFor = 0
    }

    const end = (event: PointerEvent) => {
      if (event.pointerId !== s.pointerId) return
      release(event.pointerId)
    }
    // Every way a drag can end, in one place. `lostpointercapture` is in
    // here because useWaterInteraction listens for it too -- the only other
    // thing in this project driving a portal's contents from raw canvas
    // events, which suggests it was bitten by the same thing.
    const blur = () => release(s.pointerId)

    canvas.addEventListener("pointerdown", down)
    canvas.addEventListener("pointermove", move)
    canvas.addEventListener("pointerup", end)
    canvas.addEventListener("pointercancel", end)
    canvas.addEventListener("lostpointercapture", end)
    window.addEventListener("pointerup", end)
    window.addEventListener("blur", blur)
    return () => {
      canvas.removeEventListener("pointerdown", down)
      canvas.removeEventListener("pointermove", move)
      canvas.removeEventListener("pointerup", end)
      canvas.removeEventListener("pointercancel", end)
      canvas.removeEventListener("lostpointercapture", end)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("blur", blur)
      s.dragging = false
    }
  }, [active, gl])

  return useMemo(
    () => ({
      advance(delta: number) {
        const s = state.current
        // THE REAL DELTA, NOT A CLAMPED ONE -- and the clamp is why this was
        // broken.
        //
        // The first version used `Math.min(delta, 1/20)`, copied from the
        // sky scroll's integrator without its reason. That integrator is a
        // SPRING, which a long step can tunnel straight through; this is an
        // exponential decay plus a constant rate, and `exp(-k*dt)` is
        // unconditionally stable at any dt. So the clamp bought nothing and
        // cost the one thing that matters: on a machine rendering two frames
        // a second it advanced the clock by 0.05s per frame, a tenth of real
        // time, so the idle spin took the better part of a minute to come
        // back after a drag. Measured: the globe's heading crawled to a halt
        // at 1.05 rad and sat there while a probe watched for 25 seconds,
        // and no pin ever came round.
        //
        // helpers/skyScroll.ts records this same trap in its own words --
        // "the physics then runs slower than the clock whenever frames are
        // slow" -- and sub-steps to avoid it. Nothing here needs sub-stepping.
        const step = delta
        if (!s.dragging) {
          s.idleFor += step
          // Bleed the throw away.
          s.angle += s.velocity * step
          s.velocity *= Math.exp(-FLICK_DAMPING * step)
          if (Math.abs(s.velocity) < 0.001) s.velocity = 0
          // The idle spin fades back in rather than switching on, so the
          // globe does not jerk the moment the pause elapses.
          const resumed = THREE.MathUtils.clamp((s.idleFor - RESUME_AFTER) / 1.2, 0, 1)
          s.angle += IDLE_SPIN * resumed * step
        }
        return s.angle
      },
    }),
    [],
  )
}
