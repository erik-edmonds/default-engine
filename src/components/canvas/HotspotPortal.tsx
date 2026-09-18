"use client"

import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import Frame from "@/components/canvas/Card"
import { prefersReducedMotion } from "@/helpers/motion"

// A portfolio portal standing permanently in the island scene at a hotspot's
// viewpoint, with a carved frame around it so it reads as something built
// rather than a rectangle hanging in the air.
//
// The portal itself is the ORIGINAL <Frame> from Card.tsx -- the same
// component app/portfolio renders, with its own Text labels, rounded-plane
// geometry, MeshPortalMaterial and double-click-to-enter behaviour. Nothing
// about it is reimplemented here; this only places it and builds the frame.
//
// Navigation is unchanged: the ring markers (CameraHotspot.tsx) still own it.
// Click a ring, the camera flies to that viewpoint, and this is what's waiting
// in front of it.

const FRAME_THICKNESS = 0.08
const FRAME_DEPTH = 0.11
const FRAME_COLOR = "black"

// Card.tsx's own defaults -- WIDTH * 1.5 and GOLDEN_RATIO * 1.5. Repeated here
// so the carved frame can be built to match the portal it surrounds; if those
// defaults ever change, these follow.
const PORTAL_WIDTH = 1.5
export const PORTAL_HEIGHT = 1.61803398875 * 1.5

/** Distance in front of a viewpoint at which its portal stands. At fov 45 a
 *  ~2.43-tall portal covers roughly two-thirds of frame height here: dominant
 *  enough to be the subject, open enough that the scene still reads round it. */
export const PORTAL_VIEW_DISTANCE = 4.5

/** Where a portal goes for a given camera viewpoint. The plane's +Z is its
 *  normal, so giving it the camera's own rotation points it straight back at
 *  the camera (which looks down its own -Z). */
export function portalTransformFor(
  viewpointPosition: THREE.Vector3,
  viewpointRotation: THREE.Euler,
  distance = PORTAL_VIEW_DISTANCE,
) {
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(viewpointRotation)
  return {
    position: viewpointPosition.clone().addScaledVector(forward, distance),
    rotation: viewpointRotation.clone(),
    forward,
  }
}

/** Carved surround: four bars and four corner blocks, sized to Card.tsx's
 *  rounded-rectangle portal. Rectangular rather than an arch precisely so it
 *  matches that original shape -- an arch would leave the portal's square
 *  corners poking out of it. Low segment counts + flatShading to sit in the
 *  island's faceted art style, and a standard material so it picks up the
 *  time-of-day rig like any other object on the island. */
function CarvedFrame({ width, height }: { width: number; height: number }) {
  const outerW = width + FRAME_THICKNESS
  const outerH = height + FRAME_THICKNESS
  // Black in both states, deliberately. An earlier version had the frame catch
  // a warm light when its portal went live; the frame is meant to read as a
  // carved surround, and lighting it made the surround the subject. What wakes
  // is the room behind it -- see PortalRoom.
  const bar = (args: [number, number, number], position: [number, number, number], key: string) => (
    // Named so a test can find the frame positively rather than by guessing at
    // "black meshes" -- the same lesson as island-terrain in Scene.tsx.
    <mesh key={key} name="portal-frame-bar" castShadow receiveShadow position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={FRAME_COLOR} roughness={0.9} flatShading />
    </mesh>
  )

  return (
    <group>
      {bar([outerW, FRAME_THICKNESS, FRAME_DEPTH], [0, outerH / 2, 0], "top")}
      {bar([outerW, FRAME_THICKNESS, FRAME_DEPTH], [0, -outerH / 2, 0], "bottom")}
      {bar([FRAME_THICKNESS, outerH, FRAME_DEPTH], [-outerW / 2, 0, 0], "left")}
      {bar([FRAME_THICKNESS, outerH, FRAME_DEPTH], [outerW / 2, 0, 0], "right")}
      {/* Corner blocks -- the join detail that stops it reading as four
          extruded rectangles meeting at nothing. */}
      {/* {[
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].map(([sx, sy]) =>
        bar(
          [FRAME_THICKNESS * 1.5, FRAME_THICKNESS * 1.5, FRAME_DEPTH * 1.4],
          [(sx * outerW) / 2, (sy * outerH) / 2, 0],
          `corner-${sx}-${sy}`,
        ),
      )} 
      {[-1, 1].map((sx) =>
        bar(
          [FRAME_THICKNESS * 2.2, FRAME_THICKNESS * 0.7, FRAME_DEPTH * 1.8],
          [(sx * outerW) / 2, -outerH / 2 - FRAME_THICKNESS * 0.7, 0],
          `plinth-${sx}`,
        ),
      )} */}
    </group>
  )
}

// --- arriving ---------------------------------------------------------------
//
// `interactive` says a destination has been REQUESTED, not that the camera has
// got there. page.tsx sets it synchronously on the click, and its own comment
// is explicit that it is "never gated on the camera actually finishing its
// flight". So it leads arrival by the whole flight on a ring click or a rail
// tap, and by the spring's settle time on a scroll -- which is why the portal
// used to come into frame already lit, with the switch-on happening somewhere
// off the side of the screen.
//
// Arrival is detected from the camera itself instead, and that turns out to be
// exact rather than approximate:
//
//   - CameraShake writes rotation only, never position, and is unmounted
//     unless lightning is actually striking.
//   - CameraLook writes the quaternion only, and mounts on desktop only.
//   - the journey spring hard-snaps u to its target at JOURNEY_REST_EPSILON
//     and then writes a bit-identical position every frame.
//   - on desktop, once a flight ends nothing writes camera.position at all.
//
// So when you are parked the camera is not nearly still, it is exactly still,
// and a speed test is a step function rather than a threshold to tune.

/** How close to its own viewpoint the camera has to be for a portal to count
 *  the arrival as its own. Generous -- the flight ends ON the viewpoint -- but
 *  far tighter than the gap between any two destinations. */
const ARRIVED_RADIUS = 1.5
/** Below this, in world units per second, the camera is stopped. */
const ARRIVED_SPEED = 0.02
/** How long it has to stay stopped before the light starts: the beat. Short
 *  enough not to read as a fault, long enough that the room is visibly dark
 *  for a moment after you get there. */
const ARRIVED_BEAT = 0.35
/** ...and how long the room then takes to come up, and to go back down when
 *  you leave. A fixed-duration ramp rather than easing.damp, so the swell has
 *  a duration that can be asserted and reads as deliberate rather than as a
 *  value relaxing toward a target. */
const ROOM_SWELL_SECONDS = 1.5
const ROOM_FADE_SECONDS = 0.4
/** How fast the settle timer bleeds away when the camera is moving again.
 *  Faster than it fills, so leaving is decisive, but not a hard reset -- one
 *  stuttered frame should not put the light out. */
const SETTLE_DECAY = 3

/** The near-black an unlit portal reads as. Not pure black: a flat #000 looks
 *  like a hole cut in the scene, whereas a hair above it still reads as a
 *  surface with nothing shining on it. */
const ROOM_DARK = "#070707"

/** Card.tsx's own `bg` default, repeated so the lit background matches what
 *  Card would have painted when a portal is given no colour of its own. */
const PORTAL_DEFAULT_BG = "#f0f0f0"

/** The room's two lights at full. There is no environment map inside a portal
 *  -- MeshPortalMaterial renders its children into a scene of their own -- so
 *  these are the *only* light the contents ever get, and the numbers are
 *  absolute rather than a top-up on ambient. */
const KEY_INTENSITY = 3
const FILL_INTENSITY = 1.5

/** The room behind the window.
 *
 *  Card.tsx renders its children into the portal's own scene, and that scene
 *  has no lighting whatsoever -- no lights, no environment. So this is not a
 *  glow effect layered over a lit interior; it is the interior's entire light
 *  rig, and taking it to zero genuinely leaves the room dark.
 *
 *  The background has to move with the lights or the illusion collapses: a
 *  `<color attach="background">` is unlit fill and renders at full strength
 *  whether or not anything is switched on, so an unlit portal would otherwise
 *  be a pale grey rectangle. Rendered here, after Card.tsx's own background,
 *  this one attaches second and wins. */
function PortalRoom({ id, live, bg }: { id: string; live: RefObject<{ value: number }>; bg: string }) {
  const key = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.AmbientLight>(null)
  const background = useRef<THREE.Color>(null)
  const lit = useMemo(() => new THREE.Color(bg), [bg])
  const dark = useMemo(() => new THREE.Color(ROOM_DARK), [])

  // Reads the ramp rather than owning it. HotspotPortal drives it, because
  // deciding whether the camera has arrived needs the camera, and this half of
  // the component lives inside MeshPortalMaterial -- a scene of its own. The
  // parent mounts first, so at the same frame priority its callback runs first
  // and this reads a value computed this frame, not last one.
  useFrame(() => {
    const v = live.current.value
    if (key.current) key.current.intensity = v * KEY_INTENSITY
    if (fill.current) fill.current.intensity = v * FILL_INTENSITY
    if (background.current) background.current.copy(dark).lerp(lit, v)
  })

  return (
    <>
      {/* Stays at the top level: attach="background" attaches to its PARENT,
          and inside the group below that parent would be the group. */}
      <color ref={background} attach="background" args={[ROOM_DARK]} />
      {/* Named for the portal it belongs to. A portal's contents live in a
          scene of their own, so from outside there is otherwise no handle on
          which room is which -- and "is the right one lit" is the whole
          question worth asking about this. */}
      <group name={`portal-room-${id}`}>
        <ambientLight name="portal-room-fill" ref={fill} intensity={0} />
        <directionalLight name="portal-room-key" ref={key} position={[2, 3, 4]} intensity={0} />
      </group>
    </>
  )
}

export interface HotspotPortalProps {
  position: THREE.Vector3
  rotation: THREE.Euler
  /** Passed straight through to Card.tsx's Frame -- this is the id its own
   *  wouter route (`/item/:id`) matches on to blend itself open. */
  id: string
  name: string
  author: string
  bg?: string
  /** Whether this portal can be opened right now -- true only once the camera
   *  is actually at the hotspot it stands in front of. The portal is always
   *  visible either way; this only controls whether it answers the pointer. */
  interactive?: boolean
  /** True when this is the portal currently entered (the `/item/:id` route).
   *
   *  Inside a portal the material's blend is 1 and its scene IS the screen, so
   *  the room has to be lit whatever the camera is doing -- the arrival
   *  detection below is about walking up to a window from outside, and it does
   *  not describe standing in the room. Without this, landing on a shared
   *  /item/:id link put you inside a dark, empty box. */
  open?: boolean
  /** The portal's contents, e.g. <Gltf src="/models/tea.glb" />. */
  children: ReactNode
}

/** The breathe: a scale swing this small is below the threshold of "something
 *  is animating" and above the threshold of "something is alive". */
const BREATHE_AMOUNT = 0.012
const BREATHE_SPEED = 1.15

export function HotspotPortal({ position, rotation, id, name, author, bg, interactive = true, open = false, children }: HotspotPortalProps) {
  const group = useRef<THREE.Group>(null)
  // Shared with PortalRoom, which lives in the portal's own scene and cannot
  // work this out for itself. The REF is handed down, not its contents -- both
  // sides touch `.current` only inside useFrame, never during render.
  const live = useRef({ value: 0 })
  // Whether the room's contents are worth rendering at all.
  //
  // MeshPortalMaterial redraws each portal's scene into its own render target
  // EVERY frame, whether or not you are looking through it -- so three portals
  // holding real content (a 1400-point cloud, a globe, a 118k-vert skinned
  // avatar) is three extra scenes drawn per frame, permanently. That measurably
  // slowed the whole page: time-to-first-paint of the name stamp went from ~14s
  // to ~19s on a software renderer.
  //
  // An unlit room shows nothing anyway -- no light, near-black background --
  // so not drawing its contents while it is dark is invisible and nearly free.
  // Tied to the light's own ramp rather than to `interactive` so the contents
  // outlast the fade-down and nothing pops out mid-dim.
  const [roomAwake, setRoomAwake] = useState(false)
  /** Seconds the camera has been stopped here, and where it was last frame. */
  const settled = useRef(0)
  const lastCameraPosition = useMemo(() => new THREE.Vector3(), [])
  const hasLastPosition = useRef(false)

  // Where the camera stands when it is looking at this portal. The exact
  // inverse of portalTransformFor: that put the portal PORTAL_VIEW_DISTANCE in
  // front of the viewpoint along the view axis, so the viewpoint is the same
  // distance back down it.
  const viewpoint = useMemo(
    () => position.clone().addScaledVector(new THREE.Vector3(0, 0, -1).applyEuler(rotation), -PORTAL_VIEW_DISTANCE),
    [position, rotation],
  )

  // Each portal breathes on its own clock, or all three pulse in lockstep and
  // the scene reads as machinery rather than as three separate things.
  //
  // Derived from the id rather than Math.random(): a random seed is impure
  // during render, and this is better anyway -- the same portal breathes on
  // the same phase every load, so the scene is reproducible.
  const phase = useMemo(() => {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
    return (h / 997) * Math.PI * 2
  }, [id])

  // The arrival: has the camera come to a stop in front of THIS window?
  //
  // The breathe rides the same ramp as the light, so the portal wakes as one
  // thing rather than stirring before the room comes up.
  useFrame((state, dt) => {
    const camera = state.camera
    // REAL elapsed seconds, only capped against a tab that was backgrounded.
    // Not the 1/30 clamp the journey spring uses: that exists so one long
    // frame cannot integrate a huge step into an integrator, and applying it
    // to a wall-clock timer measures the beat in FRAMES instead of seconds --
    // on a device rendering at 0.7fps the 0.35s beat became fifteen seconds and
    // the light never arrived at all.
    const step = Math.min(dt, 0.5)

    let atRest = false
    if (hasLastPosition.current) {
      atRest = step > 0 && camera.position.distanceTo(lastCameraPosition) / step < ARRIVED_SPEED
    }
    lastCameraPosition.copy(camera.position)
    hasLastPosition.current = true

    const here = interactive && camera.position.distanceTo(viewpoint) < ARRIVED_RADIUS
    settled.current = Math.max(0, settled.current + (here && atRest ? step : -step * SETTLE_DECAY))

    // `open` short-circuits the beat: you are not approaching the room, you
    // are standing in it.
    const target = open || settled.current >= ARRIVED_BEAT ? 1 : 0
    if (prefersReducedMotion()) {
      // The journey spring already snaps under this setting; a 1.5s swell
      // would be the only thing left drifting.
      live.current.value = target
    } else {
      const seconds = target === 1 ? ROOM_SWELL_SECONDS : ROOM_FADE_SECONDS
      const ramp = THREE.MathUtils.clamp(live.current.value + ((target === 1 ? 1 : -1) * step) / seconds, 0, 1)
      live.current.value = ramp
    }

    const v = live.current.value
    // Flips at most twice per visit, so this is not a per-frame setState.
    const shouldBeAwake = open || interactive || v > 0.001
    if (shouldBeAwake !== roomAwake) setRoomAwake(shouldBeAwake)
    if (group.current) {
      const breathe = 1 + v * BREATHE_AMOUNT * Math.sin(state.clock.elapsedTime * BREATHE_SPEED + phase)
      group.current.scale.setScalar(breathe)
    }
  })

  return (
    <group ref={group} position={position} rotation={rotation}>
      <CarvedFrame width={PORTAL_WIDTH} height={PORTAL_HEIGHT} />
      <Frame id={id} name={name} author={author} bg={bg} interactive={interactive}>
        {/* Inside <MeshPortalMaterial>, so these belong to the portal's own
            scene rather than to the island. */}
        <PortalRoom id={id} live={live} bg={bg ?? PORTAL_DEFAULT_BG} />
        {roomAwake && children}
      </Frame>
    </group>
  )
}
