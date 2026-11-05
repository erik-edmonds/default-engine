"use client"

import { COLOR_MODE, type ColorModeName } from "@/config/asprs"
import { pointUniforms } from "@/lib/scan/pointMaterial"

/** Which colour the point cloud is drawn in.
 *
 *  A MODULE STORE WITH AN EXPLICIT SUBSCRIPTION, the same shape as
 *  helpers/xrMenu.ts and for the same reason: it is read by a uikit panel
 *  inside the render loop and by the DOM controls outside it, and neither
 *  should force a re-render of a tree containing a point cloud.
 *
 *  IT WRITES THE UNIFORM ITSELF, which is the point. Switching mode is one
 *  assignment to one shared uniform object that every resident node's material
 *  holds by reference -- see pointUniforms. No traversal of the resident set,
 *  no re-upload of a single attribute, no React commit. Keeping that
 *  assignment here rather than in a subscriber means there is exactly one
 *  place the mode and the uniform can ever disagree, and it is three lines
 *  long.
 */

let mode: ColorModeName = "rgb"
const listeners = new Set<() => void>()

export function setColorMode(next: ColorModeName): void {
  if (next === mode) return
  mode = next
  pointUniforms.uColorMode.value = COLOR_MODE[next]
  for (const fn of listeners) fn()
}

export function subscribeColorMode(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** A string, so `useSyncExternalStore` needs no cached reference. */
export function colorModeSnapshot(): ColorModeName {
  return mode
}

/** Nothing is drawn on the server, so the initial mode is the only honest
 *  answer -- and it matches the client's first render, which is what keeps
 *  React from reporting a hydration mismatch. */
export function colorModeServerSnapshot(): ColorModeName {
  return "rgb"
}
