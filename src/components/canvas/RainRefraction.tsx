"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { useAtomValue } from "jotai"

import { raining } from "@/helpers/StateProvider"

/** How often the droplets' refraction source is refreshed. A few times a
 *  second reads as live for a mostly-static island, and the copy is the one
 *  genuinely expensive thing here. */
const REFRESH_MS = 120

/** Runs after EffectComposer, which r3f drives at priority 1. */
const AFTER_COMPOSER = 2

// Feeds raindrop.js's droplets a current glimpse of the real scene.
//
// This used to live in RainScene.jsx, outside the Canvas, on a setInterval --
// and that is why the main <Canvas> carried `preserveDrawingBuffer: true`. A
// WebGL drawing buffer is only guaranteed readable until the frame is
// composited, so copying it from a timer that fires at some arbitrary later
// moment forced the browser to keep a copy of the whole buffer after every
// single frame, of every session, for an effect that runs during a ~6 second
// rain burst.
//
// Doing the copy from inside the frame loop removes that requirement entirely:
// at priority 2 this runs in the same task as the composer's render at
// priority 1, while the buffer is still valid. Same visual result, and the
// flag is gone.
export function RainRefraction() {
  const isRaining = useAtomValue(raining)
  const lastCopy = useRef(0)

  useFrame(({ gl }) => {
    if (!isRaining) return
    const now = performance.now()
    if (now - lastCopy.current < REFRESH_MS) return

    // Stashed on window by the patched raindrop.js; absent until its bundle
    // has loaded, which is a normal state rather than an error.
    const fgCtx = (window as unknown as { __rainFgCtx?: CanvasRenderingContext2D }).__rainFgCtx
    const renderer = (window as unknown as { __rainRenderer?: { updateTextures: () => void } }).__rainRenderer
    if (!fgCtx || !renderer) return

    lastCopy.current = now
    fgCtx.drawImage(gl.domElement, 0, 0, fgCtx.canvas.width, fgCtx.canvas.height)
    renderer.updateTextures()
  }, AFTER_COMPOSER)

  return null
}
