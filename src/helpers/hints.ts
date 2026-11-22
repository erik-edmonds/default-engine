"use client"

import * as THREE from "three"
import { atom } from "jotai"

// The vocabulary shared by the hint director (useHintDirector.ts), the
// in-canvas projector (HintAnchor.tsx) and the DOM half (SceneHint.tsx).
//
// WHAT IS LEFT HERE, AND WHY ONLY THIS. There used to be three discovery
// nudges in this file too -- play the guitar, make it rain, open the Poké Ball
// -- drawn as black-glass captions pinned over the prop in question. They are
// gone: those were anonymous chrome telling you to click something, and they
// are entries in the avatar's suggestion queue now (config/suggestions.ts),
// where the same information has someone saying it and can carry a sentence
// about the person whose site this is.
//
// The two that remain are not discovery and could not move. Both fire while
// the camera is at or inside a portal, which is exactly where the avatar is
// not on screen to say anything -- a bubble anchored to him would be held
// hidden by AvatarAnchor for the entire time the visitor needs to be told how
// to get back out. They are instructions about the state you are in, pinned to
// the thing that changes it.
//
// Deliberately separate from the existing InteractionHint: that one is the
// single "the scene is interactive at all" onboarding beat and finishes long
// before either of these can fire.

export type HintId = "beacon" | "portalEnter" | "portalExit"

/** Where a hint pins itself.
 *
 *  - `world`  a fixed point in the scene, projected every frame.
 *  - `screen` a fixed viewport offset, for pointing at DOM chrome (the home
 *             button) rather than at anything in the scene.
 *
 *  A `cloud` kind sat here too, resolving to whichever registered cloud was
 *  nearest screen centre, because cloud positions are `Math.random()` at
 *  module load and there was no fixed point to aim at. It went with the clouds
 *  hint, and so did the registry in Sky.tsx that fed it. */
export type HintTarget =
  /** A fixed point in the scene, projected every frame.
   *
   *  `maxDistance` is how near the camera must be for the hint to show at all.
   *  Being on screen is not enough for an instruction: from the Home viewpoint
   *  the far portals still project into frame, so "Double-click to enter" was
   *  appearing over open scenery, anchored to a portal thirty units away that
   *  a double-click could never reach. Gating on the world -- can you actually
   *  act on this from here -- rather than on which hotspot some variable
   *  believes you are at, makes the hint correct by construction. */
  | { kind: "world"; position: THREE.Vector3; maxDistance?: number }
  | { kind: "screen"; left: number; top: number }

export interface ActiveHint {
  id: HintId
  target: HintTarget
}

// Copy, plus whether the hint draws its marker dot.
//
// Two copy variants only where the gesture itself differs by input device -- a
// portal opens on double-click with a mouse and on a long press by touch
// (Card.tsx). Rendered uppercase by CSS, so these stay sentence case here.
//
// `marker` is false for the two portal beats, and that is not a coincidence:
// the dot exists to single out one small prop in a busy scene, and those two
// point at the thing filling the frame and at a button in the corner. A dot
// beside the caption there is clutter hanging off the text.
//
// `beacon` is the first to set it TRUE, and it is the case the marker was
// written for -- a small glowing sphere at the end of a pier, in a scene with
// a waterfall, three palms and four floating islands competing for the eye.
// `hint-marker-breathe` in globals.css has been sitting unused since the
// discovery hints were removed; its own comment calls it "the same sonar
// breath CameraHotspot's rings use on hover, running continuously here because
// a hint has to catch an eye that isn't already on it."
export const HINTS: Record<HintId, { fine: string; coarse: string; marker: boolean }> = {
  beacon: { fine: "Click the beacon to scan", coarse: "Tap the beacon to scan", marker: true },
  portalEnter: { fine: "Double-click to enter", coarse: "Press and hold to enter", marker: false },
  portalExit: { fine: "Click home to exit", coarse: "Tap home to exit", marker: false },
}

/** How near the camera has to be for the beacon hint to show.
 *
 *  The beacon sits 8.5 units from the home viewpoint, and 30-plus from the
 *  three destination viewpoints. 14 cleanly separates "you are looking at the
 *  beach" from "you are across the water at another island", which is the same
 *  distinction PORTAL_HINT_MAX_DISTANCE draws and for the same reason: being
 *  on screen is not enough for an instruction you cannot act on. */
export const BEACON_HINT_MAX_DISTANCE = 14

/** Where the portalExit caption starts: immediately to the right of the 56px
 *  home logo and vertically centred on it, so it reads as a label *for* the
 *  button rather than as something floating underneath. layout.tsx pins the
 *  logo at top-5 left-5, so it spans 20..76px on both axes -- hence 76 + a
 *  12px gap, and 48 for the centre line. */
export const HOME_BUTTON_HINT_ANCHOR = { left: 88, top: 48 } as const

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

/** Whether the active hint is actually rendered where someone can see it.
 *  False between a hint being chosen and the projector's next frame placing it
 *  (and for as long as its subject is out of frame). The director holds both
 *  the minimum and maximum visible clocks while this is false -- otherwise a
 *  hint can burn its whole 7s ceiling before it has been drawn once, which is
 *  exactly what happens when the render loop stalls. */
export const hintOnScreen = atom(false)

// SceneHint's outer element, published so HintAnchor can write transforms
// straight onto it from inside <Canvas>. The two live on opposite sides of the
// canvas boundary and can't share a React ref; this is the same trick
// NavigationProjector uses (it holds its DOM nodes in a ref and writes
// el.style.transform directly), which keeps the per-frame position update off
// React's render path entirely.
export const hintNode: { current: HTMLElement | null } = { current: null }

/** How near the camera must be for "double-click to enter" to show.
 *
 *  A portal stands PORTAL_VIEW_DISTANCE (4.5) from its own viewpoint and 30-45
 *  units from any other, so this separates "you are stood at it" from "you can
 *  see it across the water" with a wide margin either side. It exists because
 *  being on screen was the only test, and from the Home viewpoint the far
 *  portals project into frame -- so the hint captioned open scenery next to a
 *  hotspot ring, advertising a double-click that could not land. */
export const PORTAL_HINT_MAX_DISTANCE = 12
