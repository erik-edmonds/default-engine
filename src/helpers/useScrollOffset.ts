"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"

/** A clamped, damped scroll position driven by the wheel and by touch.
 *
 *  Lifted out of CameraHelpers' `Rig`, which has used exactly this to dolly the
 *  camera down the project column since that page existed. The Models portal
 *  needs the same gesture to drive something else -- the pool's own y offset --
 *  and two hand-rolled scroll idioms in one project is one too many.
 *
 *  Returns a ref rather than state on purpose: this changes every frame while a
 *  gesture is in flight, and a re-render per frame to move one group would be
 *  the most expensive cheap feature in the project. The caller damps
 *  `target.current` into whatever it is driving from its own useFrame -- same
 *  split as `Rig`'s scrollTarget/displayY.
 */
export function useScrollOffset({
  min,
  max = 0,
  speed = 0.0025,
  enabled = true,
}: {
  min: number
  max?: number
  /** World units per wheel pixel. */
  speed?: number
  enabled?: boolean
}) {
  const target = useRef(max)

  // Read through a ref so the listeners can stay registered for the life of the
  // component instead of being torn down and rebuilt every time a bound moves.
  const config = useRef({ min, max, speed, enabled })
  // In an effect rather than during render -- react-hooks/refs rejects a write
  // during render, and the listeners below only read this on a gesture, so a
  // one-commit lag cannot be observed.
  useEffect(() => { config.current = { min, max, speed, enabled } }, [min, max, speed, enabled])

  useEffect(() => {
    const apply = (deltaY: number) => {
      const c = config.current
      if (!c.enabled) return
      target.current = THREE.MathUtils.clamp(target.current - deltaY * c.speed, c.min, c.max)
    }

    const onWheel = (event: WheelEvent) => apply(event.deltaY)

    // There is no wheel event on a touchscreen, so without this the gesture is
    // simply inert there. Swiping up (finger moves up the screen) reads as
    // scrolling forward, so the synthesized delta is the PREVIOUS touch y minus
    // the current one -- matching both Rig and the sky-journey handler.
    let lastTouchY: number | null = null
    const onTouchStart = (event: TouchEvent) => { lastTouchY = event.touches[0]?.clientY ?? null }
    const onTouchMove = (event: TouchEvent) => {
      if (lastTouchY === null) return
      const y = event.touches[0]?.clientY
      if (y === undefined) return
      apply(lastTouchY - y)
      lastTouchY = y
    }
    const onTouchEnd = () => { lastTouchY = null }

    // Passive, like Rig's. The island page already runs a non-passive wheel
    // listener that preventDefaults on desktop (there is no scroll spacer, so
    // the document never actually scrolls) -- it does not stopPropagation, so
    // this still receives every event. Nothing here needs to cancel anything.
    window.addEventListener("wheel", onWheel, { passive: true })
    window.addEventListener("touchstart", onTouchStart, { passive: true })
    window.addEventListener("touchmove", onTouchMove, { passive: true })
    window.addEventListener("touchend", onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("touchstart", onTouchStart)
      window.removeEventListener("touchmove", onTouchMove)
      window.removeEventListener("touchend", onTouchEnd)
    }
  }, [])

  /** Put the offset back to the top. Called when the portal closes, so the next
   *  visit starts at the surface rather than wherever you left off. */
  const reset = () => { target.current = config.current.max }

  return { target, reset }
}
