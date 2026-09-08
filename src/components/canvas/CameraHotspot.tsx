"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Billboard, Text } from "@react-three/drei"
import { suspend } from "suspend-react"
import gsap from "gsap"
import { useSfx } from "@/helpers/useSfx"
import { MAGNETIC_RADIUS, MAGNETIC_SNAP_RADIUS, activateTarget, registerMagneticTarget, setCursorHover, type MagneticTarget } from "@/helpers/cursor"

const BOB_AMPLITUDE = 0.12
const BOB_SPEED = 0.9
const BASE_SCALE = 1
const HOVER_SCALE = 1.25

const IDLE_COLOR = new THREE.Color("white")
const HOVER_COLOR = new THREE.Color("#d25a1a")

// Sonar-ping pulse, hover-triggered only -- idle markers sit as a plain
// static ring, and the ring only starts breathing while the cursor is
// actually over it.
const PULSE_MAX_SCALE = 1.6
const PULSE_DURATION = 1.6
const PULSE_SETTLE_DURATION = 0.25

const ENTRANCE_DURATION = 0.2

/** Same font the portal captions load, so nothing new crosses the wire --
 *  Card.tsx already resolves this module-level promise. */
const labelFont = import("@pmndrs/assets/fonts/inter_medium.woff")

const LABEL_SIZE = 0.19
/** Below the ring, clear of its 0.44 outer radius. */
const LABEL_OFFSET_Y = -0.78
/** White type sits at about 1.07:1 on this scene's near-white horizon, so the
 *  label carries its own dark contour -- the 3D equivalent of the scrim behind
 *  the DOM hint captions. */
const LABEL_OUTLINE_WIDTH = 0.016
const LABEL_OUTLINE_COLOR = "#0b1b25"
/** How fast the label fades in and out. Damping, not a tween: it has to be
 *  interruptible mid-fade when the pointer leaves during the intro. */
const LABEL_FADE_LAMBDA = 12

/** Hotspots pull a little harder than an ordinary prop: they're the scene's
 *  navigation, and helping the pointer find them is the whole point. */
const HOTSPOT_MAGNETIC_STRENGTH = 1.2

export function CameraHotspot({
  label,
  labelsIntro,
  position,
  onClick,
  hidden,
  pendingOffscreen,
  onOffscreen,
}: {
  /** Where this ring goes -- "Contact", "Models", "Donate", "Home". */
  label: string
  /** All four labels show together for a beat when the markers first appear,
   *  so the map can be read once without hunting; after that they are
   *  hover-only. Driven from page.tsx so the four stay in sync. */
  labelsIntro: boolean
  position: [number, number, number]
  onClick: () => void
  /** True whenever this marker must not be shown: it's the hotspot the
   * camera is currently at/heading to, or it's the one just departed and
   * hasn't yet cleared the offscreen gate below. */
  hidden: boolean
  /** True while this marker is hidden specifically because it's waiting to
   * scroll out of the camera's view before it's allowed to reappear. */
  pendingOffscreen: boolean
  /** Fired (once) the frame this marker's world position leaves the
   * camera's view frustum while `pendingOffscreen`. */
  onOffscreen: () => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const hitMeshRef = useRef<THREE.Mesh>(null)
  const ringMeshRef = useRef<THREE.Mesh>(null)
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const dotMaterialRef = useRef<THREE.MeshBasicMaterial>(null)
  const labelRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)
  const seed = useMemo(() => Math.random() * Math.PI * 2, [])
  const play = useSfx()
  const scaleTweenRef = useRef<gsap.core.Tween | null>(null)
  const pulseTimelineRef = useRef<gsap.core.Timeline | null>(null)
  const didMountRef = useRef(false)
  const reportedOffscreenRef = useRef(false)
  const frustum = useMemo(() => new THREE.Frustum(), [])
  const frustumMatrix = useMemo(() => new THREE.Matrix4(), [])
  const worldPos = useMemo(() => new THREE.Vector3(), [])

  // Latest props, read by the magnetic target below without re-registering it
  // every time they change. `hidden` in particular flips often.
  const latest = useRef({ hidden, onClick, play })
  latest.current = { hidden, onClick, play }
  // Stable identity for this marker's hover report. Several things can be
  // hovered at once, so the cursor's hover registry is keyed rather than a
  // single flag.
  const hoverToken = useMemo(() => ({}), [])
  useEffect(() => () => setCursorHover(hoverToken, null), [hoverToken])

  // Register as a magnetic target. The object handed over is the bobbing
  // group, not the prop position -- CursorDriver reads getWorldPosition() every
  // frame, so the cursor tracks the marker's actual bob rather than drifting
  // off it.
  const magnet = useRef<MagneticTarget | null>(null)
  useEffect(() => {
    const group = groupRef.current
    if (!group) return
    const target: MagneticTarget = {
      object: group,
      type: "cameraHotspot",
      strength: HOTSPOT_MAGNETIC_STRENGTH,
      radius: MAGNETIC_RADIUS,
      snapRadius: MAGNETIC_SNAP_RADIUS,
      // Checked per frame rather than by unregistering, because a marker is
      // hidden and shown constantly as you move between hotspots. The driver
      // also verifies visibility up the parent chain, which covers the
      // entrance tween where the hit mesh exists but isn't shown yet.
      isEnabled: () => !latest.current.hidden,
      // The sound lives here rather than in the click handler so an assisted
      // click (fired by the cursor while locked, with the true pointer off the
      // marker) is not silently different from a direct one.
      activate: () => {
        latest.current.play("click")
        latest.current.onClick()
      },
    }
    magnet.current = target
    return registerMagneticTarget(target)
  }, [])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return
    group.position.y = position[1] + Math.sin(state.clock.elapsedTime * BOB_SPEED + seed) * BOB_AMPLITUDE

    // The label shows while the pointer is on the ring, and once more when the
    // markers first appear so the map can be read without hunting for it.
    // troika's Text carries an ARRAY of materials (fill + outline), so
    // material.opacity is not a thing here -- fillOpacity/outlineOpacity are
    // the properties it actually reads, and it applies them per frame without
    // needing a sync().
    const labelMesh = labelRef.current as unknown as
      | { fillOpacity: number; outlineOpacity: number; visible: boolean }
      | null
    if (labelMesh) {
      const wanted = hovered || labelsIntro ? 1 : 0
      const next = THREE.MathUtils.damp(labelMesh.fillOpacity ?? 0, wanted, LABEL_FADE_LAMBDA, delta)
      labelMesh.fillOpacity = next
      labelMesh.outlineOpacity = next
      // A fully faded label still costs a draw call.
      labelMesh.visible = next > 0.01
    }

    if (pendingOffscreen && !reportedOffscreenRef.current) {
      frustumMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(frustumMatrix)
      group.getWorldPosition(worldPos)
      if (!frustum.containsPoint(worldPos)) {
        reportedOffscreenRef.current = true
        onOffscreen()
      }
    }
  })

  useEffect(() => {
    if (pendingOffscreen) reportedOffscreenRef.current = false
  }, [pendingOffscreen])

  // Show/hide. Hiding is instant and bypasses any tween entirely -- on
  // click, or the moment a marker becomes the departure point of a new
  // transition, it must vanish with zero delay, not fade. Becoming visible
  // again (the reveal gated by `hidden` flipping back to false, up in
  // page.tsx) gets a quick pop-in instead of snapping straight to full size.
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    if (!didMountRef.current) {
      didMountRef.current = true
      group.visible = !hidden
      group.scale.setScalar(hidden ? 0 : (hovered ? HOVER_SCALE : BASE_SCALE))
      if (hitMeshRef.current) hitMeshRef.current.visible = !hidden
      return
    }

    scaleTweenRef.current?.kill()

    if (hidden) {
      group.visible = false
      group.scale.setScalar(0)
      if (hitMeshRef.current) hitMeshRef.current.visible = false
      // A marker can be hidden mid-hover (it was just clicked, or another
      // click elsewhere forced it into the departure-hidden state) without
      // ever getting a pointerout -- clear the stale hover so it doesn't
      // reappear later already orange/pulsing/grown for a cursor that isn't
      // there.
      if (hovered) setHovered(false)
      ringMaterialRef.current?.color.copy(IDLE_COLOR)
      dotMaterialRef.current?.color.copy(IDLE_COLOR)
      setCursorHover(hoverToken, null)
      return
    }

    group.visible = true
    if (hitMeshRef.current) hitMeshRef.current.visible = false
    const target = hovered ? HOVER_SCALE : BASE_SCALE
    scaleTweenRef.current = gsap.to(group.scale, {
      x: target,
      y: target,
      z: target,
      duration: ENTRANCE_DURATION,
      ease: "power2.out",
      onComplete: () => {
        if (hitMeshRef.current) hitMeshRef.current.visible = true
      },
    })
  }, [hidden, hovered])

  // Idle pulse -- hover-triggered only. Starts the instant the cursor lands
  // on the ring, and winds back down to the static idle look (rather than
  // an abrupt cut) once the cursor leaves.
  useEffect(() => {
    const ring = ringMeshRef.current
    const material = ringMaterialRef.current
    if (!ring || !material) return

    if (!hovered) {
      pulseTimelineRef.current?.kill()
      pulseTimelineRef.current = null
      gsap.to(ring.scale, { x: 1, y: 1, z: 1, duration: PULSE_SETTLE_DURATION, ease: "power2.out" })
      gsap.to(material, { opacity: 0.85, duration: PULSE_SETTLE_DURATION, ease: "power2.out" })
      return
    }

    const tl = gsap.timeline({ repeat: -1 })
    tl.set(ring.scale, { x: 1, y: 1, z: 1 })
    tl.set(material, { opacity: 0.85 })
    tl.to(ring.scale, { x: PULSE_MAX_SCALE, y: PULSE_MAX_SCALE, z: PULSE_MAX_SCALE, duration: PULSE_DURATION, ease: "power1.out" }, 0)
    tl.to(material, { opacity: 0, duration: PULSE_DURATION, ease: "power1.out" }, 0)
    pulseTimelineRef.current = tl
    return () => { tl.kill() }
  }, [hovered])

  return (
    <group ref={groupRef} position={position}>
      <Billboard>
        <mesh
          ref={hitMeshRef}
          // Tagged so other clickable things can tell a hotspot is under the
          // same pointer and defer to it -- see Sky.tsx's Cloud. The rings are
          // drawn over everything (depthTest false below), so a click that
          // lands on one is aimed at it, whatever happens to be nearer in
          // world space. r3f dispatches strictly by distance, so a nearer
          // cloud would otherwise fire first and stopPropagation here comes
          // too late to stop it.
          userData={{ hotspot: true }}
          onClick={(e) => {
            e.stopPropagation()
            // Through the registry, not straight to onClick: the cursor fires
            // the same target when it's locked on but the true pointer is off
            // to one side, and activateTarget debounces so a click that lands
            // on both paths still only navigates once.
            if (magnet.current) activateTarget(magnet.current)
            else {
              play("click")
              onClick()
            }
          }}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
            ringMaterialRef.current?.color.copy(HOVER_COLOR)
            dotMaterialRef.current?.color.copy(HOVER_COLOR)
            play("click")
            setCursorHover(hoverToken, "cameraHotspot")
          }}
          onPointerOut={() => {
            setHovered(false)
            ringMaterialRef.current?.color.copy(IDLE_COLOR)
            dotMaterialRef.current?.color.copy(IDLE_COLOR)
            setCursorHover(hoverToken, null)
          }}
        >
          <circleGeometry args={[0.5, 40]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* depthTest disabled + a high renderOrder makes these draw over
            everything else in the scene regardless of what geometry sits
            between them and the camera -- markers are waypoints, not
            physical objects, so they shouldn't be able to hide behind a
            rock or island the way a real object would. */}
        {/* A soft dark disc behind the ring and dot. They are pure white with
            toneMapped={false}, and the day horizon is #eaf7ff -- about 1.07:1,
            so on the skyline the markers all but vanish. This gives them
            something to sit on without changing how they read against the
            island. Drawn first, at a lower renderOrder, so the white geometry
            still lands on top. */}
        <mesh raycast={() => null} renderOrder={998}>
          <circleGeometry args={[0.52, 40]} />
          <meshBasicMaterial color="#0b1b25" transparent opacity={0.22} toneMapped={false} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh ref={ringMeshRef} raycast={() => null} renderOrder={999}>
          <ringGeometry args={[0.43, 0.44, 40]} />
          <meshBasicMaterial ref={ringMaterialRef} color="white" transparent opacity={0.85} toneMapped={false} side={THREE.DoubleSide} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh raycast={() => null} renderOrder={999}>
          <circleGeometry args={[0.16, 40]} />
          <meshBasicMaterial ref={dotMaterialRef} color="white" transparent toneMapped={false} side={THREE.DoubleSide} depthWrite={false} depthTest={false} />
        </mesh>
        {/* raycast disabled for the same reason as the ring, but with a sharper
            consequence: the label overlaps the hit circle, so a pointer moving
            onto the text would fire the circle's onPointerOut and clear
            `hovered` -- the label would switch itself off the moment you
            looked at it. depthTest matches the marker too, or the label alone
            would be swallowed by the island while the ring in front of it
            floats. */}
        <Text
          ref={labelRef}
          raycast={() => null}
          renderOrder={1000}
          font={(suspend(labelFont) as { default: string }).default}
          fontSize={LABEL_SIZE}
          position={[0, LABEL_OFFSET_Y, 0]}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.08}
          color="white"
          outlineWidth={LABEL_OUTLINE_WIDTH}
          outlineColor={LABEL_OUTLINE_COLOR}
          fillOpacity={0}
          outlineOpacity={0}
          material-transparent
          material-depthTest={false}
          material-depthWrite={false}
          material-toneMapped={false}
        >
          {label.toUpperCase()}
        </Text>
      </Billboard>
    </group>
  )
}
