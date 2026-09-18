"use client"

import { useEffect, useState } from "react"
import type { RootState } from "@react-three/fiber"

/**
 * Watch a WebGL context for loss and restoration.
 *
 * Nothing handled this before. On loss the canvas simply went black and stayed
 * black, permanently and silently -- and this project has already paid for
 * that once: the long "missing island texture" hunt was Chrome dropping the GPU
 * context, which looked exactly like a broken asset because the app had nothing
 * to say about it.
 *
 * The homepage runs TWO contexts (the scene, and PhaseCube's own reconciler
 * root), on a workload -- N8AO, Bloom, a 2048 shadow map -- that is exactly the
 * kind that gets a context dropped on a constrained GPU. So this is wired to
 * both.
 *
 * `preventDefault()` on the lost event is the load-bearing line: without it the
 * browser will never fire `webglcontextrestored`, and recovery is impossible by
 * construction rather than by chance.
 */
export function useContextLoss() {
  const [lost, setLost] = useState(false)

  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!canvas) return
    const onLost = (event: Event) => {
      // Tells the browser we intend to recover. Skipping it is what makes a
      // lost context permanent.
      event.preventDefault()
      setLost(true)
    }
    const onRestored = () => setLost(false)
    canvas.addEventListener("webglcontextlost", onLost)
    canvas.addEventListener("webglcontextrestored", onRestored)
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost)
      canvas.removeEventListener("webglcontextrestored", onRestored)
    }
  }, [canvas])

  /** Pass to <Canvas onCreated>. */
  const onCreated = (state: RootState) => setCanvas(state.gl.domElement)

  return { lost, onCreated }
}
