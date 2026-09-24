"use client"

import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { Text } from "@react-three/drei"
import { suspend } from "suspend-react"

import { useGLTF } from "@/helpers/useGLTF"
import { skyScroll } from "@/helpers/skyScroll"
import { flightBasis, makeFlightBasis, placeInFlightFrame, viewAxisUp } from "@/config/flightFrame"
import { inSkyJourney } from "@/helpers/StateProvider"
import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { VelocityLines } from "@/components/canvas/VelocityLines"
import {
  CAPTION_CHAR_WIDTH,
  CAPTION_DEPTH,
  CAPTION_FONT_SIZE,
  CAPTION_HALF_HEIGHT,
  CAPTION_SLOTS,
  CAPTION_SWING_MAX,
  CAPTION_EASE,
  CAPTION_THICKNESS,
  CLOUD_SCALE,
  MAX_ANCHOR_STEP,
  CORRIDOR_BEHIND,
  CORRIDOR_CLEAR_RADIUS,
  CORRIDOR_DEPTH,
  CORRIDOR_HALF_HEIGHT,
  CORRIDOR_HALF_WIDTH,
  CORRIDOR_POOL,
  CORRIDOR_TRAVEL_PER_OFFSET,
  DROP_HEIGHT,
  DROP_SECONDS,
  DROP_STAGGER,
  STRING_TOP,
  ROPE_LENGTH,
  STAR_COUNT,
  STAR_SCALE,
  SWING_DAMPING,
  SWING_DRIVE,
  SWING_MAX,
  SWING_STIFFNESS,
} from "@/config/paperSky"
import { SKY_JOURNEY_DISTANCE, SKY_TEXT_CUES, corridorOrigin } from "@/config/skyJourney"

const bold = import("@pmndrs/assets/fonts/inter_bold.woff")

/** The paper world at the top of the sky journey.
 *
 *  A corridor you fly along, not a tableau you arrive at. Props stream toward
 *  you as you scroll, pass, and are recycled ahead; each is lowered in on its
 *  string as it comes into view, so the marionette drop happens continually
 *  rather than once.
 *
 *  Three things about how it is built are load-bearing.
 *
 *  ONE: travel is driven by scroll DISTANCE, not by a clock. Every position
 *  here is a function of skyScroll.display, so scrolling slowly moves the world
 *  slowly, stopping stops it, and scrolling back reverses it. The previous
 *  version staged its drops on a wall-clock timer, so the world arrived on its
 *  own schedule regardless of what you did.
 *
 *  TWO: the props are a fixed POOL that recycles. Nothing mounts or unmounts
 *  mid-journey, so the scene graph and the draw count are constant and there is
 *  no allocation in flight. It also bounds the cost of the star, which is
 *  330,894 triangles as supplied.
 *
 *  THREE: the swing is a procedural pendulum, not a physics body. Two floats
 *  per prop -- angle and angular velocity -- driven by how fast its string is
 *  moving sideways. An earlier version used rapier, and travelling 26 rigid
 *  bodies on 13 spherical joints down a corridor is precisely the situation
 *  that once sent them out of the world at six hundred thousand units. A
 *  pendulum cannot be violated, costs nothing, and reads the same. */

// --------------------------------------------------------------- the models

/** The cloud, with its own material.
 *
 *  Using the supplied models' materials as authored, which is the point:
 *  cardboard_cloud.glb ships a `CBCLOUD01` PBR material with base-colour,
 *  roughness and normal maps. A previous version loaded these GLBs for their
 *  GEOMETRY only and drew everything with a flat white MeshBasicMaterial -- so
 *  22MB of texture was decoded, uploaded and never bound to anything, and what
 *  you saw were white silhouettes of the models rather than the models.
 *
 *  Because these are lit materials, the journey brings its own light rig (see
 *  Environment.tsx): the island's four-role cinematic rig is aimed at a target
 *  160 units below and is strongly orange at evening. */
function CloudCutout() {
  const { nodes, materials } = useGLTF("/models/cardboard_cloud.glb")
  return (
    <mesh
      castShadow
      receiveShadow
      geometry={nodes.Object_2.geometry}
      material={materials.CBCLOUD01}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  )
}

/** The star. Its material is unnamed in the file, so there is no `materials.X`
 *  to reach it by -- r3f keys that record by material name, and an unnamed one
 *  lands under "". It comes off the node instead, which is what the supplied
 *  CardboardStar component does. */
function StarCutout() {
  const { nodes } = useGLTF("/models/cardboard_star.glb")
  return <mesh castShadow receiveShadow geometry={nodes.mesh_0.geometry} material={nodes.mesh_0.material} />
}

// -------------------------------------------------------------- the corridor

interface PropState {
  kind: "cloud" | "star"
  /** Which pass through the corridor this prop is currently on. Used to
   *  re-scatter it once per wave, and nothing else. */
  wave: number
  /** Where along the corridor it sits within a wave, in world units. */
  phase: number
  /** Lateral offset in FLIGHT-FRAME coordinates -- to the frame's right, not
   *  along world x. This is what makes props bank with the camera instead of
   *  crossing the frame as it turns. */
  side: number
  up: number
  scale: number
  rope: number
  /** Journey seconds at which this prop was (re)seeded; its drop is measured
   *  from here. See DROP_SECONDS. */
  seededAt: number
  /** Pendulum. */
  angle: number
  angVel: number
  /** Previous anchor x, or NaN meaning "not seeded yet".
   *
   *  The drive is a difference over delta, so it needs a previous sample to be
   *  a difference at all. Seeded at 0 it read the prop's whole world x as one
   *  frame of motion -- 14 units in 1/30s -- and threw the pendulum straight
   *  into its clamp on the first frame it was visible. A recycled prop re-rolls
   *  its side, which teleports x, and did it again. NaN says "no previous
   *  sample": take one, drive nothing. */
  lastAnchorX: number
}

/** How hard the string is being dragged sideways, as a lateral rate.
 *
 *  Returns 0 both when there is no previous sample (NaN) and when the anchor
 *  has jumped further than any one frame of real flight could carry it. Both
 *  cases are teleports rather than motion, and feeding a teleport to a spring
 *  puts it on its clamp and leaves it there for a second or two -- which is
 *  what a tilted, apparently-stuck cutout actually is. */
function swingDrive(previous: number, current: number, delta: number) {
  if (delta <= 0 || !Number.isFinite(previous)) return 0
  const moved = current - previous
  if (Math.abs(moved) > MAX_ANCHOR_STEP) return 0
  return moved / delta
}

/** Deterministic, evenly-spread placement.
 *
 *  Two properties matter, and the old version had neither reliably.
 *
 *  BALANCED SIDES. The previous scatter took an angle from a sin-hash. That
 *  hash is unbiased in aggregate -- 1423 left / 1377 right over 2800 samples --
 *  but it is deterministic, so the same draw happens on every visit, and the
 *  draw you see on arrival was 6 left / 2 right. An average is no comfort when
 *  the sample is frozen. Side now comes from the slot's parity, so every wave
 *  is exactly half and half by construction rather than by luck.
 *
 *  EVEN SPREAD. Magnitudes come from the R2 low-discrepancy sequence rather
 *  than a hash, because R2 is even over any CONSECUTIVE RUN and not merely in
 *  the limit -- which is the property a pool of fourteen visible props needs.
 *
 *  And `up` is REMAPPED, not clamped. The old polar scheme clamped
 *  sin(angle)*radius to +/-15 with radius up to 26, pinning roughly one prop in
 *  four to exactly the corridor ceiling or floor: two horizontal rails. */

/** The plastic constant -- the 2D analogue of the golden ratio. */
const R2_A = 0.7548776662466927
const R2_B = 0.5698402909980532

/** Allocates, deliberately. This runs once per prop per WAVE -- roughly twice
 *  a second at the fastest scroll -- not once per frame, so a scratch object
 *  saves nothing measurable and a mutable binding at module scope in a
 *  component file is what react-hooks/immutability objects to. */
function r2(index: number) {
  return { u: frac(0.5 + R2_A * (index + 1)), v: frac(0.5 + R2_B * (index + 1)) }
}

/** The fractional part, for negative arguments too.
 *
 *  `x % 1` is a REMAINDER in JavaScript and keeps the sign of the dividend, so
 *  it returns -0.78 rather than 0.22 for -1.78. The corridor's first wave is
 *  numbered -1 -- the far end of the pool at scroll zero -- which makes the
 *  sequence index negative, and every prop in that wave came out with a
 *  negative u and v. Measured: `up` of -28.55 against a band of +/-11.16, and
 *  `side` of -24.71 against a clearance the whole corridor is supposed to
 *  guarantee at 32.03. That is four of the five props you see on arrival, off
 *  the bottom of the frame and inside the avatar's cone.
 *
 *  This was latent until CORRIDOR_BEHIND went negative: while the corridor ran
 *  PAST the camera the wave was never below zero. */
function frac(x: number) {
  return x - Math.floor(x)
}

function scatter(state: PropState, index: number, wave: number, seededAt: number) {
  // One sequence position per (slot, wave), so a prop recycled into a given
  // wave always lands in the same place -- scrolling back shows you the sky you
  // just flew through rather than a reshuffled one.
  const k = wave * CORRIDOR_POOL + index
  const { u, v } = r2(k)

  const side = index % 2 === 0 ? -1 : 1
  state.side = side * (CORRIDOR_CLEAR_RADIUS + u * (CORRIDOR_HALF_WIDTH - CORRIDOR_CLEAR_RADIUS))

  // Height is STRATIFIED too, and on a different bit of the index than the
  // side is, so the two do not correlate: side alternates every slot and height
  // every two, which puts exactly one prop in each of the four quadrants per
  // wave.
  //
  // Signing it rather than mapping v across the whole band is what keeps the
  // field centred. R2 is evenly SPREAD over a short run but it is not
  // zero-MEAN over one -- its first four values average -0.151 -- and with a
  // pool of four that bias is the whole vertical placement: measured at -0.138
  // ndc, the band sitting a seventh of a screen low. Stratified, the mean is
  // zero by construction however few props there are.
  //
  // There is no vertical clearance band. Clearing the avatar is the LATERAL
  // offset's job, and it does it at every distance, so height is simply height.
  const vSign = (index >> 1) % 2 === 0 ? -1 : 1
  state.up = vSign * v * CORRIDOR_HALF_HEIGHT

  // A second, decorrelated pair for scale and rope. The old version drew both
  // from hashes of the same two numbers, which collided outright at some slots.
  const second = r2(k + 977)
  const range = state.kind === "star" ? STAR_SCALE : CLOUD_SCALE
  state.scale = range[0] + second.u * (range[1] - range[0])
  state.rope = ROPE_LENGTH[0] + second.v * (range === STAR_SCALE ? 0.5 : 1) * (ROPE_LENGTH[1] - ROPE_LENGTH[0])
  state.seededAt = seededAt
  state.angle = 0
  state.angVel = 0
  // Re-seeding re-rolls `side`, which teleports the anchor. Forget the previous
  // sample so that jump is not read as motion.
  state.lastAnchorX = Number.NaN
}

/** The corridor's seating plan: what each slot is and where along the corridor
 *  it starts. Plain data -- the mutable half lives in each Prop's own ref. */
function makePlan() {
  const span = CORRIDOR_DEPTH + CORRIDOR_BEHIND
  const starEvery = Math.max(2, Math.floor(CORRIDOR_POOL / STAR_COUNT))
  return Array.from({ length: CORRIDOR_POOL }, (_, i) => ({
    // Stars spread through the pool rather than clustered, so one recycle wave
    // never delivers both at once.
    kind: (i % starEvery === 1 ? "star" : "cloud") as PropState["kind"],
    // Spread from the FAR end inward. Starting at 0 put one prop at
    // ahead = -9.86 on the very first frame -- already behind the camera, so
    // the pool was effectively thirteen of fourteen.
    phase: CORRIDOR_DEPTH - (span * i) / CORRIDOR_POOL,
  }))
}

/** One prop: a string, and a cutout hanging off it.
 *
 *  Its whole position is recomputed each frame from the scroll, so there is no
 *  stored position to get out of step with where you actually are. */
function Prop({
  kind,
  phase,
  index,
  arrived,
  journeyTime,
}: {
  kind: PropState["kind"]
  phase: number
  index: number
  /** Has the camera finished climbing? Shared, so all the props agree. */
  arrived: React.RefObject<boolean>
  /** Seconds since arrival, advanced by the world, read by every prop. */
  journeyTime: React.RefObject<number>
}) {
  // The prop owns its own mutable state, created on its first frame.
  //
  // Two things rule out the obvious spellings. Passed down from a pool in the
  // parent, a per-frame callback mutating it is writing to a PROP -- a value
  // that arrived through render is not this component's to change. Built with
  // useRef and unwrapped here, reading `.current` is a ref access DURING
  // RENDER. Built lazily inside the frame callback, it is neither: the ref is
  // only ever touched from the frame loop, which is where it belongs. */
  const stateRef = useRef<PropState | null>(null)
  // Created lazily in the frame loop, not by useMemo.
  //
  // flightBasis() WRITES into this object every frame, and a value produced by
  // useMemo arrives through render -- mutating it is what
  // react-hooks/immutability objects to. A ref filled on first use is only ever
  // touched from the frame callback, which is where it belongs.
  const basisRef = useRef<ReturnType<typeof makeFlightBasis> | null>(null)
  const originRef = useRef<{ x: number; y: number; z: number } | null>(null)
  const group = useRef<THREE.Group>(null)
  const hanger = useRef<THREE.Group>(null)
  const lineRef = useRef<THREE.LineSegments>(null)
  const points = useMemo(() => new Float32Array(6), [])

  useFrame((_s, rawDelta) => {
    const node = group.current
    const hang = hanger.current
    if (!node || !hang) return
    const delta = Math.min(rawDelta, 1 / 30)

    const state = (stateRef.current ??= {
      kind,
      // NaN, not -1: NaN never equals anything, so the first frame always
      // scatters. A sentinel that is a real number has to be outside the range
      // the wave arithmetic can produce -- and `floor((CORRIDOR_BEHIND - raw) /
      // span) + 1` produces -1 for the far end of the corridor now that
      // CORRIDOR_BEHIND is negative. Props whose phase landed there matched the
      // sentinel on their first frame and were never scattered at all: they sat
      // on the flight axis at the model's native 232-unit width.
      wave: Number.NaN,
      phase,
      side: 0,
      up: 0,
      scale: 1,
      rope: ROPE_LENGTH[0],
      seededAt: 0,
      angle: 0,
      angVel: 0,
      lastAnchorX: Number.NaN,
    })

    // Nothing exists until the camera has actually arrived.
    //
    // The world is mounted early on purpose, so its 22MB of texture resolves
    // during the climb rather than stalling the hand-over -- but mounting is
    // not arriving, and the previous version let the props live their whole
    // drop during those five seconds. By the time the camera got here the show
    // was over for ten of the fourteen.
    if (!arrived.current) {
      node.visible = false
      return
    }
    node.visible = true

    // Scroll position and nothing else. See the NO DRIFT note in config.
    const travelled = skyScroll.display * CORRIDOR_TRAVEL_PER_OFFSET
    const span = CORRIDOR_DEPTH + CORRIDOR_BEHIND

    // Distance ahead of the viewer. Recycling is a modulo, not a branch:
    // scrolling backwards has to wrap the same way forwards does, and an
    // `if (passed) station += span` only ever counts one way.
    const raw = state.phase - travelled
    const wave = Math.floor((CORRIDOR_BEHIND - raw) / span) + 1
    const ahead = ((raw + CORRIDOR_BEHIND) % span + span) % span - CORRIDOR_BEHIND

    if (state.wave !== wave) {
      // Seeded with a per-slot stagger so arrival reads as a sequence of props
      // being lowered in rather than one simultaneous clatter.
      scatter(state, index, wave, journeyTime.current + index * DROP_STAGGER)
      state.wave = wave
    }

    // How far into its drop -- on a CLOCK, measured from when this prop was
    // seeded, not from how far away it is. See DROP_SECONDS.
    const since = journeyTime.current - state.seededAt
    const droppedBy = THREE.MathUtils.clamp(since / DROP_SECONDS, 0, 1)
    const eased = 1 - Math.pow(1 - droppedBy, 3)
    // Lowered from the string's top down to its resting height. The prop
    // starts AT the anchor and descends, so the string is paying out rather
    // than the prop falling on a fixed-length rope -- which is what a
    // puppeteer does, and what the reference shows.
    // Resting height is measured from the VIEW AXIS at this depth, not from a
    // horizontal plane through the avatar -- see viewAxisUp. The string's top
    // stays at a fixed height above the corridor origin, so the drop is still
    // "lowered from above the frame" and the rope simply pays out further for
    // a prop that rests lower.
    const restUp = viewAxisUp(ahead) + state.up
    const currentUp = STRING_TOP + (restUp - STRING_TOP) * eased

    // Placed in the FLIGHT FRAME, so the corridor banks with the camera and
    // props always approach down the view axis.
    placeInFlightFrame(
      flightBasis(skyScroll.display, (basisRef.current ??= makeFlightBasis())),
      corridorOrigin(skyScroll.display, (originRef.current ??= { x: 0, y: 0, z: 0 })),
      ahead,
      state.side,
      currentUp,
      node.position,
    )

    // The pendulum, driven by how hard the string is being dragged sideways.
    const anchorX = node.position.x
    const anchorAccel = swingDrive(state.lastAnchorX, anchorX, delta)
    state.lastAnchorX = anchorX
    state.angVel +=
      (-SWING_STIFFNESS * state.angle - SWING_DAMPING * state.angVel + anchorAccel * SWING_DRIVE) * delta
    state.angle = THREE.MathUtils.clamp(state.angle + state.angVel * delta, -SWING_MAX, SWING_MAX)

    hang.rotation.z = state.angle
    // Square to the camera. These are flat cutouts, and the frame can turn --
    // without this they are seen edge-on the moment the heading is anything
    // but zero, which is what turned the caption cards into slivers.
    hang.rotation.y = basisRef.current ? Math.atan2(basisRef.current.fx, basisRef.current.fz) + Math.PI : Math.PI
    hang.position.y = 0
    hang.scale.setScalar(state.scale)

    const attr = lineRef.current?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined
    if (attr) {
      // Straight up to the anchor, in the group's own space. The anchor is a
      // fixed height for every prop (STRING_TOP), so every string reaches the
      // same line above the frame instead of starting in mid-air wherever its
      // own rope happened to begin.
      attr.setXYZ(0, 0, STRING_TOP - currentUp, 0)
      attr.setXYZ(1, 0, 0, 0)
      attr.needsUpdate = true
    }
  })

  return (
    <group ref={group}>
      <lineSegments ref={lineRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#6f8296" transparent opacity={0.5} />
      </lineSegments>
      {/* The hanger is offset DOWN by the rope length and rotated about its own
          origin, which is the string's top -- so the prop swings from the
          string rather than spinning about its own middle. */}
      <group ref={hanger}>{kind === "cloud" ? <CloudCutout /> : <StarCutout />}</group>
    </group>
  )
}

// -------------------------------------------------------------- the captions

/** A caption, as a cutout on a string, timed to its own scroll cue.
 *
 *  These used to hang all at once for the whole journey. They are cues on the
 *  same 0..600 axis the choreography uses -- 75, 225, 375, 525 -- so each now
 *  flies in as its threshold approaches and falls away behind once passed,
 *  which is the behaviour those thresholds were written for.
 *
 *  The visible text is 3D, so a screen reader gets nothing from it: the DOM
 *  live region carrying these same cues is in page.tsx and stays. */
function Caption({ cue, index }: { cue: (typeof SKY_TEXT_CUES)[number]; index: number }) {
  const font = (suspend(bold) as { default: string }).default
  const group = useRef<THREE.Group>(null)
  const hanger = useRef<THREE.Group>(null)
  const lineRef = useRef<THREE.LineSegments>(null)
  const points = useMemo(() => new Float32Array(6), [])
  // Created lazily in the frame loop, not by useMemo.
  //
  // flightBasis() WRITES into this object every frame, and a value produced by
  // useMemo arrives through render -- mutating it is what
  // react-hooks/immutability objects to. A ref filled on first use is only ever
  // touched from the frame callback, which is where it belongs.
  const basisRef = useRef<ReturnType<typeof makeFlightBasis> | null>(null)
  const originRef = useRef<{ x: number; y: number; z: number } | null>(null)
  const swing = useRef({ angle: 0, angVel: 0, lastX: Number.NaN })

  const slot = CAPTION_SLOTS[index] ?? CAPTION_SLOTS[CAPTION_SLOTS.length - 1]
  const width = Math.max(2.6, cue.text.length * CAPTION_CHAR_WIDTH)
  // This card owns the axis from its own cue to the next one. The first owns
  // everything before its cue too, so the sky is never captionless on arrival;
  // the last runs to the end of the journey.
  const spanStart = index === 0 ? 0 : cue.threshold
  const spanEnd = SKY_TEXT_CUES[index + 1]?.threshold ?? SKY_JOURNEY_DISTANCE
  const spanLength = Math.max(1, spanEnd - spanStart)

  // THE CARD IS CUT FROM THE SAME CARDBOARD AS THE CLOUDS.
  //
  // It used to be two MeshBasicMaterials with `toneMapped: false`, which is
  // why it read as a flat chip stuck onto the picture: unlit, and opted out of
  // the AgX curve that every cloud and star around it goes through. So it could
  // not pick up PAPER_LIGHT, could not take the paper grain, and could not sit
  // in the same tonal range as its neighbours however its colour was chosen.
  //
  // CBCLOUD01 carries a base-colour, a metallic-roughness and a tangent-space
  // normal map. Cloned so the tint below cannot leak back into the clouds, and
  // warmed towards manila so the dark ink still reads against it.
  const cloudGltf = useGLTF("/models/cardboard_cloud.glb")
  const { face, shadow } = useMemo(() => {
    const source = cloudGltf.materials.CBCLOUD01 as THREE.MeshStandardMaterial
    const faceMaterial = source.clone()
    faceMaterial.color = new THREE.Color("#d8c8a6")
    faceMaterial.side = THREE.DoubleSide
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: "#6f8296",
      transparent: true,
      opacity: 0.38,
      toneMapped: false,
      depthWrite: false,
    })
    return { face: faceMaterial, shadow: shadowMaterial }
  }, [cloudGltf])

  useFrame((_s, rawDelta) => {
    const node = group.current
    const hang = hanger.current
    if (!node || !hang) return
    const delta = Math.min(rawDelta, 1 / 30)

    // A caption is CURRENT from its own cue until the next one.
    //
    // Trapezoid rather than a triangle: it rises over CAPTION_EASE, holds at
    // full for the body of its span, and falls over the last CAPTION_EASE --
    // and its fall ends exactly where the next card's rise begins, so there is
    // one card up at all times and never two.
    const into = skyScroll.display - spanStart
    const nearness =
      into < 0 || into >= spanLength
        ? 0
        : Math.max(0, Math.min(1, into / CAPTION_EASE, (spanLength - into) / CAPTION_EASE))

    const visible = nearness > 0
    node.visible = visible
    // Hidden means the next appearance starts clean: no stale previous sample
    // to difference against, and no angle left over from last time.
    if (!visible) {
      swing.current.lastX = Number.NaN
      swing.current.angle = 0
      swing.current.angVel = 0
      return
    }

    // Held at a fixed depth rather than flown down the corridor -- see
    // CAPTION_DEPTH. It is lowered in as its cue approaches and lifted back out
    // as the cue passes, so the marionette idea survives without the text ever
    // sweeping across the frame.
    const depth = CAPTION_DEPTH
    const eased = nearness * nearness * (3 - 2 * nearness)
    placeInFlightFrame(
      flightBasis(skyScroll.display, (basisRef.current ??= makeFlightBasis())),
      corridorOrigin(skyScroll.display, (originRef.current ??= { x: 0, y: 0, z: 0 })),
      depth,
      slot.x,
      slot.y + DROP_HEIGHT * (1 - eased),
      node.position,
    )

    const s = swing.current
    const accel = swingDrive(s.lastX, node.position.x, delta)
    s.lastX = node.position.x
    s.angVel += (-SWING_STIFFNESS * s.angle - SWING_DAMPING * s.angVel + accel * SWING_DRIVE) * delta
    // CAPTION_SWING_MAX, not SWING_MAX -- this is the one thing in the world
    // the viewer has to read, and it tilts far less than a cutout does.
    s.angle = THREE.MathUtils.clamp(s.angle + s.angVel * delta, -CAPTION_SWING_MAX, CAPTION_SWING_MAX)
    hang.rotation.z = s.angle
    hang.rotation.y = basisRef.current ? Math.atan2(basisRef.current.fx, basisRef.current.fz) + Math.PI : Math.PI
    hang.position.y = 0

    const attr = lineRef.current?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined
    if (attr) {
      attr.setXYZ(0, 0, STRING_TOP - (slot.y + DROP_HEIGHT * (1 - eased)), 0)
      attr.setXYZ(1, 0, 0, 0)
      attr.needsUpdate = true
    }
  })

  return (
    <group ref={group}>
      <lineSegments ref={lineRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#6f8296" transparent opacity={0.5} />
      </lineSegments>
      <group ref={hanger}>
        {/* CAPTION_THICKNESS, not 0.12: at the old value the card was a
            12cm slab and its edge caught the key light as a bright bar down
            the side. Card stock, standing a few millimetres off the backdrop
            like every other cutout here. */}
        <mesh material={shadow} position={[0.16, -0.16, -0.06]}>
          <boxGeometry args={[width, CAPTION_HALF_HEIGHT * 2, CAPTION_THICKNESS]} />
        </mesh>
        <mesh castShadow receiveShadow material={face}>
          <boxGeometry args={[width, CAPTION_HALF_HEIGHT * 2, CAPTION_THICKNESS]} />
        </mesh>
        <Text
          font={font}
          fontSize={CAPTION_FONT_SIZE}
          color="#33475c"
          anchorX="center"
          anchorY="middle"
          position={[0, 0, 0.08]}
          material-toneMapped={false}
        >
          {cue.text}
        </Text>
      </group>
    </group>
  )
}

// --------------------------------------------------------------------- root

function PaperWorld() {
  const plan = useMemo(() => makePlan(), [])
  // UPLOAD THE PAPER WORLD'S TEXTURES NOW, not on the frame it first appears.
  //
  // A GPU upload happens on first RENDER, not on mount. The backdrop now fades
  // in with altitude, so the first frame any of this is visible is partway UP
  // the climb -- and 22MB of texture across two GLBs uploading on one frame in
  // the middle of a five-second tween is a stall exactly where a stall is most
  // visible. gsap runs with lagSmoothing(0) here, so a stalled tween resumes
  // further along than it should: the pause, and then a catch-up.
  //
  // initTexture does the upload on demand. This component mounts a beat after
  // the island starts, while nothing is animating, which is when the work
  // should be paid for.
  const gl = useThree((s) => s.gl)
  const cloud = useGLTF("/models/cardboard_cloud.glb")
  const star = useGLTF("/models/cardboard_star.glb")
  useEffect(() => {
    const seen = new Set<THREE.Texture>()
    for (const root of [cloud.scene, star.scene]) {
      root?.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh) return
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const value of Object.values(mat ?? {})) {
            if (value instanceof THREE.Texture && !seen.has(value)) {
              seen.add(value)
              gl.initTexture(value)
            }
          }
        }
      })
    }
  }, [gl, cloud, star])
  // One arrival flag and one clock, shared by every prop, so they cannot
  // disagree about when the journey started.
  const journeyValue = useAtomValue(inSkyJourney)
  const arrived = useRef(journeyValue)
  const journeyTime = useRef(0)
  useEffect(() => {
    arrived.current = journeyValue
    if (journeyValue) journeyTime.current = 0
  }, [journeyValue])

  // Advanced HERE, once, by the component that owns it.
  //
  // Each Prop used to do `journeyTime.current += delta` in its own useFrame, so
  // the one shared clock was advanced once per prop per frame -- seven times
  // over. DROP_SECONDS of 1.25 then elapsed in about 0.18s of wall time, which
  // is the marionette drop the whole arrival was rebuilt to show, running
  // sevenfold fast. The immutability lint on that line was pointing at a real
  // defect and not merely at a style: a ref arriving through props has an owner
  // somewhere else, and this is what writing to it from a child costs.
  //
  //  And it is advanced by the REAL delta, deliberately unclamped. Everywhere
  //  else in this app a delta is clamped to 1/30 because it integrates a
  //  spring, and an unclamped step there diverges. This is not an integrator,
  //  it is a wall clock: clamping it made DROP_SECONDS mean "38 frames" rather
  //  than "1.25 seconds", so the drop ran at whatever the frame rate happened
  //  to be. Measured under a software renderer, props sat at 41.1 units above
  //  the camera -- the top of a 42-unit string -- nine seconds after arrival,
  //  having barely started to fall.
  useFrame((_s, rawDelta) => {
    if (!arrived.current) return
    journeyTime.current += rawDelta
  })

  return (
    <>
      {plan.map((slot, i) => (
        <Prop
          key={i}
          kind={slot.kind}
          phase={slot.phase}
          index={i}
          arrived={arrived}
          journeyTime={journeyTime}
        />
      ))}
      {SKY_TEXT_CUES.map((cue, i) => (
        <Caption key={cue.text} cue={cue} index={i} />
      ))}
      <VelocityLines />
    </>
  )
}

/** Mounted for the journey, and for the climb into it.
 *
 *  `active` is deliberately NOT the same thing as "the journey has started":
 *  page.tsx turns this on as the fly-up begins, so the GLBs, their 22MB of
 *  texture and troika's font atlas all resolve during the five seconds of the
 *  climb rather than landing as a stall on the frame the journey takes over --
 *  which is the same frame that already carries the rotation hand-over. */
export function PaperSky({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <Suspense fallback={null}>
      {/* Named so the checks can identify the whole world by one node. */}
      <group name="paper-sky">
        <PaperWorld />
      </group>
    </Suspense>
  )
}

useGLTF.preload("/models/cardboard_cloud.glb")
useGLTF.preload("/models/cardboard_star.glb")
