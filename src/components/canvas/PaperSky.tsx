"use client"

import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { useGLTF } from "@/helpers/useGLTF"
import { makeTwineTextures, twineRepeat } from "@/helpers/twineTexture"
import { skyScroll } from "@/helpers/skyScroll"
import { CAMERA_BEHIND, flightBasis, makeFlightBasis, placeInFlightFrame, viewAxisUp } from "@/config/flightFrame"
import { inSkyJourney } from "@/helpers/StateProvider"
import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { VelocityLines } from "@/components/canvas/VelocityLines"
import {
  CLOUD_SCALE,
  CORRIDOR_BEHIND,
  CORRIDOR_CLEAR_RADIUS,
  CORRIDOR_DEPTH,
  CORRIDOR_FAR_AXIAL,
  PROP_FADE_IN_AXIAL,
  ARRIVAL_DROP_WINDOW,
  CORRIDOR_HALF_HEIGHT,
  CORRIDOR_HALF_WIDTH,
  HALF_FOV_H,
  CORRIDOR_POOL,
  CORRIDOR_START_AXIAL,
  CORRIDOR_TRAVEL_PER_OFFSET,
  DROP_SECONDS,
  DROP_STAGGER,
  STRING_TOP,
  SKY_DRESSED_Y,
  ROPE_RADIUS_PROP,
  ROPE_LENGTH,
  STAR_COUNT,
  STAR_LEAD,
  STAR_NATIVE_HEIGHT,
  CLOUD_TOP_NATIVE,
  STAR_OFFSET_SIDE,
  STAR_OFFSET_UP,
  PROP_HALF_W,
  PROP_HALF_H,
  STAR_SCALE,
} from "@/config/paperSky"
import { corridorOrigin, skyCorridorSide, skySectionIndex, skySectionStart, skyTextFocus } from "@/config/skyJourney"

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
 *  THREE: nothing here is simulated. The cutouts hang straight from their
 *  strings -- see the NO PENDULUM note in config/paperSky.ts. */

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
/** ONE MATERIAL PER PROP, so each can carry its own opacity.
 *
 *  The GLTF's material is shared by every instance, so fading one faded all of
 *  them. Cloned per cutout and driven from a ref by its owner's frame loop.
 *
 *  `depthWrite: false` with transparency: a cutout is a flat plane and there
 *  are several of them overlapping down the corridor, so writing depth while
 *  partly transparent makes whichever drew first punch a hole in the ones
 *  behind. */
function useFadeMaterial(
  source: THREE.Material | THREE.Material[],
  opacityRef: React.RefObject<number>,
  /** Publishes the clone to the OWNER, so it can write the opacity in the
   *  same frame it computes it -- see the note in Prop. A callback rather than
   *  a ref parameter: a ref that arrives through render is the caller's value,
   *  and writing through one from a frame callback is what
   *  react-hooks/immutability rejects. */
  onMaterial?: (material: THREE.MeshStandardMaterial) => void,
) {
  // The mesh ref is created HERE and handed back, rather than taken as an
  // argument. Same code either way, but a ref that arrives as a parameter is a
  // value from the caller's render, and writing through it from a frame
  // callback is what react-hooks/immutability rejects.
  const mesh = useRef<THREE.Mesh>(null)
  const owned = useRef<THREE.MeshStandardMaterial | null>(null) as React.RefObject<THREE.MeshStandardMaterial | null> & {
    published?: boolean
  }
  useFrame(() => {
    const node = mesh.current
    if (!node) return
    // Cloned on the first FRAME, not during render.
    //
    // A clone produced by useMemo is a render value, and a frame callback that
    // writes to one is what react-hooks/immutability rejects -- the same trap
    // the prop state and the flight basis in this file already work around.
    // useFrame runs before the frame is drawn, so the swap is never seen.
    const material = (owned.current ??= (() => {
      const base = (Array.isArray(source) ? source[0] : source) as THREE.MeshStandardMaterial
      const clone = base.clone()
      clone.transparent = true
      clone.depthWrite = false
      clone.opacity = 0
      return clone
    })())
    // Re-asserted every frame rather than once: React owns this mesh's
    // `material` prop and puts the shared one back on any re-render.
    if (node.material !== material) node.material = material
    if (!owned.published) { owned.published = true; onMaterial?.(material) }
    material.opacity = opacityRef.current
  })
  return mesh
}

function CloudCutout({
  opacityRef,
  onMaterial,
}: {
  opacityRef: React.RefObject<number>
  onMaterial?: (material: THREE.MeshStandardMaterial) => void
}) {
  const { nodes, materials } = useGLTF("/models/cardboard_cloud.glb")
  const mesh = useFadeMaterial(materials.CBCLOUD01, opacityRef, onMaterial)
  return (
    <mesh
      ref={mesh}
      castShadow
      receiveShadow
      geometry={nodes.Object_2.geometry}
      material={materials.CBCLOUD01}
      rotation={[-Math.PI / 2, 0, 0]}
    />
  )
}

function StarCutout({
  opacityRef,
  onMaterial,
}: {
  opacityRef: React.RefObject<number>
  onMaterial?: (material: THREE.MeshStandardMaterial) => void
}) {
  const { nodes } = useGLTF("/models/cardboard_star.glb")
  const mesh = useFadeMaterial(nodes.mesh_0.material as THREE.Material, opacityRef, onMaterial)
  return (
    <mesh
      ref={mesh}
      castShadow
      receiveShadow
      geometry={nodes.mesh_0.geometry}
      material={nodes.mesh_0.material as THREE.Material}
    />
  )
}

/** The string a cutout hangs from, as ROPE.
 *
 *  A mesh, not a line. Every string here used to be a two-vertex `lineSegments`
 *  with a `lineBasicMaterial`, which is a hairline that cannot be thickened:
 *  WebGL ignores `linewidth` on every desktop driver, so there was no value to
 *  set. A cylinder has a real radius and takes the paper world's light like
 *  everything else, which is what lets it read as twine rather than as a drawn
 *  line.
 *
 *  Geometry is a unit-height cylinder built once at module scope and shared by
 *  every string; each instance only scales and offsets it, so the count of
 *  strings costs nothing in buffers.
 *
 *  `length` is how far it reaches UP from the prop it is tied to, and `radius`
 *  is set by the caller because one value cannot serve every string here: a
 *  corridor prop hangs 120 units away where a world unit is about 12 screen
 *  pixels, and the subject hangs at 6 where it is 220. A single radius is
 *  either invisible on the clouds or a tree trunk on the Dragonite. */
const ROPE_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)

export function Rope({
  lengthRef,
  radius,
  baseRef,
  opacityRef,
  onMaterial,
}: {
  lengthRef: React.RefObject<number>
  radius: number
  /** How far above the owner's origin the string STARTS -- i.e. the top of the
   *  thing it is tied to. Without it the string begins at the cutout's centre
   *  and is drawn straight up through the artwork, which is the rope running
   *  through the middle of a cloud. */
  baseRef?: React.RefObject<number>
  /** THE CORD FADES WITH WHAT IT IS HOLDING.
   *
   *  Without this the cutout fades up from nothing at the far end while its
   *  rope is already at full strength -- so what the reader sees out there is
   *  a length of string hanging in an empty sky with no cloud on it, which is
   *  exactly the note. Omitted by the callers whose rope is never faded (the
   *  sky subject's). */
  opacityRef?: React.RefObject<number>
  /** Publishes this rope's material, same reason as the cutouts'. */
  onMaterial?: (material: THREE.MeshStandardMaterial) => void
}) {
  const ref = useRef<THREE.Mesh>(null)
  const published = useRef(false)
  // TWISTED CORD, NOT A PAINTED TUBE.
  //
  // A cylinder in a flat colour reads as a paper towel roll, which is exactly
  // the note. What is missing is the lay -- the diagonal strands and the
  // shadow in the groove between them. The texture supplies both: as a colour
  // map for the strand-to-groove shading and as a bump map so the light rig
  // actually catches the ridges as the string turns.
  //
  // Per rope, not shared, because the tile count up the length has to change
  // with the length and lives on the Texture. See makeTwineTextures.
  //
  // Built on the first frame rather than by useMemo, for the same reason the
  // cutouts' materials are: a frame callback may not write to a value produced
  // during render, and the tile count has to be written every frame.
  const twineRef = useRef<ReturnType<typeof makeTwineTextures> | null>(null)
  // Driven from a ref, not a prop: the length changes every frame as the prop
  // is lowered in and as the corridor moves under it, and a prop that changes
  // every frame would re-render this component sixty times a second.
  useFrame(() => {
    const m = ref.current
    if (!m) return
    const twine = (twineRef.current ??= makeTwineTextures())
    const material = m.material as THREE.MeshStandardMaterial
    if (material.map !== twine.map) {
      material.map = twine.map
      material.bumpMap = twine.bump
      if (opacityRef) {
        material.transparent = true
        material.depthWrite = false
      }
      // A material that compiled without a map has no sampler in its program;
      // adding one after the fact needs the shader rebuilt. Once, not per frame.
      material.needsUpdate = true
    }
    const base = baseRef?.current ?? 0
    const l = Math.max(0.001, lengthRef.current - base)
    m.scale.set(radius, l, radius)
    // The unit cylinder is centred on its own origin, so half the length puts
    // its bottom end on the prop and its top end at the anchor.
    m.position.y = base + l / 2
    // Tiles are stretched by the same scale as the mesh, so the count has to
    // track the length or the lay grows and shrinks as a prop is lowered in.
    const repeat = twineRepeat(l, radius)
    if (twine.map.repeat.y !== repeat) {
      twine.map.repeat.y = repeat
      twine.bump.repeat.y = repeat
    }
    if (!published.current) { published.current = true; onMaterial?.(material) }
    if (opacityRef) {
      const o = opacityRef.current
      // `transparent` is part of the program's key, so it is set once at the
      // same moment the map is, not toggled as the value crosses 1.
      material.opacity = o
      // Nothing to draw and nothing to sort: a fully faded rope is skipped
      // outright rather than submitted at zero alpha.
      m.visible = o > 0.01
    }
  })
  return (
    // A FADED ROPE STARTS HIDDEN, not at the material's defaults.
    //
    // Everything about the fade is applied from the frame loop, and the first
    // render happens before any frame callback runs -- so for exactly one
    // frame the cord drew at full strength wherever it had been mounted.
    // Caught on the subject's cord, which is mounted early and at altitude:
    // one reading at full opacity with the camera still 80 units below the
    // sky. Declared here, there is no such frame.
    <mesh ref={ref} geometry={ROPE_GEOMETRY} frustumCulled={false} visible={!opacityRef}>
      <meshStandardMaterial
        bumpScale={2.5}
        roughness={0.95}
        metalness={0}
        transparent={!!opacityRef}
        depthWrite={!opacityRef}
        opacity={opacityRef ? 0 : 1}
      />
    </mesh>
  )
}

// -------------------------------------------------------------- the corridor

interface PropState {
  kind: "cloud" | "star"
  /** Which pass through the corridor this prop is currently on. Used to
   *  re-scatter it once per wave, and nothing else. */
  wave: number
  /** Where along the corridor it sits within a wave, in world units. */
  phase: number
  /** Which half of the frame it is in: -1 left, +1 right. Apart from `side`,
   *  which is now a magnitude, because the sign is re-decided as the text
   *  changes sides and the magnitude is not. */
  sideSign: number
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


/** How far out, in screen terms, a prop is held while it is in the words' half.
 *
 *  A SCREEN target, not a world one, and that distinction is the whole reason
 *  this works where the first attempt did not. There was a world-space push
 *  here once -- move anything in the text's half further out by a fixed factor
 *  -- and it made matters worse: the camera aims toward the text, and a yaw
 *  carries world content the other way, so a prop pushed out in world units
 *  was dragged back across the frame and landed under the paragraph. Measured
 *  at ndc -0.28 with the push against +0.10 without it.
 *
 *  Asking for a screen position instead is self-correcting. The offset needed
 *  to sit at a given ndc grows with distance, so a prop far out -- which is
 *  where the wrong side happens, see the side note below -- is held at the
 *  frame's edge, and a prop close, which is already on the correct side, needs
 *  no help and gets none. It is also where the fade has it faintest, so the
 *  holding costs nothing to look at.
 *
 *  The target is the block's OUTER edge (about 0.78 in ndc, since the block is
 *  centred in its half) plus the margin the camera's lean shifts everything
 *  by, and the prop's own half-width is added on top -- what has to clear the
 *  words is the cloud's edge, not its centre. Ignoring the width was the
 *  second version's fault: it parked centres at 0.85 while a close cloud is
 *  0.38 wide in ndc, so half of it was still lying across the paragraph.
 *
 *  1.15 rather than the 0.95 that arithmetic alone suggests, because the
 *  camera aims TOWARD the text and a yaw carries the world the other way:
 *  everything placed here lands about 0.15 nearer the middle than it was put.
 *  Measured with 0.95 -- a prop asked for an inner edge at 0.95 arrived at
 *  0.741, against a block whose outer edge is 0.761. */
const TEXT_EDGE_NDC = 1.15

function scatter(
  state: PropState,
  index: number,
  wave: number,
  seededAt: number,
  partner: number,
) {
  // One sequence position per (slot, wave), so a prop recycled into a given
  // wave always lands in the same place -- scrolling back shows you the sky you
  // just flew through rather than a reshuffled one.
  const k = wave * CORRIDOR_POOL + index
  const { u, v } = r2(k)

  // A paired star draws its placement from its CLOUD's slot, not its own, so
  // the two land on the same spot in the corridor and it appears in front of
  // it. Same wave, same sequence position -- so it tracks the cloud through
  // every recycle without either of them storing the other's state.
  const placementIndex = partner >= 0 ? partner : index
  const { u: pu, v: pv } = partner >= 0 ? r2(wave * CORRIDOR_POOL + partner) : { u, v }
  state.side = CORRIDOR_CLEAR_RADIUS + pu * (CORRIDOR_HALF_WIDTH - CORRIDOR_CLEAR_RADIUS)

  // WHICH HALF: the opposite of the block this crossing belongs to.
  //
  // No prediction any more, and no re-deciding. A crossing now lives entirely
  // inside one block's span (see the section note in the frame loop), so the
  // block that is up when the prop is seeded is the block it will be opposite
  // for the whole of its pass. Earlier versions guessed which block would be
  // up when the prop was at its biggest, because a crossing straddled two.
  state.sideSign = skyCorridorSide(skyScroll.display)

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
  // ALTERNATING BY SECTION, not by slot.
  //
  // The sign used to come from the slot index, which stratified a pool of six
  // neatly into quadrants and does nothing at all for a pool of one: slot 0
  // always resolves to -1, so the single cloud rode below the axis on every
  // single crossing. Measured at -0.25 ndc across fourteen sightings, which
  // is the "clouds are placed too low" of an earlier round in mirror image.
  // Keyed on the section as well, consecutive clouds sit above and below in
  // turn and the field is balanced over the journey rather than within a
  // frame -- which, with one cloud in it, is the only place balance can live.
  const vSign = (wave + placementIndex) % 2 === 0 ? -1 : 1
  state.up = vSign * pv * CORRIDOR_HALF_HEIGHT

  // A second, decorrelated pair for scale and rope. The old version drew both
  // from hashes of the same two numbers, which collided outright at some slots.
  const second = r2(k + 977)
  const range = state.kind === "star" ? STAR_SCALE : CLOUD_SCALE
  state.scale = range[0] + second.u * (range[1] - range[0])
  state.rope = ROPE_LENGTH[0] + second.v * (range === STAR_SCALE ? 0.5 : 1) * (ROPE_LENGTH[1] - ROPE_LENGTH[0])
  state.seededAt = seededAt
}

/** The corridor's seating plan: what each slot is, where along the corridor it
 *  starts, and -- for a star -- which cloud it rides in front of.
 *
 *  A STAR IS NEVER ALONE. Clouds can be, stars cannot: a lone cardboard star on
 *  a striped backdrop has nothing to sit against and reads as a sticker. So
 *  every star is paired with a cloud slot and takes that cloud's lateral and
 *  vertical position, sitting a little nearer the camera. Both travel at the
 *  same rate, so the pairing holds for the whole journey rather than only at
 *  the moment they are seeded.
 *
 *  The cost, stated plainly: side used to alternate strictly by slot parity so
 *  that every wave was exactly half left and half right. A paired star copies
 *  its cloud's side instead, so one slot per pair no longer participates in
 *  that guarantee. Balance across a wave is worth less than a star with
 *  something behind it. */
function makePlan() {
  const span = CORRIDOR_DEPTH + CORRIDOR_BEHIND
  const starEvery = Math.max(2, Math.floor(CORRIDOR_POOL / Math.max(1, STAR_COUNT)))
  const slots = Array.from({ length: CORRIDOR_POOL }, (_, i) => ({
    kind: (i % starEvery === 1 ? "star" : "cloud") as PropState["kind"],
    // A STAGGER, not a station. Where a crossing begins is the section's
    // business now (see startAhead); this only spreads a multi-slot pool out
    // behind the leader so they do not arrive as one clump.
    phase: -(span * i) / CORRIDOR_POOL,
    /** For a star: the slot index of the cloud it sits in front of. */
    partner: -1,
  }))
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].kind !== "star") continue
    // The nearest cloud slot, preferring the one just behind it in the plan so
    // the star ends up in FRONT of its cloud rather than behind it.
    let partner = slots.findIndex((sl, j) => sl.kind === "cloud" && j > i)
    if (partner === -1) partner = slots.findIndex((sl) => sl.kind === "cloud")
    if (partner === -1) { slots[i].kind = "cloud"; continue }
    slots[i].partner = partner
    // Its own phase is unused once paired -- Prop derives the star's position
    // from the cloud's wrap plus STAR_LEAD -- but keep it consistent so the
    // plan reads as what it is.
    slots[i].phase = slots[partner].phase + STAR_LEAD
  }
  return slots
}

/** One prop: a string, and a cutout hanging off it.
 *
 *  Its whole position is recomputed each frame from the scroll, so there is no
 *  stored position to get out of step with where you actually are. */
function Prop({
  kind,
  phase,
  partner,
  partnerPhase,
  index,
  arrived,
  journeyTime,
}: {
  kind: PropState["kind"]
  phase: number
  /** For a star, the slot index of the cloud it rides in front of; -1 if it
   *  stands on its own. See makePlan. */
  partner: number
  /** That cloud's phase, so the star can wrap when the cloud does. */
  partnerPhase: number
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
  const ropeLength = useRef(0)
  const ropeBase = useRef(0)
  const opacity = useRef(0)
  // The materials the children own, published back here so this callback can
  // write them AFTER it has moved the prop. See the recycle note below.
  const cutoutMaterial = useRef<THREE.MeshStandardMaterial | null>(null)
  const ropeMaterial = useRef<THREE.MeshStandardMaterial | null>(null)

  // No delta. Nothing here integrates any more: position is a function of the
  // scroll, the drop is a function of the shared journey clock, and the fade is
  // a function of distance. The frame callback is a sampler.
  useFrame(() => {
    const node = group.current
    const hang = hanger.current
    if (!node || !hang) return

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
      sideSign: -1,
      side: 0,
      up: 0,
      scale: 1,
      rope: ROPE_LENGTH[0],
      seededAt: 0,
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

    // ONE CROSSING PER BLOCK OF TEXT, timed from the block's own start.
    //
    // This was a free-running modulo: props advanced with the scroll and
    // wrapped whenever they reached the near end, on a cycle of their own that
    // had nothing to do with the words. With a pool of six that was fine --
    // there was always a cloud somewhere. With one cloud per block, which is
    // what was asked for, it is not: the cloud's cycle and the block's span
    // drift against each other, so a cloud is born in one block and dies in
    // the next, and whichever side it is given is wrong for part of its life.
    // Held out of the words' half for that part, the only cloud in the sky was
    // off the edge of the frame about a third of the time.
    //
    // Measured from the section instead, the question does not arise. A cloud
    // is seeded at the far end as a block begins, crosses while that block is
    // up -- the crossing and the span are matched to within a few units, see
    // CORRIDOR_TRAVEL_PER_OFFSET -- and is behind the camera before the next
    // block arrives. It spends its whole life opposite one block of text.
    const sectionStart = skySectionStart(skyScroll.display)
    const travelled = (skyScroll.display - sectionStart) * CORRIDOR_TRAVEL_PER_OFFSET
    // THE OPENING'S CLOUD IS ALREADY PART-WAY IN; every later one starts at
    // the far end.
    //
    // CORRIDOR_START_AXIAL exists so the sky is not empty on arrival, and
    // applying it to every section was plainly wrong once the corridor was
    // timed per section: each cloud then began two thirds of the way down the
    // approach, finished in a third of the block's span, and the sky sat
    // empty for the rest of it -- measured as the cloud parked behind the
    // camera for three readings in a row, twice.
    const startAhead = sectionStart === 0 ? CORRIDOR_START_AXIAL - CAMERA_BEHIND : CORRIDOR_DEPTH

    // Distance ahead of the viewer. Recycling is a modulo, not a branch:
    // scrolling backwards has to wrap the same way forwards does, and an
    // `if (passed) station += span` only ever counts one way.
    // A PAIRED STAR RIDES ITS CLOUD'S RECYCLE, not its own.
    //
    // Each prop wraps when its own phase reaches the near end. A star offset
    // STAR_LEAD in front of its cloud therefore reaches that end first and
    // jumps to the far end while its cloud is still coming in -- and for that
    // whole stretch the star is alone at the back with its cloud nowhere near
    // it. Measured: one star sighting in twelve had nothing behind it, all at
    // the wrap. Deriving the star's position from the CLOUD's wrap keeps the
    // two locked together through every recycle, so the offset is the only
    // thing that ever separates them.
    // NO WRAP. A prop crosses once and is done; the next section seeds it
    // again at the far end. Clamped below the near end so a prop that has
    // finished simply waits out of sight behind the camera rather than
    // reappearing -- which is the whole reason the modulo is gone.
    const raw = startAhead + (partner >= 0 ? partnerPhase : state.phase) - travelled
    // The section's ordinal, so the scatter varies from one crossing to the
    // next and its parity means something. See skySectionIndex.
    const wave = skySectionIndex(skyScroll.display) + 1
    const cloudAhead = Math.max(raw, -CORRIDOR_BEHIND)
    // The lead SHRINKS as the pair comes in, and it has to.
    //
    // A fixed 7-unit lead put the star seven units nearer than its cloud at
    // every distance -- including at the near end, where the cloud retires at
    // CORRIDOR_NEAR_AXIAL and the star was therefore still coming, seven units
    // closer than anything is allowed to get. Measured: a star at axial 4.1,
    // filling the frame, retired while still plainly on screen.
    //
    // Proportional to distance, it is a full seven units out at the spawn --
    // where it is needed, to read as two cutouts at different depths -- and a
    // fraction of a unit by the time the pair leaves, where all it has to do
    // is settle the depth sort.
    //
    // The distance it scales by is FLOORED, because the corridor's near end is
    // now behind the lens: past the camera the axial distance goes through zero
    // and out the other side, which would flip the lead's sign and throw the
    // star to the far side of its cloud. Floored, the pair simply freezes its
    // relative geometry for the last few units, all of which are off screen.
    // The PAIR's distance: a star's every lateral decision is made from its
    // cloud's, so the two cannot drift apart. See the pairing note below.
    const cloudAxial = Math.max(1, cloudAhead + CAMERA_BEHIND)
    const ahead =
      cloudAhead + (partner >= 0 ? (STAR_LEAD * cloudAxial) / CORRIDOR_FAR_AXIAL : 0)
    // ...and IN FRONT OF IT ON SCREEN, not merely beside it.
    //
    // The star copies its cloud's lateral and vertical offset, but it sits
    // nearer the camera -- and the same world offset at a shorter distance
    // subtends a LARGER angle, so the two drifted apart across the frame. The
    // offsets are scaled by the ratio of their distances, which is exactly the
    // factor that keeps both projecting to the same point.
    const pairScale = partner >= 0 ? Math.max(1, ahead + CAMERA_BEHIND) / cloudAxial : 1

    if (state.wave !== wave) {
      // ONE DARK FRAME AT THE RECYCLE, and this is the pop.
      //
      // A recycle moves a prop a whole corridor-span at once -- from behind
      // your head to the far end, 160 units. Its opacity is written to the
      // material by the CUTOUT's own frame callback, and a child's callback is
      // registered before its parent's, so on the frame of the jump the cutout
      // paints the opacity computed for where the prop USED to be: solid,
      // because it was right on top of you. The result is one frame of a
      // fully opaque cloud at the far end of the corridor, which is exactly
      // the "clouds pop in" in the recording. Measured: slot 2 read opacity 1
      // at axial 124 where the ramp says 0.2.
      //
      // Skipping the frame looked like enough and was not: it leaves the
      // material at zero while the position is still the old near one, so the
      // desync simply moved. The fix is at the bottom of this callback --
      // the opacity is written into the materials THERE, after the position
      // has been set, instead of being left in a ref for the children to read
      // on their next turn.
      scatter(state, index, wave, journeyTime.current + index * DROP_STAGGER, partner)
      state.wave = wave
    }

    // FADE IN AT THE FAR END, AND NEVER FADE OUT.
    //
    // "They shouldn't just appear, they should fade in, and they should never
    // disappear, they should just go past the camera." A prop's opacity is a
    // pure function of how far away it is: nothing at CORRIDOR_FAR_AXIAL, solid
    // by PROP_FADE_IN_AXIAL, and solid from there all the way past the lens. It
    // is deliberately not a function of time or of the recycle, so a prop
    // cannot be caught mid-fade by anything other than its own distance -- and
    // scrolling backwards fades it back out along the same curve rather than
    // snapping.
    const axial = ahead + CAMERA_BEHIND
    opacity.current = THREE.MathUtils.clamp(
      (CORRIDOR_FAR_AXIAL - axial) / Math.max(1, CORRIDOR_FAR_AXIAL - PROP_FADE_IN_AXIAL),
      0,
      1,
    )

    // How far into its drop -- on a CLOCK, measured from when this prop was
    // seeded, not from how far away it is. See DROP_SECONDS.
    //
    // ONLY THE ARRIVAL WAVE DROPS. The drop is the marionette moment when the
    // sky dresses itself, and it is staged for a reader who has just got here.
    // Re-running it on every recycle was the second half of the reported bug:
    // a prop is recycled at CORRIDOR_FAR_AXIAL, where STRING_TOP is far above
    // the top of the frame, so the drop happened entirely off screen and all
    // the reader saw was a cloud that had not been there a moment ago. Past the
    // arrival window a prop is simply seeded at its resting height and fades up.
    const since = journeyTime.current - state.seededAt
    const droppedBy =
      state.seededAt > ARRIVAL_DROP_WINDOW
        ? 1
        : THREE.MathUtils.clamp(since / DROP_SECONDS, 0, 1)
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
    // A paired star is offset into its cloud's lower right -- see
    // STAR_OFFSET_*. Both offsets go through pairScale with everything else, so
    // they describe a position ON the cloud as seen from the camera rather than
    // beside it in world space.
    const restUp =
      viewAxisUp(ahead) + (state.up + (partner >= 0 ? STAR_OFFSET_UP * PROP_HALF_H : 0)) * pairScale
    const currentUp = STRING_TOP + (restUp - STRING_TOP) * eased

    // Placed in the FLIGHT FRAME, so the corridor banks with the camera and
    // props always approach down the view axis.
    // NEVER THE SAME SIDE AS THE WORDS, and the side only ever changes while
    // the prop cannot be seen -- chosen for the text that will be up when it
    // is at its biggest, not the text that is up as it is born.
    //
    // "The cloud should alternate from left to right side, and text should as
    // well, but opposite sides." A prop is on screen for roughly a thousand
    // units of scroll and the text changes sides three times across three
    // thousand, so no side chosen once at birth is right for a whole pass --
    // that was tried, and so was pushing the offending props further out,
    // which the camera's lean simply dragged back across the frame.
    //
    // Re-deciding it live is the answer, and the fade is what makes it free:
    // out at the far end a prop is fully transparent, so it can be moved from
    // one half to the other with nothing to see. Once it has any opacity at
    // all its side is fixed for the rest of its pass. At most one prop per
    // hand-over is still carrying the old side, and by then it is nearly gone.
    // A PAIRED STAR IS PINNED TO ITS CLOUD, so every lateral decision it makes
    // is made from the CLOUD's distance, not its own. A star rides STAR_LEAD
    // in front of its cloud and its offsets are scaled by pairScale so the two
    // project to the same point -- computed from its own distance, the star
    // was held out by a different amount than the cloud it sits on and slid
    // off it. Measured: two star sightings in twelve with nothing behind them.
    const laneAxial = partner >= 0 ? cloudAxial : axial

    // HELD AT THE EDGE WHILE IT IS IN THE WORDS' HALF.
    //
    // The side above is chosen for where a prop will be when it is biggest, so
    // the near, loud part of every pass is opposite the text. What that cannot
    // fix is the far part: a prop is in shot across about 105 units of flying
    // and a section of text lasts 150, so most props are born in the section
    // BEFORE the one their side was chosen for, and spend their approach on
    // the wrong side of the frame.
    //
    // They are pushed out to the frame's edge for exactly as long as that is
    // true. The amount is derived from the distance, so it is large out where
    // the problem is and nothing by the time the prop is close; the weight is
    // the camera's own lean, which crosses zero smoothly at every hand-over,
    // so a prop eases out and back rather than jumping.
    const focus = skyTextFocus(skyScroll.display)
    const lean = focus.lean
    // Sharper than the lean itself. The lean crosses zero gently across a whole
    // hand-over, which is right for a camera and wrong for this: at the middle
    // of a crossing the push is at half strength and a close cloud, which is
    // most of a half-frame wide, still reaches under the paragraph. Measured
    // at a hand-over: a cloud spanning 0.32..1.76 against a block at
    // 0.18..0.76. Tripled, the prop is clear for all but the first third of
    // the crossing, and still slides rather than jumps.
    const onWordsSide = Math.min(1, Math.max(0, state.sideSign * lean) * 3)
    // AND BOTH HALVES ARE CLEARED WHILE THE WORDS CHANGE SIDES.
    //
    // At a hand-over the lean passes through zero, so `onWordsSide` is weak
    // for exactly the moment the block jumps from one half to the other --
    // measured at a lean of 0.18, where a push of 0.53 left two clouds lying
    // across the paragraph's outer third. Sharpening the ramp further would
    // fix the arithmetic and cost more than it saves: the push is thirty-odd
    // world units, and asking for it inside a couple of units of travel turns
    // a slide into a dart.
    //
    // The stage is cleared instead. Near the crossing -- and only there --
    // props on BOTH sides are held out, so whichever half the words land in is
    // already empty, and they come back in on the far side of it. It costs a
    // brief moment of open sky, which is a beat rather than a fault.
    //
    // ONLY WHERE THERE ARE WORDS. The lean is also zero for the whole opening
    // stretch, before the first block is due (SKY_TEXT_LEAD) -- and read as a
    // crossing that held every prop off the edge of the frame for it.
    // Measured: the one cloud in the corridor sitting at ndc 1.5 to 4.8 for
    // the entire wordless arrival, which is the sky looking empty at exactly
    // the moment there was supposed to be a cloud in it.
    const crossing = focus.index < 0 ? 0 : Math.max(0, 1 - Math.abs(lean) * 1.5)
    const inTextHalf = Math.max(onWordsSide, crossing)
    const clearOf = TEXT_EDGE_NDC * laneAxial * Math.tan(HALF_FOV_H) + PROP_HALF_W
    const magnitude = state.side + Math.max(0, clearOf - state.side) * inTextHalf
    placeInFlightFrame(
      flightBasis(skyScroll.display, (basisRef.current ??= makeFlightBasis())),
      corridorOrigin(skyScroll.display, (originRef.current ??= { x: 0, y: 0, z: 0 })),
      ahead,
      (magnitude * state.sideSign + (partner >= 0 ? STAR_OFFSET_SIDE * PROP_HALF_W * state.sideSign : 0)) *
        pairScale,
      currentUp,
      node.position,
    )

    // Square to the camera. These are flat cutouts, and the frame can turn --
    // without this they are seen edge-on the moment the heading is anything
    // but zero, which is what turned the caption cards into slivers.
    hang.rotation.y = basisRef.current ? Math.atan2(basisRef.current.fx, basisRef.current.fz) + Math.PI : Math.PI
    hang.position.y = 0
    hang.scale.setScalar(state.scale)

    // Straight up to the anchor, in the group's own space. The anchor is a
    // fixed height for every prop (STRING_TOP), so every string reaches the
    // same line above the frame instead of starting in mid-air wherever its
    // own rope happened to begin.
    ropeLength.current = STRING_TOP - currentUp
    // Tie it to the TOP of the cutout, not its middle.
    ropeBase.current =
      ((kind === "star" ? STAR_NATIVE_HEIGHT : CLOUD_TOP_NATIVE * 2) / 2) * state.scale

    // THE OPACITY IS WRITTEN HERE, WITH THE POSITION IT BELONGS TO.
    //
    // It used to be left in a ref for the cutout's and the rope's own frame
    // callbacks to read. A child's callback is registered before its parent's,
    // so those two always painted the value computed for the PREVIOUS frame --
    // harmless while a prop drifts a few units, and a visible fault at the one
    // moment it does not: a recycle moves it a whole corridor-span at once, so
    // the frame of the jump drew a fully opaque cloud at the far end. That is
    // the pop. Written from here, the two cannot disagree at all.
    // Published for the same reason the journey's offset is -- see PaperWorld.
    // Which half a prop thinks it is in, and how hard it is being held out of
    // the words' way, are the two numbers that decide the composition, and
    // neither is recoverable from where it ends up on screen.
    node.userData.sideSign = state.sideSign
    node.userData.inTextHalf = inTextHalf
    node.userData.axial = axial
    if (cutoutMaterial.current) cutoutMaterial.current.opacity = opacity.current
    if (ropeMaterial.current) {
      ropeMaterial.current.opacity = opacity.current
    }
  })

  return (
    // Named, so the corridor's props can be told apart from everything else
    // hanging off the paper world's root -- the backdrop and the velocity
    // lines are children of it too, and both carry a fading material. A probe
    // that walked the root's children and took the widest mesh in each read
    // the backdrop's altitude crossfade as a prop that was mysteriously
    // dimming at close range.
    <group ref={group} name="sky-prop">
      {/* A PAIRED STAR HAS NO STRING OF ITS OWN.
          
          It is pinned to the lower corner of its cloud, so a string from the
          ceiling to the star has to cross the cloud to reach it -- which is
          the rope seen running straight through a cloud. The cloud is what
          hangs; the star rides on it. An unpaired star, if the plan ever emits
          one, still gets its own. */}
      {partner < 0 && (
        <Rope
          lengthRef={ropeLength}
          radius={ROPE_RADIUS_PROP}
          baseRef={ropeBase}
          opacityRef={opacity}
          onMaterial={(m) => { ropeMaterial.current = m }}
        />
      )}
      {/* The hanger is offset DOWN by the rope length and rotated about its own
          origin, which is the string's top -- so the prop swings from the
          string rather than spinning about its own middle. */}
      <group ref={hanger}>
        {kind === "cloud" ? (
          <CloudCutout opacityRef={opacity} onMaterial={(m) => { cutoutMaterial.current = m }} />
        ) : (
          <StarCutout opacityRef={opacity} onMaterial={(m) => { cutoutMaterial.current = m }} />
        )}
      </group>
    </group>
  )
}

/* THE CAPTIONS ARE NOT IN THE SCENE ANY MORE.
 *
 * They used to hang here as paper cards on strings, one per cue. The note was
 * "remove the signs with text" -- and the reference is right: a sign hanging
 * in the sky is a prop that happens to have words on it, and it can only carry
 * three or four of them before the type is too small to read at the distance
 * the cards have to hold. What replaces it is an editorial block set in the
 * DOM, opposite the subject, with the camera leaning away to leave it the room
 * -- see skyTextFocus in config/skyJourney.ts and SkyCaption in app/page.tsx.
 *
 * The cue table itself is unchanged and still lives in config/skyJourney.ts:
 * it is the same axis the choreography is keyed to. */

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
    // ONLY ON THE WAY OUT.
    //
    // This used to reset the clock whenever the journey flag turned TRUE --
    // which is the moment the camera lands, a second or so after the altitude
    // trigger already dressed the sky. Zeroing it there made every prop's
    // `since` negative, so the whole field snapped back to the top of its
    // string and dropped again: the clouds appearing, vanishing as the
    // Dragonite arrives, and coming back. Arriving is now entirely the
    // altitude trigger's business; this only cleans up for the next visit.
    if (journeyValue) return
    arrived.current = false
    journeyTime.current = 0
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
  // Dressed by ALTITUDE, not by arrival.
  //
  // `arrived` used to be the journey atom, which flips when the camera stops --
  // so the props began their drop against a finished backdrop that had been
  // sitting empty for about a second. They come in as the backdrop completes
  // instead, while the camera is still on its way up.
  useFrame((state, rawDelta) => {
    // Where the journey has got to, published on the world's own node.
    //
    // The scroll lives in module state inside the bundle, so nothing outside
    // it -- a probe included -- can say where the reader is on the axis, and
    // the corridor's motion is only an indirect read of it. One write per
    // frame on the node the world is already identified by makes the journey
    // observable, which is what lets the coast and the holds be measured at
    // all rather than inferred from how a cloud happens to be moving.
    if (state.scene.getObjectByName("paper-sky")) {
      const root = state.scene.getObjectByName("paper-sky")!
      root.userData.skyOffset = skyScroll.display
      root.userData.lean = skyTextFocus(skyScroll.display).lean
      root.userData.textSide = skyTextFocus(skyScroll.display).side
    }
    if (!arrived.current && state.camera.position.y >= SKY_DRESSED_Y) arrived.current = true
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
          partner={slot.partner}
          partnerPhase={slot.partner >= 0 ? plan[slot.partner].phase : 0}
          index={i}
          arrived={arrived}
          journeyTime={journeyTime}
        />
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
