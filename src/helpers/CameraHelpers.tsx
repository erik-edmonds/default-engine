import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import type CameraControlsImpl from 'camera-controls'
import { useRoute } from 'wouter'
import { easing } from 'maath'

// Shared with portfolio/page.tsx so each Frame's Y position and the
// camera's per-section resting spot never drift out of sync.
//
// 3.6 isn't arbitrary: at this camera's fov (75) and distance to the frame
// plane (~2 world units), the visible vertical extent there is ~3.07 units.
// A card is 1.618 tall, so anything less than ~2.34 of spacing leaves the
// neighboring card peeking into view. 3.6 clears that with a bit of margin
// so each scroll stop shows exactly one frame, screen-filling and alone.
export const FRAME_SPACING = 3.6
export const FRAME_COUNT = 4

// Continuous free-scroll: wheel input accumulates directly into world-space
// camera Y rather than snapping to the nearest section. SCROLL_SPEED is
// deliberately small ("slow down the scroll") -- it converts raw wheel
// pixels into world units.
const SCROLL_SPEED = 0.0025
const SCROLL_SMOOTH_TIME = 0.25
const SCROLL_MIN = -(FRAME_COUNT - 1) * FRAME_SPACING
const SCROLL_MAX = 0

//Move the scene camera helper here.
export function Rig({ position = new THREE.Vector3(0, 0, 2), focus = new THREE.Vector3(0, 0, 0) }) {
  const { controls: rawControls, scene } = useThree()
  const controls = rawControls as CameraControlsImpl | null
  const [, params] = useRoute('/item/:id')

  useEffect(() => {
    const active = scene.getObjectByName(params?.id)
    if (active) {
      active.parent.localToWorld(position.set(0, 0.5, 0.25))
      active.parent.localToWorld(focus.set(0, 0, -2))
      controls?.setLookAt(...position.toArray(), ...focus.toArray(), true)
    }
    // Only the "zoomed into an item" pose is driven from here — leaving the
    // base gallery view alone otherwise so the scroll rig below (which owns
    // the camera when no item is active) doesn't get fought over every render.
  }, [params?.id])

  // scrollTarget is the free-scrolling rest position; displayY trails it
  // with a little damping for smoothness -- no snapping to section indices.
  const scrollTarget = useRef(SCROLL_MAX)
  const displayY = useRef(SCROLL_MAX)

  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      scrollTarget.current = THREE.MathUtils.clamp(
        scrollTarget.current - event.deltaY * SCROLL_SPEED,
        SCROLL_MIN,
        SCROLL_MAX,
      )
    }
    window.addEventListener('wheel', handleWheel, { passive: true })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [])

  useFrame((_, delta) => {
    // The item-zoom effect above owns the camera while one is active.
    if (params?.id) return

    easing.damp(displayY, 'current', scrollTarget.current, SCROLL_SMOOTH_TIME, delta)

    // setLookAt (atomic) rather than separate setPosition/setTarget calls:
    // with a nonzero rest height, calling them separately lets
    // CameraControls briefly see the new position paired with the *old*
    // target, which can trip its minPolarAngle/maxPolarAngle clamp (our
    // position/target are always level, i.e. exactly at the clamp's
    // boundary) and corrupt its internal state.
    controls?.setLookAt(0, displayY.current, 2, 0, displayY.current, 0, false)
  })

  return (
    <>
        {/* enabled={false} blocks mouse/touch input (drag-orbit, wheel-zoom)
            while still allowing the imperative setLookAt calls above to move
            the camera programmatically. No minPolarAngle/maxPolarAngle: user
            orbit input is already disabled so there's nothing left for them
            to constrain, and our camera sits permanently *at* the polar=90°
            boundary (position/target always level), which made the
            constraint clamp our own imperative setLookAt calls unpredictably. */}
        <CameraControls makeDefault enabled={false} />
    </>
  )
}
