"use client"

import * as THREE from "three"
import { atom } from "jotai"

// The vocabulary shared by the hint director (useHintDirector.ts), the
// in-canvas projector (HintAnchor.tsx) and the DOM half (SceneHint.tsx).
//
// Deliberately separate from the existing InteractionHint: that one is the
// single "the scene is interactive at all" onboarding beat and finishes long
// before any of these can fire. These are contextual nudges toward specific
// objects, at most one on screen at a time.

export type HintId = "guitar" | "clouds" | "portalEnter" | "portalExit"

/** Where a hint pins itself.
 *
 *  - `world`  a fixed point in the scene, projected every frame.
 *  - `cloud`  resolved to whichever registered cloud is nearest screen centre.
 *             Cloud positions are `Math.random()` at module load (see
 *             config/store.ts), so unlike the guitar there is no fixed point
 *             to aim at -- it has to be picked from live instances.
 *  - `screen` a fixed viewport offset, for pointing at DOM chrome (the home
 *             button) rather than at anything in the scene. */
export type HintTarget =
  | { kind: "world"; position: THREE.Vector3 }
  | { kind: "cloud" }
  | { kind: "screen"; left: number; top: number }

export interface ActiveHint {
  id: HintId
  target: HintTarget
}

// Copy, plus whether the hint draws its marker dot.
//
// Two copy variants only where the gesture itself differs by input device -- a
// portal opens on double-click with a mouse and on a long press by touch
// (Card.tsx) -- and one shared string everywhere else, since "play the guitar"
// reads the same however you happen to be pointing at it. Rendered uppercase
// by CSS, so these stay sentence case here.
//
// `marker` is what separates the two jobs these hints do. The discovery ones
// have to single out one small prop in a busy scene, so they need a dot to
// point with. The portal ones don't: their subject is either the thing filling
// the frame or a button in the corner, both unmistakable, and a dot next to
// the caption there is just clutter hanging off the text.
export const HINTS: Record<HintId, { fine: string; coarse: string; marker: boolean }> = {
  guitar: { fine: "Play the guitar", coarse: "Play the guitar", marker: true },
  clouds: { fine: "Make it rain", coarse: "Make it rain", marker: true },
  portalEnter: { fine: "Double-click to enter", coarse: "Press and hold to enter", marker: false },
  portalExit: { fine: "Click home to exit", coarse: "Tap home to exit", marker: false },
}

/** The guitar's world position. Scene.tsx mounts it at [0.1, -0.7, 1] inside a
 *  group with no transform of its own, so scene-local is world here; the
 *  marker is lifted a little so the label sits above the instrument rather
 *  than over it. */
export const GUITAR_HINT_POSITION = new THREE.Vector3(0.1, -0.35, 1)

/** Where the portalExit caption starts: immediately to the right of the 56px
 *  home logo and vertically centred on it, so it reads as a label *for* the
 *  button rather than as something floating underneath. layout.tsx pins the
 *  logo at top-5 left-5, so it spans 20..76px on both axes -- hence 76 + a
 *  12px gap, and 48 for the centre line. */
export const HOME_BUTTON_HINT_ANCHOR = { left: 88, top: 48 } as const

// How long the user has to go without touching anything interactive before a
// discovery nudge appears. Nudging someone who is already busy is the
// disruption worth avoiding, so this is an idle gate, not a timer from load.
export const DISCOVER_IDLE_MS = 10000
/** Floor, so a hint satisfied almost immediately still reads as deliberate
 *  rather than as a flicker. Matches InteractionHint's own MIN_VISIBLE_MS. */
export const HINT_MIN_VISIBLE_MS = 2000
/** Ceiling, so an ignored hint retires instead of nagging. Counts visible time
 *  only -- see hintOnScreen. */
export const HINT_MAX_VISIBLE_MS = 7000
/** Hard ceiling on a hint that never becomes visible at all (its subject stays
 *  out of frame, or the render loop is wedged). Without it such a hint would
 *  hold the one-at-a-time slot indefinitely and block every later one. */
export const HINT_ABANDON_MS = 20000
/** Settle time after a hotspot flight lands, before the portal hint appears --
 *  arriving and being told what to do in the same frame reads as a pop-up. */
export const ARRIVAL_SETTLE_MS = 700
/** Settle time after the camera finishes flying into a portal. Longer than
 *  ARRIVAL_SETTLE_MS because that flight is 1.8s and the interior is still
 *  blending in behind it. */
export const PORTAL_INSIDE_SETTLE_MS = 1200
/** Hold duration for touch portal entry (Card.tsx). */
export const LONG_PRESS_MS = 500
/** How far a held finger may drift before it counts as a drag, not a press. */
export const LONG_PRESS_SLOP_PX = 12

/** The hint currently on screen, or null. Written only by useHintDirector. */
export const activeHint = atom<ActiveHint | null>(null)

/** Whether any registered cloud is currently on screen. Written by HintAnchor
 *  (which has the camera) and read by the director (which doesn't) as a
 *  precondition, so the clouds hint is never spent pointing off-frame. */
export const cloudOnScreen = atom(false)

/** Whether the active hint is actually rendered where someone can see it.
 *  False between a hint being chosen and the projector's next frame placing it
 *  (and for as long as its subject is out of frame). The director holds both
 *  the minimum and maximum visible clocks while this is false -- otherwise a
 *  hint can burn its whole 7s ceiling before it has been drawn once, which is
 *  exactly what happens when the render loop stalls. */
export const hintOnScreen = atom(false)

// The clouds eligible to carry a hint. Sky.tsx registers only the instances
// that actually render (drei's <Instances range> draws a prefix of the
// children, while the data array itself is 1000 long), and unregisters on
// unmount. A Set because registration order carries no meaning -- HintAnchor
// picks by screen position, not by index.
const hintClouds = new Set<THREE.Object3D>()

export function registerHintCloud(node: THREE.Object3D) {
  hintClouds.add(node)
}

export function unregisterHintCloud(node: THREE.Object3D) {
  hintClouds.delete(node)
}

export function getHintClouds(): ReadonlySet<THREE.Object3D> {
  return hintClouds
}

// SceneHint's outer element, published so HintAnchor can write transforms
// straight onto it from inside <Canvas>. The two live on opposite sides of the
// canvas boundary and can't share a React ref; this is the same trick
// NavigationProjector uses (it holds its DOM nodes in a ref and writes
// el.style.transform directly), which keeps the per-frame position update off
// React's render path entirely.
export const hintNode: { current: HTMLElement | null } = { current: null }
