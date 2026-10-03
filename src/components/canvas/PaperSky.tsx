"use client"

import { Suspense, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { useGLTF } from "@/helpers/useGLTF"
import { makeTwineTextures, twineRepeat } from "@/helpers/twineTexture"
import { skyScroll } from "@/helpers/skyScroll"
import { frameHalfWidth, skyFrame, skyPropScale } from "@/helpers/skyFrame"
import { CAMERA_BEHIND, flightBasis, makeFlightBasis, placeInFlightFrame, viewAxisUp } from "@/config/flightFrame"
import { inSkyJourney } from "@/helpers/StateProvider"
import { useAtomValue } from "jotai"
import { useEffect } from "react"
import { VelocityLines } from "@/components/canvas/VelocityLines"
import { SkyCard } from "@/components/canvas/SkyCard"
import {
  CLOUD_SCALE,
  CORRIDOR_BEHIND,
  CORRIDOR_DEPTH,
  EDGE_CLOUD_COUNT,
  EDGE_CLOUD_DEPTH,
  EDGE_CLOUD_FADE_AXIAL,
  EDGE_CLOUD_OPACITY,
  EDGE_CLOUD_RISE,
  EDGE_CLOUD_SCALE,
  EDGE_CLOUD_SIDE_NDC,
  CORRIDOR_POOL,
  CORRIDOR_TRAVEL_PER_OFFSET,
  PROP_DROP_NDC,
  PROP_HALF_W,
  PROP_HALF_H,
  PROP_DROP_UNTIL,
  PROP_FAR_AXIAL,
  PROP_NEAR_AXIAL,
  PROP_RISE_WORLD,
  PROP_SIDE_NDC,
  PROP_CENTRED_SIDE_SCALE,
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
  STAR_SCALE,
} from "@/config/paperSky"
import {
  corridorOrigin,
  skyCorridorSide,
  skyCardOpen,
  skySectionIndex,
  skySectionSpan,
  skyTextFocus,
} from "@/config/skyJourney"

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
      // DEPTH WRITING STAYS ON, and the star is why.
      //
      // Turning it off is the usual move for a transparent material, and it
      // is correct for a flat cutout: the cloud is a single plane, so it has
      // nothing to sort against itself. The star is not flat. It is an
      // extruded solid -- the model runs from z -0.31 to +0.30 -- and its
      // material is authored doubleSided and OPAQUE. Without depth writing
      // its own back faces draw over its front in whatever order the buffer
      // happens to be in, which is the star appearing with pieces of itself
      // missing and a differently-shaded shape sitting inside its outline.
      //
      // Nothing here needs the old behaviour any more: props no longer fade
      // at all -- they arrive from above the frame and leave past the lens,
      // so their opacity is a constant 1 -- and a material that is never
      // actually translucent loses nothing by writing depth like a solid.
      clone.depthWrite = true
      clone.opacity = 1
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
  order = 0,
}: {
  opacityRef: React.RefObject<number>
  onMaterial?: (material: THREE.MeshStandardMaterial) => void
  /** Draw order against the other cutouts -- see the note in Prop. */
  order?: number
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
      renderOrder={order}
    />
  )
}

function StarCutout({
  opacityRef,
  onMaterial,
  order = 0,
}: {
  opacityRef: React.RefObject<number>
  onMaterial?: (material: THREE.MeshStandardMaterial) => void
  /** Draw order against the other cutouts -- see the note in Prop. */
  order?: number
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
      renderOrder={order}
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
  order = 0,
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
  /** Paint order against the rest of the sky. Default 0, which is where a
   *  cloud's own cord belongs -- with its cloud.
   *
   *  The SUBJECT's cord passes -1, so it paints before the block of words
   *  (renderOrder 0) and the string runs BEHIND the type. Transparent objects
   *  otherwise sort back-to-front by distance, and the cord is at 6.3 units
   *  against the caption's 62, so it would always be painted last and across
   *  the words -- which is the reason the cord used to be switched off
   *  entirely in portrait. It cannot occlude anything by depth either way:
   *  a faded cord sets depthWrite false. */
  order?: number
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
    // Named so a rope can be told apart from the thing it is holding. Asked
    // for by a report that "the rope is far off of the dragonite": the
    // subject's own cord is not drawn in portrait at all
    // (SUBJECT_ROPE_IN_PORTRAIT), so a rope in that frame belongs to a cloud
    // -- and with nothing named, a probe could not say which, and neither
    // could the eye.
    <mesh ref={ref} name="sky-rope" geometry={ROPE_GEOMETRY} renderOrder={order} frustumCulled={false} visible={!opacityRef}>
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


/* TEXT_EDGE_NDC and the lane push are GONE.
 *
 * They held a prop out past the frame's edge whenever it was in the words'
 * half, which was a workaround for a cloud whose side could be wrong for
 * part of its pass. A cloud now belongs to one block for its whole life and
 * sits at a fixed place on the opposite side, so there is nothing to push --
 * and the push had become the fault itself: it keyed off the camera's lean,
 * and once the lean was made to hold at zero until the words were close
 * (LEAN_FROM), `1 - |lean| * 1.5` sat at full strength for most of every
 * section and shoved the only cloud in the sky to ndc 1.15 plus its own
 * half-width -- entirely out of shot. That is the "clouds aren't even fully
 * in frame" and the huge gap marked on the screenshot. */

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
  const { v: pv } = partner >= 0 ? r2(wave * CORRIDOR_POOL + partner) : { v }
  // A world offset, lightly varied. See PROP_SIDE_WORLD: the cloud flies
  // past at a fixed distance from the axis, so it grows and sweeps outward
  // like anything else you pass -- what it must never do is ARRIVE at an
  // edge, and it does not, because it is lowered in at ndc 0.15 .. 0.58.
  // Further out, and below the axis, on the contact card -- see
  // PROP_CENTRED_SIDE_SCALE. That block is centred and the camera does not
  // lean for it, so neither of the two things that normally keep a cloud off
  // the words is working.
  const centred = skyTextFocus(skyScroll.display).centred === true
  // MEASURED AGAINST THE FRAME THAT IS ACTUALLY ON SCREEN, once, here.
  //
  // PROP_SIDE_NDC is a fraction of the half-frame at the far end of the
  // approach; turning it into a world distance at seeding time is what lets
  // the cloud hold that distance for the rest of its pass and sweep out
  // through the side as it arrives. A landscape window gets the 20 units this
  // used to be hardcoded to; a phone gets the number that means the same
  // thing in a frame 3.9 times narrower.
  const farHalfWidth = frameHalfWidth(PROP_FAR_AXIAL - CAMERA_BEHIND)
  state.side =
    PROP_SIDE_NDC * farHalfWidth * (0.9 + 0.2 * u) * (centred ? PROP_CENTRED_SIDE_SCALE : 1)

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
  const vSign = centred ? -1 : (wave + placementIndex) % 2 === 0 ? -1 : 1
  // World units, like the lateral. The band stays centred at every distance
  // because it is measured from viewAxisUp, not from a horizontal plane --
  // which is what fixed "the clouds are placed too high" originally.
  state.up = vSign * pv * PROP_RISE_WORLD

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
    // BEHIND AN OPEN CARD THERE IS NO SKY TO SEE.
    //
    // A card grows until it covers the frame, but it stands sixty units down
    // the corridor and the props travel between it and the lens -- so a cloud
    // at PROP_NEAR_AXIAL would sail across the middle of what is supposed to
    // be a scene of its own. Hidden outright rather than faded: by the time
    // the card is half open it already covers most of the picture, and a
    // prop going out at that point is behind the card anyway.
    if (skyCardOpen(skyScroll.display) > 0.5) {
      node.visible = false
      return
    }
    node.visible = true

    // ONE CLOUD PER BLOCK, LOWERED IN AND LIFTED OUT.
    //
    // See PROP_SIDE_NDC in config/paperSky for the whole argument. In short:
    // a prop used to travel a fixed WORLD offset from the axis, which makes
    // its angular offset grow as it comes in, which is a sideways exit -- and
    // the reader has now said four times that clouds must not come in or go
    // out at the sides. There is no lateral travel here any more. The prop
    // holds a fixed place in the frame and moves only in depth and height.
    const span = skySectionSpan(skyScroll.display)
    const sectionPhase = THREE.MathUtils.clamp(
      (skyScroll.display - span.start) / Math.max(1, span.end - span.start),
      0,
      1,
    )
    // The section's ordinal, so the scatter varies from one block to the next
    // and its parity means something. See skySectionIndex.
    const wave = skySectionIndex(skyScroll.display) + 1
    if (state.wave !== wave) {
      scatter(state, index, wave, journeyTime.current + index * DROP_STAGGER, partner)
      state.wave = wave
    }

    // Depth. The cloud closes on the camera across the whole section, which is
    // the forward motion -- it grows by about a third from end to end -- but
    // it never gets near enough to have to leave through the side.
    const cloudAxial = PROP_FAR_AXIAL + (PROP_NEAR_AXIAL - PROP_FAR_AXIAL) * sectionPhase
    // A paired star rides a little in front of its cloud. Because every offset
    // below is expressed as a FRACTION OF THE FRAME and evaluated at each
    // prop's own distance, the two project to the same point automatically --
    // which is what the old pairScale was computing by hand.
    // STAR_LEAD is NEGATIVE -- it is an offset, not a distance -- so it is
    // added. Subtracting it put the star behind its cloud instead of in
    // front of it.
    const axial = cloudAxial + (partner >= 0 ? STAR_LEAD : 0)
    const ahead = axial - CAMERA_BEHIND
    // THE LIVE LENS, not the design one. frameV was always honest -- three's
    // fov is vertical -- but frameH was tan(HALF_FOV_H), frozen at 16:10, and
    // it is the number `sideNdc` below is reported in. That is why sixteen
    // green probe suites never noticed that the whole scene falls outside a
    // portrait frame: they were being told the design frame's NDC.
    const frameH = Math.max(1, axial) * skyFrame.tanH
    const frameV = Math.max(1, axial) * skyFrame.tanV
    // A STAR'S OFFSET IS A FRACTION OF ITS CLOUD, NOT OF THE FRAME.
    //
    // STAR_OFFSET_SIDE/UP have always been multiples of the cloud's own half
    // width and height. Handing them straight to a frame-relative placement
    // read 0.46 of a HALF-SCREEN instead of 0.46 of a cloud, which very
    // nearly cancelled the cloud's own 0.45 offset and parked the star on the
    // flight axis -- sitting on the subject's head, which is where it was
    // measured. Converted through the cloud's angular size, the pair holds
    // together at any distance.
    // A STAR'S OFFSET IS A FRACTION OF ITS CLOUD, and both are world units
    // now, so it is simply that fraction of the cloud's own half-size --
    // scaled by the ratio of their distances so the pair still projects to
    // the same place on screen despite the star riding STAR_LEAD in front.
    const pairScale = partner >= 0 ? axial / Math.max(1, cloudAxial) : 1
    // IN THE CLOUD'S OUTER LOWER CORNER, which is where it is supposed to be
    // and where the reference puts it. I moved it inward for a round to stop
    // it leading the exit off the frame edge, and that was the wrong trade:
    // it put the star in the middle of the cloud, "no longer in the bottom
    // corner like it's supposed to be". Its vertical offset carries the
    // actual fix -- see STAR_OFFSET_UP.
    const starSide = partner >= 0 ? STAR_OFFSET_SIDE * PROP_HALF_W * state.sideSign * pairScale : 0
    const starUp = partner >= 0 ? STAR_OFFSET_UP * PROP_HALF_H * pairScale : 0

    // DOWN OUT OF THE SKY, AND THEN PAST YOU.
    //
    // It starts above the top edge of the frame -- PROP_DROP_NDC frame-halves
    // up, measured at its own distance, so "above the frame" holds however
    // far away it is -- and is lowered onto its mark over the first quarter
    // of the section. There is no lift at the other end any more: it leaves
    // by flying past, which is what a thing on a string does when you fly
    // through a mobile.
    //
    // This is also why there is no opacity ramp. A fade existed to hide an
    // arrival in open sky; nothing arrives in open sky now, because the
    // entrance is off the top of the picture. It was the fade, in the end,
    // that hid the drop all of this was meant to show.
    const restUp = viewAxisUp(ahead) + state.up + starUp
    const fall = Math.max(0, 1 - sectionPhase / PROP_DROP_UNTIL)
    // Eased, so the puppet slows onto its mark rather than stopping dead.
    const eased = fall * fall * (3 - 2 * fall)
    const dropNdc = PROP_DROP_NDC * eased
    opacity.current = 1

    // Height above the CORRIDOR ORIGIN. Keep this, not the world y: the rope
    // below is measured against STRING_TOP, which is in the same frame.
    const localUp = restUp + dropNdc * frameV
    placeInFlightFrame(
      flightBasis(skyScroll.display, (basisRef.current ??= makeFlightBasis())),
      corridorOrigin(skyScroll.display, (originRef.current ??= { x: 0, y: 0, z: 0 })),
      ahead,
      state.side * state.sideSign + starSide,
      localUp,
      node.position,
    )

    // Square to the camera. These are flat cutouts, and the frame can turn --
    // without this they are seen edge-on the moment the heading is anything
    // but zero, which is what turned the caption cards into slivers.
    hang.rotation.y = basisRef.current ? Math.atan2(basisRef.current.fx, basisRef.current.fz) + Math.PI : Math.PI
    hang.position.y = 0
    // Shrunk with the frame, so a cloud covers the same share of a phone's
    // picture as it does of a desktop's -- see skyPropScale. Without this a
    // correctly PLACED cloud still blots out the subject on a narrow frame.
    hang.scale.setScalar(state.scale * skyPropScale())

    // Straight up to the anchor, in the group's own space. The anchor is a
    // fixed height for every prop (STRING_TOP), so every string reaches the
    // same line above the frame instead of starting in mid-air wherever its
    // own rope happened to begin.
    //
    // MEASURED FROM THE CORRIDOR ORIGIN, NOT IN WORLD COORDINATES, and the
    // difference is the whole cord. STRING_TOP is a height above the
    // corridor -- about 64 units -- while node.position.y is an absolute
    // world height, and out here the corridor itself is a hundred and fifty
    // units above the island. Subtracting the second from the first gives a
    // large NEGATIVE length, which the cylinder clamps to its 0.001 floor.
    //
    // So every cloud has been hanging from a cord two tenths of a pixel long
    // -- present, visible, fully opaque and completely invisible. Measured:
    // the rope mesh reporting 4.5px wide and 0.2px tall, its ndc y spanning
    // 0.25 to 0.25. That is the "they're supposed to be attached to rope".
    ropeLength.current = STRING_TOP - localUp
    // Tie it to the TOP of the cutout, not its middle.
    //
    // AND AT THE SIZE THE CUTOUT IS ACTUALLY DRAWN. The cloud is scaled by
    // `state.scale * skyPropScale()` (above), and the cord's radius by
    // skyPropScale() too -- this one offset was left on the raw state.scale.
    // skyPropScale is 1 on a 16:10 window, so the two agreed and nothing was
    // wrong on a desktop; it is 0.256 at 404x986, so on a phone the cord's
    // bottom end was parked almost four times the cloud's own half-height
    // above it, hanging in open sky with nothing on the end. Reported as
    // "the rope is far off of the dragonite" -- it is not his, the subject's
    // own cord is not drawn in portrait at all (SUBJECT_ROPE_IN_PORTRAIT),
    // and measurement named the owner as a sky-prop. It was the only cord in
    // the frame, so it read as his.
    ropeBase.current =
      ((kind === "star" ? STAR_NATIVE_HEIGHT : CLOUD_TOP_NATIVE * 2) / 2) *
      state.scale *
      skyPropScale()

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
    node.userData.axial = axial
    // WHAT IT IS, said outright. Probes used to tell a star from a cloud by
    // measuring it -- "narrower than 15 world units" -- which is a guess that
    // holds until either model is rescaled, and then quietly stops holding:
    // a star counted as a cloud drags the band's mean height down by its own
    // deliberate offset onto the cloud's lower corner.
    node.userData.kind = kind
    // Where it sits across the frame, in frame-halves. The whole of the
    // lateral complaint is one number, and this is it: a cloud that is doing
    // its job never leaves the range this reports.
    node.userData.sideNdc = (state.side * state.sideSign) / frameH
    // How far it still is above where it will hang. Absolute height is no use
    // for this: the view axis pitches down with distance, so a prop that has
    // finished being lowered in far away is still LOWER in world terms than
    // one at rest nearby. What is being asked is whether it descends onto its
    // own resting place, and that is this number going to zero.
    // How far above its resting height it still is, in frame-halves. Zero
    // while it hangs, positive while it is being lowered in or lifted out.
    // Measured in the frame rather than in world units because that is the
    // question being asked -- the view axis pitches down with distance, so a
    // prop lowered fully in at the far end is still lower in world terms than
    // one at rest nearby.
    node.userData.dropped = dropNdc
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
    // A PAIRED STAR DRAWS AFTER ITS CLOUD, ALWAYS.
    //
    // It rides STAR_LEAD in front and is measurably nearer -- camera-space
    // z of -95.5 against the cloud's -101.9 -- so a depth test would settle
    // it. There is no depth test to settle it with: both cutouts are
    // transparent with depthWrite off, so which one covers the other is
    // whatever order the renderer happens to submit them in, and it was
    // submitting the cloud second. The star's top half vanished behind it,
    // which reads exactly as "part of it is missing".
    //
    // renderOrder says the thing that is actually true about these two --
    // the star is pinned to the front of its cloud -- instead of leaving it
    // to a sort that has no depth to sort by.
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
          radius={ROPE_RADIUS_PROP * skyPropScale()}
          baseRef={ropeBase}
          opacityRef={opacity}
          onMaterial={(m) => { ropeMaterial.current = m }}
        />
      )}
      {/* The hanger is offset DOWN by the rope length and rotated about its own
          origin, which is the string's top -- so the prop swings from the
          string rather than spinning about its own middle. */}
      {/* A PAIRED STAR DRAWS AFTER ITS CLOUD, ALWAYS.
          
          It rides STAR_LEAD in front and is measurably nearer -- camera-space
          z of -95.5 against the cloud's -101.9 -- so a depth test would
          settle it. There is no depth test to settle it with: both cutouts
          are transparent with depthWrite off, so which covers which is
          whatever order the renderer happens to submit them in, and it was
          submitting the cloud second. The star's top half disappeared behind
          it, which reads exactly as "part of it is missing".
          
          renderOrder states the thing that is actually true about the pair
          -- the star is pinned to the front of its cloud -- rather than
          leaving it to a sort with no depth to sort by. It goes on the MESH:
          three ignores renderOrder on a group, which is a quiet way to write
          this and have nothing happen. */}
      <group ref={hanger}>
        {kind === "cloud" ? (
          <CloudCutout order={1} opacityRef={opacity} onMaterial={(m) => { cutoutMaterial.current = m }} />
        ) : (
          <StarCutout order={2} opacityRef={opacity} onMaterial={(m) => { cutoutMaterial.current = m }} />
        )}
      </group>
    </group>
  )
}

/** One of the small clouds out past the corridor. See EDGE_CLOUD_* for why
 *  they exist and where the band comes from.
 *
 *  Deliberately much simpler than Prop: no rope, no drop, no partner, no
 *  relationship to the words, and no recycling bookkeeping. Its position is a
 *  pure function of the scroll through a modulo, so there is no state to get
 *  out of step and scrolling backwards retraces exactly the sky you flew
 *  through. The only thing it shares with the corridor is the travel rate --
 *  it has to, or the two bands would drift apart and the parallax would read
 *  as two skies laid over each other.
 *
 *  Note it does NOT fade out at the near end. It does not need to: at 42 units
 *  off the axis and a couple of metres across, its offset carries it out
 *  through the side of the frame long before it reaches the camera, which is
 *  the same arithmetic that lets the captions leave without a fade. */
function EdgeCloud({ index, arrived }: { index: number; arrived: React.RefObject<boolean> }) {
  const group = useRef<THREE.Group>(null)
  const opacity = useRef(0)
  const material = useRef<THREE.MeshStandardMaterial | null>(null)
  const basisRef = useRef<ReturnType<typeof makeFlightBasis> | null>(null)
  const originRef = useRef<{ x: number; y: number; z: number } | null>(null)

  // Fixed placement, drawn from the same plastic sequence the corridor uses so
  // the two fields cannot accidentally line up. Offset well past the
  // corridor's own indices for the same reason.
  const seed = useMemo(() => {
    const { u, v } = r2(index * 3 + 4409)
    const { u: u2, v: v2 } = r2(index * 3 + 7717)
    return {
      // A fraction of the half-frame at the distance these are first meant to
      // be seen, resolved to world units here -- see EDGE_CLOUD_SIDE_NDC.
      sideNdc: EDGE_CLOUD_SIDE_NDC[0] + u * (EDGE_CLOUD_SIDE_NDC[1] - EDGE_CLOUD_SIDE_NDC[0]),
      // Alternating rather than sampled: with seven of them a random sign
      // leaves one side bare about a quarter of the time, and a bare side is
      // the one thing "clouds on the outsides" cannot have.
      sideSign: index % 2 === 0 ? -1 : 1,
      rise: (v * 2 - 1) * EDGE_CLOUD_RISE,
      scale: EDGE_CLOUD_SCALE[0] + u2 * (EDGE_CLOUD_SCALE[1] - EDGE_CLOUD_SCALE[0]),
      // Evenly spaced along the run, then jittered, so they arrive in a
      // stream rather than in a rank.
      phase:
        ((index + 0.5) / EDGE_CLOUD_COUNT + (v2 - 0.5) / EDGE_CLOUD_COUNT) *
        (EDGE_CLOUD_DEPTH[1] - EDGE_CLOUD_DEPTH[0]),
    }
  }, [index])

  useFrame(() => {
    const node = group.current
    if (!node) return
    // NOT UNTIL THE CAMERA IS ACTUALLY UP HERE. The same gate the corridor's
    // props have had all along, and leaving it off these was a plain
    // oversight: the paper world is mounted early so its textures resolve
    // during the climb, so anything without this is simply hanging over the
    // island. Measured as seven visible props on the island -- which is
    // exactly EDGE_CLOUD_COUNT, and none of them the corridor's.
    if (!arrived.current) {
      node.visible = false
      return
    }
    // And out of the way of an open card, for the same reason the corridor's
    // own props are -- see the gate in Prop.
    if (skyCardOpen(skyScroll.display) > 0.5) {
      node.visible = false
      return
    }
    node.visible = true
    const basis = (basisRef.current ??= makeFlightBasis())
    const origin = (originRef.current ??= { x: 0, y: 0, z: 0 })
    flightBasis(skyScroll.display, basis)
    corridorOrigin(skyScroll.display, origin)

    const span = EDGE_CLOUD_DEPTH[1] - EDGE_CLOUD_DEPTH[0]
    const travelled = skyScroll.display * CORRIDOR_TRAVEL_PER_OFFSET
    const axial = EDGE_CLOUD_DEPTH[0] + frac((seed.phase - travelled) / span) * span
    const ahead = axial - CAMERA_BEHIND

    placeInFlightFrame(
      basis,
      origin,
      ahead,
      seed.sideSign * seed.sideNdc * frameHalfWidth(EDGE_CLOUD_FADE_AXIAL - CAMERA_BEHIND),
      // The vertical band is a fraction of the frame at this distance, so it
      // opens out with the frame instead of closing to a line at the far end.
      viewAxisUp(ahead) + seed.rise * axial * skyFrame.tanV,
      node.position,
    )
    node.rotation.y = Math.atan2(basis.fx, basis.fz) + Math.PI
    node.scale.setScalar(seed.scale * skyPropScale())

    const shown = THREE.MathUtils.clamp(
      (EDGE_CLOUD_DEPTH[1] - axial) / Math.max(1, EDGE_CLOUD_DEPTH[1] - EDGE_CLOUD_FADE_AXIAL),
      0,
      1,
    )
    opacity.current = EDGE_CLOUD_OPACITY * shown * shown * (3 - 2 * shown)
    // Written here rather than left to the cutout's own callback, for the
    // reason Prop gives at length: a child's callback runs after this one, so
    // a cutout that set its own opacity would be a frame behind the position
    // it was set for -- which is exactly how a cloud gets seen at full
    // strength on the frame it jumps back to the far end.
    if (material.current) material.current.opacity = opacity.current

    node.userData.axial = axial
    node.userData.sideSign = seed.sideSign
    node.userData.side = seed.sideNdc
  })

  return (
    <group ref={group} name="sky-edge-cloud">
      <CloudCutout opacityRef={opacity} onMaterial={(m) => { material.current = m }} />
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
      // The integrator's own two numbers, for the same reason as the offset.
      // `display` alone cannot tell a journey that is being held from one
      // that simply has no momentum left, and the difference between those
      // is the entire question about the scroll magnet.
      root.userData.skyTarget = skyScroll.target
      root.userData.skyVelocity = skyScroll.velocity
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
          index={i}
          arrived={arrived}
          journeyTime={journeyTime}
        />
      ))}
      {Array.from({ length: EDGE_CLOUD_COUNT }, (_, i) => (
        <EdgeCloud key={`edge-${i}`} index={i} arrived={arrived} />
      ))}
      <SkyCard />
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
