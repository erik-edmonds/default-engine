"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import {
  DEPTH_FAR,
  DEPTH_NEAR,
  DEPTH_SCAN_INTERVAL_FRAMES,
  ESCAPE_SPEED,
  FREE_DAMPING,
  LOCK_DAMPING,
  MAGNETIC_DAMPING,
  MAGNETIC_RELEASE_RADIUS,
  MAX_ATTRACTION,
  MIN_VELOCITY_FACTOR,
  MOTION_WINDOW_MS,
  SPEED_FAST,
  SPEED_MEDIUM,
  TRAIL_LENGTH,
  VELOCITY_DECAY,
  TRAIL_SPACING_FRAMES,
  TYPE_PRIORITY,
  cursorLock,
  cursorNode,
  cursorTrailNodes,
  getCursorHover,
  getCursorSurfaces,
  getMagneticTargets,
  publishCursorView,
  isTreeVisible,
  pointerState,
  magneticFalloff,
  type CursorSpeedTier,
  type CursorTargetType,
  type CursorState,
  type MagneticTarget,
} from "@/helpers/cursor"

// The world half of the cursor.
//
// Lives inside <Canvas> because everything it does needs the camera; writes
// straight to SceneCursor's DOM node (published through cursor.ts) because that
// node is a sibling of the canvas, outside this React tree. Renders null and
// never re-renders React for a position change -- the same split
// NavigationProjector and HintAnchor already use.
//
// The pipeline each frame is: read the raw pointer, project every magnetic
// target to screen space, score them, blend the pointer toward the winner,
// damp, and write a transform. Targeting is done with project() rather than a
// raycast on purpose -- see the note on `cursorSurfaces` in cursor.ts for why a
// per-frame scene raycast is not affordable in this scene.
export function CursorDriver() {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector3(), [])
  const world = useMemo(() => new THREE.Vector3(), [])
  const pointerNdc = useMemo(() => new THREE.Vector2(), [])
  const surfaceList = useMemo<THREE.Object3D[]>(() => [], [])

  // The cursor's own position, distinct from pointerState. This is what lags
  // toward magnets while the pointer itself stays exact.
  const cursor = useRef({ x: 0, y: 0, started: false })
  const locked = useRef(false)
  const attraction = useRef(0)
  const depth = useRef(0.5)
  const frame = useRef(0)
  /** Pointer and camera pose at the last depth raycast, so an unchanged pose
   *  can skip the next one. camW is the camera quaternion's w component --
   *  enough to notice a rotation without comparing all four. */
  const lastScan = useRef({ x: -999, y: -999, camX: 0, camY: 0, camZ: 0, camW: 2 })
  /** Ring buffer of recent cursor positions, sampled every frame, that the
   *  ghost lenses read from. Sized so the oldest ghost lags TRAIL_LENGTH *
   *  TRAIL_SPACING_FRAMES frames behind -- that lag is the smear. */
  const history = useRef<number[]>(new Array(TRAIL_LENGTH * TRAIL_SPACING_FRAMES * 2).fill(0))
  const historyHead = useRef(0)
  const lastState = useRef<CursorState | "">("")
  const lastTier = useRef<CursorSpeedTier | "">("")
  const lastTarget = useRef<CursorTargetType | null | "">("")
  /** movedAt as of the previous frame, so a pointermove that arrived since
   *  then counts as motion however long the frame took. */
  const lastMoveSeen = useRef(0)

  useFrame((_, delta) => {
    const el = cursorNode.current
    if (!el) return

    const pointer = pointerState
    if (!pointer.seen) return

    // Seed on the first real frame so the cursor doesn't fly in from 0,0.
    if (!cursor.current.started) {
      cursor.current.x = pointer.x
      cursor.current.y = pointer.y
      cursor.current.started = true
    }

    frame.current++
    // delta can spike after a tab switch or a long GC pause; a huge dt makes
    // damp() jump the whole way and the cursor teleports.
    const dt = Math.min(delta, 0.05)

    // Live speed = the speed at the last pointermove, faded by how long ago
    // that was. pointermove stops firing the moment the pointer stops, so
    // without a fade the last reading would stand forever and the cursor could
    // sit in its movement state indefinitely. Deriving it from the reading's
    // AGE rather than decaying a stored value once per frame matters: the
    // per-frame form is frame-rate dependent, and on this scene's slower frames
    // the driver sampled long after the peak and saw a fraction of the real
    // speed -- which is why the scan state looked unreachable.
    const speed =
      pointer.speed * Math.exp(-Math.max(0, (performance.now() - pointer.movedAt) / 1000) * VELOCITY_DECAY)

    // ---------------------------------------------------------- targeting
    let best: MagneticTarget | null = null
    let bestScore = -1
    let bestX = 0
    let bestY = 0
    let bestDistance = Infinity

    for (const target of getMagneticTargets()) {
      if (target.strength <= 0) continue
      if (!target.isEnabled()) continue
      if (!isTreeVisible(target.object)) continue

      target.object.getWorldPosition(world)
      ndc.copy(world).project(camera)
      // z > 1 is behind the camera, where project() still returns a
      // plausible-looking x/y mirrored through the origin -- magnetising to
      // that would pull the cursor to the opposite side of the frame.
      if (ndc.z > 1) continue

      const x = (ndc.x * 0.5 + 0.5) * size.width
      const y = (-ndc.y * 0.5 + 0.5) * size.height
      const distance = Math.hypot(x - pointer.x, y - pointer.y)
      if (distance > target.radius) continue

      // Nearer objects pull a little harder, but only a little -- depth
      // nudges the ranking, it never overturns a clearly closer target.
      const eye = camera.position.distanceTo(world)
      const depthFactor = THREE.MathUtils.mapLinear(
        THREE.MathUtils.clamp(eye, DEPTH_NEAR, DEPTH_FAR),
        DEPTH_NEAR,
        DEPTH_FAR,
        1,
        0.7,
      )

      const score =
        target.strength * TYPE_PRIORITY[target.type] * (1 - distance / target.radius) * depthFactor

      if (score > bestScore) {
        bestScore = score
        best = target
        bestX = x
        bestY = y
        bestDistance = distance
      }
    }

    // ---------------------------------------------------------- zones
    if (best !== cursorLock.current && cursorLock.current !== null) {
      // Switched targets (or lost the old one) -- drop the lock rather than
      // carrying it across, so the state machine restarts cleanly on the new
      // target instead of inheriting a lock it never earned.
      locked.current = false
    }

    if (!best) {
      locked.current = false
      cursorLock.current = null
    } else if (locked.current) {
      // Hysteresis: leave the lock only well outside the radius that entered
      // it, or the state flickers whenever the pointer rests on the boundary.
      if (bestDistance > Math.max(MAGNETIC_RELEASE_RADIUS, best.snapRadius * 1.6)) {
        locked.current = false
      }
    } else if (bestDistance < best.snapRadius) {
      locked.current = true
    }
    cursorLock.current = locked.current ? best : null

    // ---------------------------------------------------------- attraction
    let goalX = pointer.x
    let goalY = pointer.y
    let targetAttraction = 0

    if (best) {
      const proximity = magneticFalloff(best.radius, best.snapRadius, bestDistance)
      // Move fast enough and you punch through. This is what keeps the
      // magnetism from ever feeling like it has taken the mouse away: the user
      // can always outrun it.
      const velocityFactor = THREE.MathUtils.clamp(
        1 - speed / ESCAPE_SPEED,
        MIN_VELOCITY_FACTOR,
        1,
      )
      // A lock holds regardless of speed, otherwise flicking the mouse while
      // locked would tear the cursor off something it is deliberately holding.
      targetAttraction = THREE.MathUtils.clamp(
        proximity * best.strength * (locked.current ? 1 : velocityFactor),
        0,
        1,
      ) * MAX_ATTRACTION

      goalX = THREE.MathUtils.lerp(pointer.x, bestX, targetAttraction)
      goalY = THREE.MathUtils.lerp(pointer.y, bestY, targetAttraction)
    }

    // Damp the attraction figure itself too, so entering and leaving a field
    // ramps rather than steps -- this is the "elastic" release.
    attraction.current = THREE.MathUtils.damp(attraction.current, targetAttraction, 10, dt)

    const lambda = locked.current
      ? LOCK_DAMPING
      : attraction.current > 0.02
        ? MAGNETIC_DAMPING
        : FREE_DAMPING
    cursor.current.x = THREE.MathUtils.damp(cursor.current.x, goalX, lambda, dt)
    cursor.current.y = THREE.MathUtils.damp(cursor.current.y, goalY, lambda, dt)

    // ---------------------------------------------------------- depth
    // The raycast is the only genuinely expensive thing here, so it is skipped
    // whenever its answer cannot have changed: a stationary pointer over a
    // stationary camera hits the same triangle it hit last time. That covers
    // the common case of the pointer simply resting somewhere. Locked is
    // skipped too -- the target dictates the look, not the ground behind it.
    if (frame.current % DEPTH_SCAN_INTERVAL_FRAMES === 0 && !locked.current) {
      const cam = camera.position
      const moved =
        Math.hypot(pointer.x - lastScan.current.x, pointer.y - lastScan.current.y) > 2 ||
        Math.abs(cam.x - lastScan.current.camX) > 0.01 ||
        Math.abs(cam.y - lastScan.current.camY) > 0.01 ||
        Math.abs(cam.z - lastScan.current.camZ) > 0.01 ||
        Math.abs(camera.quaternion.w - lastScan.current.camW) > 0.0005

      const surfaces = getCursorSurfaces()
      if (moved && surfaces.size > 0) {
        lastScan.current = {
          x: pointer.x,
          y: pointer.y,
          camX: cam.x,
          camY: cam.y,
          camZ: cam.z,
          camW: camera.quaternion.w,
        }
        surfaceList.length = 0
        for (const surface of surfaces) if (isTreeVisible(surface)) surfaceList.push(surface)

        pointerNdc.set((pointer.x / size.width) * 2 - 1, -(pointer.y / size.height) * 2 + 1)
        raycaster.setFromCamera(pointerNdc, camera)
        raycaster.far = DEPTH_FAR * 2
        const hit = raycaster.intersectObjects(surfaceList, true)[0]
        if (hit) {
          depth.current = 1 - THREE.MathUtils.clamp(
            (hit.distance - DEPTH_NEAR) / (DEPTH_FAR - DEPTH_NEAR),
            0,
            1,
          )
        } else {
          // Nothing under the pointer -- open sky. Read as far away.
          depth.current = 0
        }
      }
    }

    // ---------------------------------------------------------- state
    const movedSinceLastFrame = pointer.movedAt !== lastMoveSeen.current
    lastMoveSeen.current = pointer.movedAt
    const hover = getCursorHover()
    let state: CursorState
    // Pressing is NOT a state -- see the note on CursorState. It's published as
    // a flag the stylesheet reads for a brief scale response on whatever state
    // is already showing.
    if (locked.current && best?.type === "project") state = "projectFocus"
    else if (locked.current) state = "locked"
    else if (hover === "project") state = "projectFocus"
    else if (attraction.current > 0.04) state = "interactive"
    else if (hover) state = hover === "cameraHotspot" ? "interactive" : "hover"
    // Text sits below the magnets -- a caret over something you could actually
    // fly to would be the wrong promise -- but above movement, since reading
    // beats scanning.
    else if (pointer.overText) state = "text"
    // Motion, not speed. "In motion" is whether pointermove events are still
    // arriving, which is a fact; comparing a computed px/s against a threshold
    // is a guess about DPI, OS pointer acceleration and display size, and three
    // successive thresholds all left this state unreachable in practice.
    //
    // Either test alone has a gap. The time window misses a quick flick when a
    // frame runs long -- the move lands and expires between two frames, so the
    // driver never sees it. The moved-since-last-frame test alone flickers off
    // between events on a high-refresh display. Together they hold at any frame
    // rate: every pointermove is guaranteed at least one frame of motion, and
    // the window carries it across the gaps between events.
    else if (movedSinceLastFrame || performance.now() - pointer.movedAt < MOTION_WINDOW_MS) state = "scan"
    else state = "idle"

    // ---------------------------------------------------------- write
    el.style.transform = `translate3d(${cursor.current.x}px, ${cursor.current.y}px, 0)`
    // CSS custom properties rather than classes for the continuous values, so
    // the stylesheet owns how each one looks and this file owns only the
    // numbers. Rounded to keep the style string stable between frames.
    el.style.setProperty("--cursor-attract", attraction.current.toFixed(3))
    el.style.setProperty("--cursor-depth", depth.current.toFixed(3))
    el.style.setProperty("--cursor-speed", Math.min(speed / ESCAPE_SPEED, 1).toFixed(3))

    const tier: CursorSpeedTier = speed > SPEED_FAST ? "fast" : speed > SPEED_MEDIUM ? "medium" : "slow"

    // What the cursor is engaged with, used to tint it. Taken from the magnetic
    // target rather than from the hover registry on purpose: DOM chrome reports
    // itself as "interactive" too, and the corner buttons should not turn the
    // cursor the colour reserved for the scene's props.
    const target: CursorTargetType | null = best ? best.type : null

    if (state !== lastState.current || tier !== lastTier.current || target !== lastTarget.current) {
      lastState.current = state
      lastTier.current = tier
      lastTarget.current = target
      // The attributes stay for styling hooks and for tests to read; the
      // publish is what actually decides which artwork React draws.
      el.dataset.cursorState = state
      el.dataset.cursorTier = tier
      el.dataset.cursorTarget = target ?? "none"
      publishCursorView(state, tier, target)
    }
    if (el.dataset.cursorPressed !== (pointer.down ? "true" : "false")) {
      el.dataset.cursorPressed = pointer.down ? "true" : "false"
    }

    // ---------------------------------------------------------- trail
    // Record this frame's position, then hand each ghost a progressively older
    // one. Positions are already computed above, so the smear costs a couple of
    // array writes and one transform per ghost.
    const slots = history.current.length / 2
    historyHead.current = (historyHead.current + 1) % slots
    history.current[historyHead.current * 2] = cursor.current.x
    history.current[historyHead.current * 2 + 1] = cursor.current.y

    // Trail strength: absent at rest, full well before escape velocity, so
    // ordinary movement smears rather than only a violent flick.
    const trail = Math.min(speed / (ESCAPE_SPEED * 0.3), 1)
    const ghosts = cursorTrailNodes.current
    for (let i = 0; i < ghosts.length; i++) {
      const back = (i + 1) * TRAIL_SPACING_FRAMES
      const slot = (historyHead.current - back + slots * 2) % slots
      const ghost = ghosts[i]
      ghost.style.transform = `translate3d(${history.current[slot * 2]}px, ${history.current[slot * 2 + 1]}px, 0)`
      // Written per ghost rather than as one inherited custom property: the
      // ghosts are siblings of the cursor node, not children, so they would
      // not inherit it -- and setting it on <html> to work around that would
      // invalidate styles document-wide every frame.
      ghost.style.opacity = (trail * (1 - i / TRAIL_LENGTH) * 0.5).toFixed(3)
    }
  })

  return null
}
