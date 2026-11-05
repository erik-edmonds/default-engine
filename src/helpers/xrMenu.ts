"use client"

/** Whether the wrist menu is up, and where it stands.
 *
 *  A MODULE STORE WITH AN EXPLICIT SUBSCRIPTION, modelled on
 *  helpers/sampleLog.ts, which already does exactly this so the DOM can read
 *  it through `useSyncExternalStore`.
 *
 *  The reason it is not React state is the reason everything else on this
 *  route is not React state: the gate is evaluated in a frame callback at
 *  72Hz, and `setState` there would re-render a tree containing a point cloud
 *  once per frame. Through here, React renders exactly TWICE per open/close
 *  and never in between.
 *
 *  It is also why the library's own `IfFacingCamera` / `ShowIfFacingCamera`
 *  are not used, despite @react-three/xr's skill naming them for wrist menus.
 *  `IfFacingCamera` calls `setShow(...)` from `useFrame` on every frame, and
 *  `ShowIfFacingCamera` only toggles `.visible` -- which would leave uikit's
 *  per-frame `root.update()` running while the menu is "hidden". Neither has
 *  any hysteresis, which is the one property this gesture had to have.
 */

let open = false
const listeners = new Set<() => void>()

/** How many grips are currently held, published by XrNavigate.
 *
 *  The gate reads it to suppress itself: the two-handed grab turns the model
 *  by the bearing between the hands, so scaling the survey IS a wrist roll. */
export const xrGrab = { held: 0 }

export function setMenuOpen(next: boolean): void {
  if (next === open) return
  open = next
  for (const fn of listeners) fn()
}

export function subscribeMenu(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** A primitive, so `useSyncExternalStore` needs no cached reference. */
export function menuSnapshot(): boolean {
  return open
}

/** There is no menu on the server, and no session either. */
export function menuServerSnapshot(): boolean {
  return false
}
