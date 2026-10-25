"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { MeshPortalMaterial } from "@react-three/drei"
import { easing } from "maath"

import { skyFrame } from "@/helpers/skyFrame"
import { pointerState } from "@/helpers/cursor"
import { prefersReducedMotion } from "@/helpers/motion"
import { useCoarsePointer } from "@/helpers/useCoarsePointer"
import { skyScroll } from "@/helpers/skyScroll"
import { skyCaptionBox } from "@/helpers/skyCaptionBox"
import {
  makeScreenPlaneScratch,
  placeScreenPlane,
  screenPlaneFrame,
  type CameraPose,
} from "@/helpers/screenPlane"
import {
  skyCardState,
  skyPageLift,
  skyParallaxOrdinal,
  SKY_PARALLAX_FIRST,
  SKY_TEXT_CUES,
} from "@/config/skyJourney"
import {
  CARD_MASK_DISTANCE,
  CARD_MASK_ORDER,
  CARD_PAGE_TRAVEL,
  CARD_CURSOR_PITCH,
  CARD_CURSOR_YAW,
  CARD_STYLES,
  CARD_TILT_MAX,
  cardCoverScale,
  cardStyleFor,
  restingCard,
  type CardStyle,
} from "@/config/skyCards"
import { CardScene } from "@/components/canvas/CardScene"

/** How long the card takes to catch up with the cursor.
 *
 *  The same 0.25s CameraLook and AvatarController's sky scroll damp on, so
 *  the card lags the pointer by exactly as much as the camera does. Two
 *  things following the same cursor at different rates is immediately
 *  legible as wrong even when neither is wrong on its own. */
const CURSOR_SMOOTH = 0.25

/** A BLOCK OF THE SKY JOURNEY, AS A WINDOW INTO ITS OWN SCENE.
 *
 *  "Each card that the text are in should be like a full screen scene, that
 *  starts out as a small card, but on scroll it expands to take up the full
 *  screen then the user scrolls through the content of this card scene, then
 *  the card retracts back to a small card, and the 'Overscene' of the main
 *  sky scene continues. It's like a stack of scenes where the sky scene
 *  contains cards that contain their own scene inside."
 *
 *  THE CARD IS A PORTAL, and that is not an effect imitating the description
 *  -- it is literally what is on screen. drei's MeshPortalMaterial renders
 *  its children into a scene of their own and shows that scene through the
 *  mesh's silhouette, so a plane that grows until it covers the frame is a
 *  window that grows until its scene IS the screen. The same component is
 *  what the island's three portals are built from.
 *
 *  BLEND STAYS AT ZERO, deliberately, and this is the one place this differs
 *  from HotspotPortal. drei's `blend` is not a geometric expansion: between 0
 *  and 1 it renders the root scene and the portal scene into two targets and
 *  cross-fades them over the whole screen, and it seizes the render loop with
 *  a renderPriority to do it -- which would fight this scene's postprocessing
 *  and, worse, would look like a dissolve rather than a card opening. Left at
 *  zero, the clip to the mesh's own silhouette does all the work, and the
 *  expansion is honest geometry.
 *
 *  ONE CARD, RE-DRESSED. Blocks are sequential on the axis and separated by a
 *  stretch of empty sky, so only one can ever be on screen; five portals
 *  would be five extra scenes rendered every frame for no gain. HotspotPortal
 *  has the measurement for what that costs.
 */

/** Round every corner of a closed polygon by `r`, clamped at each vertex to
 *  something the two edges meeting there can actually pay for.
 *
 *  The clamp is what makes this safe to hand an L-step: the short riser of
 *  a notch is a fraction of the card, and a radius bigger than half of it
 *  would run the two arcs past each other and fold the outline inside out.
 *  Each corner gets `min(r, 40% of the shorter neighbouring edge)`. */
function roundedPolygon(points: readonly THREE.Vector2[], r: number) {
  const shape = new THREE.Shape()
  const n = points.length
  const lerp = (a: THREE.Vector2, b: THREE.Vector2, t: number) =>
    new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const here = points[i]
    const next = points[(i + 1) % n]
    const back = here.distanceTo(prev)
    const fwd = here.distanceTo(next)
    const cut = Math.min(r, back * 0.4, fwd * 0.4)
    const from = lerp(here, prev, cut / back)
    const to = lerp(here, next, cut / fwd)
    if (i === 0) shape.moveTo(from.x, from.y)
    else shape.lineTo(from.x, from.y)
    shape.quadraticCurveTo(here.x, here.y, to.x, to.y)
  }
  shape.closePath()
  return shape
}

/** THE WINDOW'S OUTLINE: an irregular plate off a View-Master reel.
 *
 *  "It's still too smooth and AI generated. Make it like it's a 3d View
 *  Master." The thing that read as smooth was the outline: a near-square
 *  with generous equal radii and every edge bowed out by a percent, which
 *  is a squircle however it is dressed.
 *
 *  The reference is nothing like that. It is an ANGULAR PLATE: an L-shaped
 *  step bitten out of one corner -- measured off the clip at 0.22 of the
 *  panel's width and 0.12 of its height -- and every OTHER corner cut off
 *  on a diagonal, each by a different amount. Straight edges, hard cuts,
 *  crisp little radii on the joins.
 *
 *  THE CHAMFERS ARE WHY IT IS NOT A RECTANGLE. With the step alone this
 *  was still "a rounded rectangle with a bite out of it", and read as one:
 *  "the shapes are still rectangles. It should be irregular." Four corners
 *  cut by four different amounts is what turns it into a plate.
 *
 *  (The step is back, in other words. It was in this file two rounds ago,
 *  taken out because the reference clip of the day -- a different site --
 *  did not have one. It is the single feature that makes the silhouette
 *  read as a cut plate rather than as a rounded rectangle.)
 *
 *  A Shape rather than a plane because the joins still have to be genuinely
 *  curved: the card ends up covering the whole screen, where a chamfer made
 *  of three segments would be unmistakable. The UVs ShapeGeometry generates
 *  are unnormalised and wrong, which does not matter in the slightest: this
 *  mesh's material is the portal, and a portal samples by screen position,
 *  not by UV. */
function cardGeometry(style: CardStyle) {
  const a = style.aspect
  const L = -a / 2
  const R = a / 2
  const B = -0.5
  const T = 0.5
  const V = (x: number, y: number) => new THREE.Vector2(x, y)

  /** One corner's points, anticlockwise. A plain corner is one point; a
   *  chamfered one is two, cut `cw` in along the horizontal edge and `ch`
   *  along the vertical; the stepped one is three. Widths are shares of the
   *  card's WIDTH and heights of its HEIGHT, so a style reads the same at
   *  any proportion. */
  const corner = (key: "bl" | "br" | "tr" | "tl") => {
    const { w, h, at } = style.notch
    if (at === key) {
      // THREE POINTS, because a step has an inner corner. Two of them
      // describe a diagonal, which is a chamfer -- and emitting two in the
      // wrong order, which is what this did, describes a diagonal that
      // runs backwards and crosses the edge it came from. On screen that
      // was "a small little tail sticking out at the bottom left side".
      //
      // The removed rectangle at each corner is w of the card's width by h
      // of its height; the outline goes round it.
      const x = w * a
      return {
        bl: [V(L, B + h), V(L + x, B + h), V(L + x, B)],
        br: [V(R - x, B), V(R - x, B + h), V(R, B + h)],
        tr: [V(R, T - h), V(R - x, T - h), V(R - x, T)],
        tl: [V(L + x, T), V(L + x, T - h), V(L, T - h)],
      }[key]
    }
    const [cw, ch] = style.chamfer[key]
    const x = cw * a
    if (cw <= 0 && ch <= 0) {
      return { bl: [V(L, B)], br: [V(R, B)], tr: [V(R, T)], tl: [V(L, T)] }[key]
    }
    // Anticlockwise: bottom edge runs left-to-right, right edge up, top
    // right-to-left, left edge down.
    return {
      bl: [V(L + x, B), V(L, B + ch)].reverse(),
      br: [V(R - x, B), V(R, B + ch)],
      tr: [V(R, T - ch), V(R - x, T)],
      tl: [V(L + x, T), V(L, T - ch)],
    }[key]
  }

  // Anticlockwise from the bottom-left. The step's three points and a
  // chamfer's two both just extend the list.
  const pts = [...corner("bl"), ...corner("br"), ...corner("tr"), ...corner("tl")]
  return new THREE.ShapeGeometry(roundedPolygon(pts, style.corner), 8)
}

/** The folder the next section-3 beat will want, so its sheets can be
 *  warmed while this one is still up. Undefined when this is the last. */
function nextParallaxFolder(from: number) {
  for (let i = from + 1; i < SKY_TEXT_CUES.length; i++) {
    if (SKY_TEXT_CUES[i].mode === "parallax") return SKY_TEXT_CUES[i].folder
  }
  return undefined
}

export function SkyCard() {
  const group = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const scratch = useMemo(() => makeScreenPlaneScratch(), [])
  /** THE REAL CAMERA, CAPTURED HERE AND HANDED DOWN.
   *
   *  The sheets inside the portal cannot see it. drei renders a portal's
   *  scene through a RenderTexture that carries an r3f store of its own, so
   *  a frame callback in there gets that store's camera, not the one the
   *  portal is finally drawn with -- and positioning a full-screen sheet
   *  against the wrong camera puts it somewhere off in the world, which is
   *  why the window showed nothing but its own backdrop. This component is
   *  outside the portal and sees the true camera, so it copies the pose once
   *  a frame and CardScene reads it from here. */
  const camPose = useMemo<CameraPose>(
    () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }),
    [],
  )
  const camRef = useRef<CameraPose | null>(null)
  /** How far through the current card's own scene the reader is. Handed to
   *  CardScene as a ref so the layers move without a render per frame. */
  const inside = useRef(0)
  /** How open the card is, 0..1. Only the overlay type reads it -- the
   *  sheets behind are full screen whatever the hole is doing. */
  const openness = useRef(0)
  /** What part of the card the frame can actually see, in the card's own
   *  local units -- half-extents from its centre.
   *
   *  The card overhangs the picture, by CARD_COVER_MARGIN at full size and by
   *  a great deal more on a phone, where covering a tall narrow frame with a
   *  16:10 card leaves most of its width off screen. CardScene places its
   *  type against THIS rather than against the card's own edge, which is the
   *  difference between a heading in the corner of the picture and a heading
   *  nobody on a phone ever sees. */
  /** How far the camera is from the card, measured in CARD units.
   *
   *  The plates inside sit behind the window, so how much of the picture
   *  each has to cover depends on how far back it is relative to how far
   *  away the whole card is -- and the card's distance in its OWN units
   *  changes every time it is scaled. One number, published once a frame,
   *  rather than the plates each re-deriving the card's transform. */

  /** Which block the card is currently dressed as.
   *
   *  State, because the scene inside it is React -- its palette, its skyline
   *  and its words all change with the block. The frame loop below refuses to
   *  SHOW the card until this has caught up, which is the whole guard: a card
   *  placed for block two carrying block one's scene is exactly the fault the
   *  old caption billboard shipped once, and it is invisible to any check
   *  that only looks at where things are. */
  const [block, setBlock] = useState(SKY_PARALLAX_FIRST)

  /** One outline per style, cut on mount. Three tiny ShapeGeometries is
   *  nothing; cutting one per frame would not be. */
  const geometries = useMemo(() => CARD_STYLES.map((s) => cardGeometry(s)), [])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  const style = cardStyleFor(skyParallaxOrdinal(block))
  const geometry = geometries[skyParallaxOrdinal(block) % geometries.length]
  /** The mask's lean, damped. See CARD_TILT_MAX. */
  const tilt = useRef(0)
  /** Where the resting card is facing, damped. See CARD_CURSOR_YAW. */
  const look = useRef({ yaw: 0, pitch: 0 })
  /** Read at the top rather than per frame: it is a media query, and the
   *  answer cannot change without a remount. */
  const coarse = useCoarsePointer()

  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    const card = skyCardState(skyScroll.display)

    if (card.index < 0 || card.phase === "away") {
      node.visible = false
      skyCaptionBox.visible = false
      return
    }
    // RE-DRESSED FOR THE NEXT SCENE, AND STILL DRAWN THIS FRAME.
    //
    // The portal's scene is React -- its palette, its skyline and its words
    // all change with the beat -- so the swap costs a render and the new art
    // lands a frame late. Two earlier versions hid the card for that frame,
    // on the grounds that a card carrying the wrong scene is a fault no
    // check of positions can see. True, and it cost a blink: a sweep found
    // samples with no hole on screen at both hand-overs, in the one section
    // whose entire history is holes going missing.
    //
    // Nothing is hidden now, because nothing needs to be. The swap happens
    // where `Math.round` tips, which is a half-turn, which is edge-on -- the
    // plate has no width there, so a frame of the outgoing scene cannot be
    // seen through it. And the card is BORN dressed as the first parallax
    // beat (see SKY_PARALLAX_FIRST), so there is no undressed first frame to
    // cover either.
    if (card.index !== block) setBlock(card.index)
    // SHOWN FOR THE WHOLE OF SECTION 3, and `index < 0` above is the only
    // way out -- which means the reader is not in the parallax run at all.
    //
    // This used to turn on `card.open` and then on `card.rise`, and between
    // either of those and the beats' quiet margins the hole was absent for
    // 1552 units -- 24% of the run, in four gaps: "the page is missing the
    // hole." There is always a plate now, at every offset in the run, even
    // if it is a small card or an edge-on sliver.
    node.visible = true
    camPose.position.copy(state.camera.position)
    camPose.quaternion.copy(state.camera.quaternion)
    camRef.current = camPose
    inside.current = card.inside
    openness.current = card.open
    // PUBLISHED ON THE NODE, like the corridor's own scroll readings.
    //
    // The card's whole life is derived inside the bundle, so nothing outside
    // it can say whether a card is expanding or departing -- and "it grows
    // to fill the screen and shrinks back" is precisely the claim that has
    // to be measurable rather than inferred from a screenshot. `block` is
    // here too, because a card placed for one block carrying another's scene
    // is a fault that only shows up by comparing the two.
    node.userData.phase = card.phase
    node.userData.open = card.open
    node.userData.spin = card.spin
    node.userData.inside = card.inside
    node.userData.block = block

    // THE WINDOW IS A MASK ON THE SCREEN, NOT AN OBJECT IN THE CORRIDOR.
    //
    // It used to fly in from a hundred and ninety units down the flight
    // axis, sit off to one side and turn on its Y axis. None of that is in
    // the reference: there the window simply RISES FROM THE BOTTOM OF THE
    // SCREEN and grows as it rises, square to the frame the whole way.
    //
    // Parked at a fixed distance and placed with placeScreenPlane, which is
    // the same helper the sheets behind it use -- so the mask and the
    // picture are described in the same terms and cannot drift apart.
    const frame = screenPlaneFrame(CARD_MASK_DISTANCE)

    // GROWS -- on `open` alone. From the card it rests as to a hair past
    // full frame. The cover size is taken from the LIVE frame, so it is
    // right on any viewport rather than on the one it was tuned at.
    // Where it rests, with the frame's shape taken into account -- see
    // restingCard. The styles are authored for a landscape frame.
    const rest = restingCard(style, skyFrame.portrait)
    const shut = (rest.width * frame.width) / style.aspect
    const open = cardCoverScale(frame.width / 2, frame.height / 2, style)
    const scale = shut + (open - shut) * card.open
    // UNIFORM, always. Nothing inherits this now that the portal is in world
    // units, but a non-uniform scale would still bend the mask's own rounded
    // corners and its edge bows out of shape.
    if (mesh.current) mesh.current.scale.setScalar(scale)

    // IT NEVER MOVES. Dead centre of the frame for the whole run, and that
    // is the decision this round turns on: "stays centred, spins in place."
    //
    // Three earlier versions moved it. It rose from below the bottom edge
    // and grew as it rose; then it travelled up the page as a hole with the
    // page's own speed, handing over at the frame's edge. Both put the
    // single portal in two places on consecutive frames at every hand-over,
    // which is a teleport: "on transition from the first window to the
    // second, it does a weird jump." A plate that turns over in place has
    // no hand-over position at all -- the old scene and the new one occupy
    // exactly the same quad, and the only thing that changes is which face
    // of it you are looking at.
    //
    // THE PAGE'S OWN SLIDE REMAINS, and it is the only thing left that
    // moves the hole. The hole is a thing ON the page, so it arrives and
    // leaves with the page -- otherwise the page slides in from below
    // carrying nothing and the hole pops in afterwards.
    const slide = skyPageLift(skyScroll.display) * CARD_PAGE_TRAVEL
    // DEAD CENTRE OF THE FRAME, plus the page's slide and nothing else.
    const up = frame.height * slide
    // SQUARE TO THE SCREEN, which placeScreenPlane has just done by copying
    // the camera's own rotation onto the mask.
    //
    // THERE WAS A `node.rotation.set(0, 0, 0)` HERE, and it was the cause of
    // "it is crooked and off to the side for some reason". Setting `rotation`
    // writes straight through to the quaternion, so it threw away the
    // alignment the line above had just made and left the mask square to the
    // WORLD instead -- and this camera carries a deliberate tilt (see
    // SKY_LOOK_TILT), so a world-aligned quad hangs at an angle on screen.
    // The sheets inside never did it, which is why the picture came out
    // straight inside a crooked hole.
    placeScreenPlane(node, state.camera, CARD_MASK_DISTANCE, up, 0, scratch)

    // THE WHOLE OF THE MASK'S ROTATION, SET AS ONE EULER, EVERY FRAME.
    //
    // Three things want to turn this mesh -- the flip, the scroll lean, the
    // cursor -- and the version before this assigned `.z` on its own. That
    // works only while nothing else writes the other two components, and
    // `rotation` writes straight through to the quaternion: the moment a
    // second writer appears, whichever ran last decides what the first one
    // meant. `set` all three at once and the question cannot arise. It is
    // the same class of fault as the `node.rotation.set(0, 0, 0)` noted
    // above, which silently undid the camera alignment.
    //
    // ON THE MESH, NOT THE GROUP. The group was just squared to the camera
    // by placeScreenPlane and the sheets behind are squared the same way, so
    // turning the mesh inside the already-placed group turns the HOLE and
    // nothing else -- the picture stays dead level whatever the hole does,
    // which is the fault flagged twice as "it is crooked".

    // THE FLIP. `card.spin` counts half-turns from the start of the run, so
    // a half-turn is pi and the count is continuous: nothing here has to
    // remember which way round the plate was left, and the scene showing is
    // derived from the same number (see plateAt).
    const flip = card.spin * Math.PI

    // THE LEAN. A fixed angle per style plus what the scroll adds, so each
    // plate sits at its own slight angle whether anything is moving or not
    // -- half of why they read as physical slides -- and leans further into
    // the motion as it advances.
    //
    // 250, not 900. A steady scroll runs at roughly 160-200 units a second,
    // so a 900 divisor asked for a twentieth of the cap and the measured
    // turn never exceeded 0.008 rad -- under half a degree, which is to say
    // the feature was not there.
    const want =
      style.lean + THREE.MathUtils.clamp(skyScroll.speed / 250, -1, 1) * CARD_TILT_MAX
    // The RAW delta. An exponential damp cannot go unstable over a long
    // step, and clamping one only makes it run at the frame rate instead of
    // the clock -- which on a software renderer means it never arrives.
    tilt.current = THREE.MathUtils.damp(tilt.current, want, 3.5, delta)

    // AND THE CURSOR. "Have it stick for a bit, and the square adjusts to
    // the position of the cursor."
    //
    // GUARDED HERE RATHER THAN AT THE MOUNT SITE, which is the difference
    // from CameraLook: that component is only mounted for fine pointers, and
    // this one is mounted for the whole journey. On a touch screen
    // `pointerState` is never written at all -- SceneCursor is what writes
    // it and SceneCursor only mounts for a fine pointer -- so without the
    // check the card would hold whatever angle the last mouse left it at,
    // forever, on every phone.
    //
    // Targets are zero when the pointer leaves the window, so it eases back
    // to square rather than sticking at the angle it held as the pointer
    // crossed the edge. Faded out by `open`, so a full-frame scene is never
    // askew; faded out again by how far through its turn it is, so the flip
    // is a clean half-turn and not a wobbling one.
    const engaged = !coarse && !prefersReducedMotion() && pointerState.seen && pointerState.inWindow
    const ndcX = engaged ? (pointerState.x / state.size.width) * 2 - 1 : 0
    const ndcY = engaged ? 1 - (pointerState.y / state.size.height) * 2 : 0
    const settled = 1 - card.open
    easing.damp(look.current, "yaw", ndcX * CARD_CURSOR_YAW * settled, CURSOR_SMOOTH, delta)
    easing.damp(look.current, "pitch", -ndcY * CARD_CURSOR_PITCH * settled, CURSOR_SMOOTH, delta)

    if (mesh.current) {
      mesh.current.rotation.set(look.current.pitch, flip + look.current.yaw, tilt.current)
    }
  })

  return (
    <group ref={group} name="sky-card" visible={false}>
      {/* renderOrder above the flat page's, and the material below is
          transparent so that the comparison is meaningful at all -- see
          CARD_PAGE_ORDER. Opaque, this mesh was drawn in a pass that
          finishes before the page's even starts, and the page covered it. */}
      <mesh ref={mesh} geometry={geometry} renderOrder={CARD_MASK_ORDER}>
        {/* worldUnits IS THE WHOLE FIX. Without it drei copies this mesh's
            world matrix onto the portal's scene, so the painted sheets
            inherited the card's scale, rotation and offset -- they grew with
            it, came out crooked with it, and sat off to one side with it.
            With it, drei sets the portal scene's matrix to the identity and
            the sheets are in world space: CardScene parks them square to the
            camera and full screen, and the card is nothing but the hole they
            are seen through.

            blur 0 skips the SDF pass; blend stays at zero -- see the note at
            the top of this file. */}
        {/* transparent: CardScene's own ground covers the whole frame
            opaquely, so the render texture's alpha is 1 right across the
            hole and nothing actually blends -- this is purely to put the
            window in the same render pass as the page it has to beat. */}
        <MeshPortalMaterial
          worldUnits
          transparent
          blend={0}
          blur={0}
          resolution={512}
          side={THREE.DoubleSide}
        >
          <CardScene
            key={block}
            folder={SKY_TEXT_CUES[block].folder ?? "1"}
            paletteIndex={block}
            nextFolder={nextParallaxFolder(block)}
            copy={SKY_TEXT_CUES[block]}
            progressRef={inside}
            openRef={openness}
            camRef={camRef}
          />
        </MeshPortalMaterial>
      </mesh>
    </group>
  )
}
