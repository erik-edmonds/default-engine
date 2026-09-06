"use client"

import * as THREE from "three"

// The vocabulary shared by the in-canvas driver (CursorDriver.tsx), the DOM
// overlay that draws the thing (SceneCursor.tsx) and every object that wants to
// be magnetic.
//
// Everything crossing between them lives here as a module-level object rather
// than as React state or a jotai atom, deliberately: the cursor updates every
// frame, and routing that through React would re-render the page 60 times a
// second. Same reasoning, and the same shapes, as hints.ts -- see the note on
// `cursorNode` below.

// No drag state. Nothing in this scene drags -- the camera is driven by
// hotspot flights, not by the mouse -- so a drag/orbit mode only ever fired
// for the instant a click was held, flipping the cursor into a spin it had no
// reason to be in. Pressing is handled as a brief scale response on whatever
// state is current instead.
export type CursorState =
  | "idle"
  | "hover"
  | "interactive"
  | "projectFocus"
  | "text"
  | "scan"
  | "locked"

export type CursorTargetType = "cameraHotspot" | "project" | "interactive"

/** Movement bands for the scan state. The sheet's velocity row asks for three
 *  distinct looks, not a continuum. */
export type CursorSpeedTier = "slow" | "medium" | "fast"

/** px/s boundaries between those bands. */
export const SPEED_MEDIUM = 260
export const SPEED_FAST = 900

export interface MagneticTarget {
  /** Read live every frame -- hotspot markers bob, so their prop position is
   *  not where they actually are. */
  object: THREE.Object3D
  type: CursorTargetType
  /** Per-object multiplier. 0 disables, 0.5 subtle, 1 normal, 2 strong. */
  strength: number
  /** Screen-space influence radius in CSS px. */
  radius: number
  /** Screen-space lock radius in CSS px. */
  snapRadius: number
  /** Targets can be present but inert -- a portal away from its own hotspot,
   *  a hotspot marker that's currently hidden. Checked every frame rather than
   *  handled by unregistering, so a target blinking in and out doesn't churn
   *  the Set. */
  isEnabled: () => boolean
  /** What a click on this target does. Called through activateTarget() so the
   *  assisted click and the object's own r3f click share one debounce. */
  activate?: () => void
}

// ---------------------------------------------------------------- tuning

/** Default screen-space influence radius. Beyond this a target exerts nothing. */
export const MAGNETIC_RADIUS = 180
/** Enter LOCK inside this. */
export const MAGNETIC_SNAP_RADIUS = 45
/** ...and leave it only past this. The gap is hysteresis: without it the state
 *  chatters between ATTRACT and LOCK whenever the pointer sits on the boundary,
 *  which reads as a flickering cursor. */
export const MAGNETIC_RELEASE_RADIUS = 72

/** Type priority. Distance still dominates the score, so a distant portal
 *  can't pull the cursor off a nearby hotspot -- priority only breaks ties
 *  between targets that are already competing. */
export const TYPE_PRIORITY: Record<CursorTargetType, number> = {
  project: 1.3,
  cameraHotspot: 1.15,
  interactive: 1,
}

/** Pointer speed (px/s) at which attraction is fully suppressed -- move faster
 *  than this and you pass straight through a magnetic field. */
export const ESCAPE_SPEED = 2600
/** Attraction never drops to zero from speed alone, so a fast pass still bends
 *  slightly rather than ignoring the target outright. */
export const MIN_VELOCITY_FACTOR = 0.12

/** How fast the recorded pointer speed bleeds off, in e-folds per second.
 *
 *  Speed is only ever *written* by pointermove, and pointermove stops firing
 *  the instant the pointer stops -- so without decay the last measured speed
 *  stands forever. Measured: after a sweep, speed still read 0.069 a full 2.5
 *  seconds after the pointer had come to rest, which left the cursor able to
 *  sit in its movement state indefinitely. Applied against the reading's age
 *  rather than once per frame, so it behaves identically at 15fps and 120fps. */
export const VELOCITY_DECAY = 5
/** A pointermove this recently means the cursor is in motion.
 *
 *  This replaces a speed threshold. The brief is "the movement state appears
 *  whenever the cursor is in motion", and that is a fact about whether events
 *  are arriving, not a quantity to compare against a number. Three successive
 *  thresholds (900, 240, 180 px/s) all left the state unreachable in practice,
 *  because how fast a mouse "feels" varies hugely by DPI, OS acceleration and
 *  display size. Recency doesn't care about any of that: if the pointer moved
 *  in the last frame or two, it's moving. */
export const MOTION_WINDOW_MS = 140

/** THREE.MathUtils.damp lambdas. Higher is snappier. Magnetic movement is
 *  deliberately heavier than free movement -- that lag IS the feeling of being
 *  pulled. */
export const FREE_DAMPING = 26
export const MAGNETIC_DAMPING = 13
export const LOCK_DAMPING = 8

/** How much of the way to the target the cursor may be pulled at full
 *  attraction. Deliberately short of 1: even locked, the cursor keeps a little
 *  offset toward the real pointer, so it never feels like the site seized the
 *  mouse. */
export const MAX_ATTRACTION = 0.82

/** A click can arrive at the same target twice -- once from r3f's own handler
 *  and once from the cursor's assisted click. Second one inside this window is
 *  dropped. */
export const ACTIVATE_DEBOUNCE_MS = 350

/** Depth raycast cadence. Depth drives a slow visual response, so it does not
 *  need a per-frame answer -- and a raycast here is the one genuinely
 *  expensive thing the cursor does. */
export const DEPTH_SCAN_INTERVAL_FRAMES = 4
/** World-space distances mapped to the cursor's 0..1 depth response. */
export const DEPTH_NEAR = 8
export const DEPTH_FAR = 55

// ---------------------------------------------------------------- channels

/** SceneCursor's outer element, published so CursorDriver can write transforms
 *  straight onto it from inside <Canvas>. The two live on opposite sides of the
 *  canvas boundary and can't share a React ref. Same trick as hints.ts's
 *  `hintNode`, and shaped like a ref so it drops into ref-style code. */
export const cursorNode: { current: HTMLElement | null } = { current: null }

/** How many ghost lenses trail the cursor at speed. */
export const TRAIL_LENGTH = 4
/** Frames of lag between each ghost and the one ahead of it. Larger spreads
 *  the trail further back for the same speed. */
export const TRAIL_SPACING_FRAMES = 3

/** The ghost nodes, published by SceneCursor for the driver to position. */
export const cursorTrailNodes: { current: HTMLElement[] } = { current: [] }

/** The raw pointer. Written by SceneCursor from a capture-phase window
 *  listener; read by CursorDriver. `x`/`y` are CSS px, `vx`/`vy` px per second.
 *
 *  x/y stay the source of truth for where the mouse actually is, and the driver
 *  never writes back into them. That separation is what lets the cursor visually
 *  lag toward a magnet while the underlying pointer position stays exact. (The
 *  driver does decay vx/vy each frame -- see VELOCITY_DECAY -- because velocity,
 *  unlike position, has to fall to zero when the pointer stops and no further
 *  events arrive to say so.) */
export const pointerState = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  /** Speed (px/s) at the moment of the last pointermove, with `movedAt` the
   *  timestamp it was measured. The driver derives a live speed by decaying
   *  this by its age, rather than by decaying vx/vy once per frame -- a
   *  per-frame decay is frame-rate dependent, so on a slow frame the driver
   *  samples long after the peak and reads a fraction of the real speed. This
   *  form gives the same answer whatever the frame rate. */
  speed: 0,
  movedAt: 0,
  down: false,
  inWindow: false,
  /** True when the pointer is inside the bounds of an element marked
   *  data-cursor="text". Hit-tested geometrically rather than through pointer
   *  events, because the elements that want it (the name stamp) sit inside a
   *  pointer-events:none container -- elementFromPoint there returns the
   *  canvas, so no amount of listening would ever see them. */
  overText: false,
  /** False until the first real pointermove, so the cursor doesn't flash at
   *  0,0 before the pointer has been anywhere. */
  seen: false,
}

// Which artwork is on screen. Published by the driver and consumed by React in
// SceneCursor, rather than by CSS toggling `display` on always-present nodes.
//
// That indirection is the whole point. Every state difference used to live in
// the stylesheet, and this project's dev server has repeatedly served a
// half-stale globals.css -- one fetch contained the old bracket opacity AND the
// new one, with the scan rules missing entirely -- while the JS bundle was
// perfectly current. So the state machine ran correctly and set the attribute,
// and none of the visuals it named ever reached the browser. Artwork chosen in
// JS cannot fail that way: if the component is current, so is what it draws.
type CursorViewListener = (view: { state: CursorState; tier: CursorSpeedTier }) => void
let cursorViewListener: CursorViewListener | null = null

export function subscribeCursorView(fn: CursorViewListener | null) {
  cursorViewListener = fn
}

export function publishCursorView(state: CursorState, tier: CursorSpeedTier) {
  cursorViewListener?.({ state, tier })
}

/** The target the cursor is currently locked onto, or null. Published by
 *  CursorDriver so SceneCursor's click handler knows what an assisted click
 *  should fire. */
export const cursorLock: { current: MagneticTarget | null } = { current: null }

// The magnetic targets. A Set because registration order carries no meaning --
// the driver picks by score, not by index. Objects register on mount and
// unregister on unmount; being temporarily inert is expressed by isEnabled()
// rather than by leaving the Set.
const magneticTargets = new Set<MagneticTarget>()

export function registerMagneticTarget(target: MagneticTarget) {
  magneticTargets.add(target)
  return () => {
    magneticTargets.delete(target)
    if (cursorLock.current === target) cursorLock.current = null
  }
}

export function getMagneticTargets(): ReadonlySet<MagneticTarget> {
  return magneticTargets
}

// The curated raycast list for depth and surface context. Explicitly NOT
// scene.children: this scene carries ~2000 cloud PositionMesh nodes whose
// raycast each does an indexOf over a 1000-element array, so a full-scene ray
// costs on the order of a million comparisons before it touches a triangle.
// See the same warning in SunFlare.tsx about drei's <LensFlare>.
const cursorSurfaces = new Set<THREE.Object3D>()

export function registerCursorSurface(object: THREE.Object3D) {
  cursorSurfaces.add(object)
  return () => void cursorSurfaces.delete(object)
}

export function getCursorSurfaces(): ReadonlySet<THREE.Object3D> {
  return cursorSurfaces
}

// Hover intent, reported by things the pointer is actually over (3D props via
// useCursorHover, DOM chrome via SceneCursor's delegated listener). Replaces
// the eleven `document.body.style.cursor = "pointer"` writes this project had:
// those set a native cursor we now hide, but the *signal* they carried is
// still wanted -- it's what tells the lens to open on hover.
const hoverSources = new Map<object, CursorTargetType>()

export function setCursorHover(token: object, type: CursorTargetType | null) {
  if (type === null) hoverSources.delete(token)
  else hoverSources.set(token, type)
}

/** The most significant hover currently reported, or null. */
export function getCursorHover(): CursorTargetType | null {
  let best: CursorTargetType | null = null
  for (const type of hoverSources.values()) {
    if (best === null || TYPE_PRIORITY[type] > TYPE_PRIORITY[best]) best = type
  }
  return best
}

// ---------------------------------------------------------------- helpers

const lastActivated = new WeakMap<MagneticTarget, number>()

/** Fire a target's action, at most once per debounce window.
 *
 *  Both paths go through here: the object's own r3f onClick, and the cursor's
 *  assisted click when it's locked but the true pointer is off-target. Either
 *  can arrive first and neither knows about the other, so the debounce is what
 *  stops a click that lands on both from counting twice. */
export function activateTarget(target: MagneticTarget): boolean {
  const now = performance.now()
  const previous = lastActivated.get(target)
  if (previous !== undefined && now - previous < ACTIVATE_DEBOUNCE_MS) return false
  lastActivated.set(target, now)
  target.activate?.()
  return true
}

/** True only if the object and every ancestor is visible.
 *
 *  three r185's Raycaster no longer skips invisible objects, and this scene
 *  leans on `visible` heavily -- CameraHotspot's hit mesh is invisible while
 *  its marker is hidden and during its entrance tween. Without this the cursor
 *  would magnetise to hotspots that aren't on screen. */
export function isTreeVisible(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object
  while (node) {
    if (!node.visible) return false
    node = node.parent
  }
  return true
}

/** How sharply attraction ramps between the influence radius and the lock
 *  radius. Higher keeps the field quiet further in.
 *
 *  This is the single number that decides whether the magnetism reads as help
 *  or as interference, so it is worth stating what it buys. A smoothstep --
 *  the obvious choice, and what this used to be -- is already at 0.74 by the
 *  halfway point, which at a 180px radius meant the cursor sat ~73px off the
 *  true pointer while still 90px from its target. That is not subconscious;
 *  that is the page moving your mouse. At the 4th power the same halfway point
 *  gives 0.20, so the field is a barely-perceptible lean until you are
 *  genuinely closing in, then firms up quickly over the last third. */
const ATTRACTION_CURVE = 4

/** Attraction falloff between `outer` (no pull) and `inner` (full pull).
 *  Returns 0 at or beyond `outer`, 1 at or inside `inner`. Written out because
 *  the edges run backwards here -- the value rises as distance falls. */
export function magneticFalloff(outer: number, inner: number, distance: number): number {
  if (outer <= inner) return distance <= inner ? 1 : 0
  const t = THREE.MathUtils.clamp((outer - distance) / (outer - inner), 0, 1)
  return Math.pow(t, ATTRACTION_CURVE)
}
