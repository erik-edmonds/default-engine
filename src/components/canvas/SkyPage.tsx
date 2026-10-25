"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { skyFrame } from "@/helpers/skyFrame"
import { skyScroll } from "@/helpers/skyScroll"
import {
  makeScreenPlaneScratch,
  placeScreenPlane,
  screenPlaneFrame,
  type ScreenPlaneScratch,
} from "@/helpers/screenPlane"
import { paintPageBody, paintPageLabel } from "@/helpers/cardText"
import {
  skyCardState,
  skyPageLift,
  skyPageTypeFade,
  skyParallaxOrdinal,
  SKY_PARALLAX_FIRST,
  SKY_TEXT_CUES,
} from "@/config/skyJourney"
import {
  CARD_PAGE_COLOUR,
  CARD_PAGE_DISTANCE,
  CARD_PAGE_INK,
  CARD_PAGE_ORDER,
  CARD_PAGE_SPAN,
  CARD_PAGE_TRAVEL,
  cardBottomShare,
  cardCopySide,
  cardStyleFor,
} from "@/config/skyCards"

/** THE PAGE THE WINDOWS REST ON.
 *
 *  Between its three scenes the reference does not show a blank: it shows a
 *  page. White, with the scene's card sitting in the middle of it, a very
 *  large label turned on its side down the left margin, and a small
 *  annotated thumbnail in a right-hand column. It reads as a spread in a
 *  magazine, and the card expanding out of it is the whole trick.
 *
 *  Ours was a flat navy fill with nothing on it -- "the parts in between the
 *  parallax screen look really really bad. I don't even know what's going on
 *  there." This is that page, built the same way everything else in this
 *  stretch is: screen-space quads parked a fixed distance in front of the
 *  camera, so they behave like layers on the screen whatever the camera is
 *  doing. The card itself is not here; it is SkyCard, resting.
 *
 *  ON THE RENDER PASS. The ground is transparent, because it has to fade in
 *  and out, and three.js draws the whole transparent list after the whole
 *  opaque one -- so the ground covers every opaque thing in the sky without
 *  having to know about any of it. The furniture sits just above the ground
 *  in renderOrder and far below CARD_MASK_ORDER, so an open window covers it
 *  without any gating of its own.
 */

/** Where the furniture sits, as shares of the frame -- read off the
 *  reference's own layout (a 1100x692 capture):
 *
 *    the big label   x 80..260   y 115..630   -> left margin, 74% tall
 *    the card        x 295..780  y 120..600   -> centred; that is SkyCard
 *
 *  The reference's right-hand column of annotated thumbnails is gone, by
 *  request: the page is the header and the copy, and nothing else.
 *
 *  THE OFFSETS ARE ANCHORED, NOT FIXED. They were plain shares of the frame
 *  width, which is right at 1440 and nonsense at 430: the rotated label
 *  hung half off the left edge and the right-hand column was a 95px sliver
 *  jammed against the other one. Each piece now keeps a stated GUTTER from
 *  the edge it belongs to and works out its own offset from the size it
 *  actually came out, so the layout holds at any width. */
const GUTTER = 0.045
const LABEL_HEIGHT = 0.62
const LABEL_HEIGHT_PORTRAIT = 0.3
/** On a phone the label sits ABOVE the card rather than beside it. */
const LABEL_UP_PORTRAIT = 0.3
/** The copy, under the card. Wider on a phone, where a third of the frame
 *  is an unreadable column -- the same correction
 *  CARD_TEXT_SCREEN_WIDTH_PORTRAIT makes for the caption inside a scene. */
const BODY_WIDTH = 0.3
const BODY_WIDTH_PORTRAIT = 0.8
/** The clear space kept between the card's bottom edge and the first line,
 *  as a share of the frame's height. */
const BODY_GAP = 0.05
/** The margin the copy keeps from the top and bottom of the frame. */
const BODY_EDGE = 0.04

/** One painted canvas on a screen-space quad. The two bits of type on this
 *  page differ only in what they paint and how they are turned, so they
 *  share everything else. */
function PageType({
  text,
  paint,
  anchor,
  from = "centre",
  up,
  size,
  turned,
  order,
  opacityRef,
  scratch,
}: {
  text: string
  paint: (canvas: HTMLCanvasElement, label: string, ink: string) => number
  /** Which edge this keeps its gutter from, or "centre" for no offset at
   *  all. Its offset across the frame is then whatever its own measured
   *  width makes it. */
  anchor: "left" | "right" | "centre"
  /** Where `up` puts it: its centre, or its TOP edge.
   *
   *  The copy is placed under the card, and a card's bottom edge is known
   *  while the copy's height is not -- it falls out of wrapping the prose,
   *  in the frame loop, long after the caller has had to say where to put
   *  it. Anchoring by the top lets the caller say "below here" and leaves
   *  the half-height to the only code that knows it. Said in centre terms
   *  the first time, the card's bottom corner sat across the first line. */
  from?: "centre" | "top"
  up: number
  /** The long edge, as a share of the frame: height when turned, width when
   *  not. */
  size: number
  turned: boolean
  order: number
  opacityRef: React.RefObject<number>
  scratch: ScreenPlaneScratch
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const texture = useRef<THREE.CanvasTexture | null>(null)
  const painted = useRef<string | null>(null)
  const aspect = useRef(1)

  useEffect(() => {
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) painted.current = null
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => texture.current?.dispose(), [])

  useFrame((state) => {
    const node = mesh.current
    if (!node) return
    const show = opacityRef.current ?? 0
    node.visible = show > 0.004 && text.length > 0
    if (!node.visible) return

    if (painted.current !== text) {
      const c = (canvas.current ??= document.createElement("canvas"))
      aspect.current = paint(c, text, CARD_PAGE_INK)
      texture.current?.dispose()
      const tex = new THREE.CanvasTexture(c)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      texture.current = tex
      if (mat.current) {
        mat.current.map = tex
        mat.current.needsUpdate = true
      }
      painted.current = text
    }

    const frame = screenPlaneFrame(CARD_PAGE_DISTANCE)
    // `size` is always the long edge on screen. Turned, the canvas's width
    // runs vertically, so it is the canvas width that `size` sets.
    const long = turned ? frame.height * size : frame.width * size
    const short = long * aspect.current
    node.scale.set(long, short, 1)
    // How wide it actually is ON SCREEN -- the short edge once it is turned,
    // the long one if it is not -- and from that, the offset that leaves a
    // GUTTER between it and its own edge of the frame.
    const onScreen = turned ? short : long
    const edge = frame.width / 2 - onScreen / 2 - frame.width * GUTTER
    const across = anchor === "centre" ? 0 : anchor === "left" ? -edge : edge
    // PLUS THE PAGE'S OWN SLIDE. Everything on the page travels with it,
    // and in the same currency -- a share of the frame's height. The page
    // hangs at distance 46 and the hole at 12, so a shared WORLD lift would
    // subtend nearly four times the screen angle on the hole and the two
    // would come apart as they moved.
    const lift = skyPageLift(skyScroll.display) * CARD_PAGE_TRAVEL
    let upWorld = from === "top" ? frame.height * up - short / 2 : frame.height * up

    // KEPT ON THE PAGE. The copy hangs off the bottom edge of whichever
    // card this beat wears, and the tallest of the three is an upright one
    // -- which put its bottom 0.37 of a frame below centre and the copy's
    // last line off the bottom of the screen: "the placeholder text is too
    // far at the bottom and is getting cut off".
    //
    // Clamped against the frame rather than against the card, because the
    // card is what pushed it out and clamping to the thing that caused the
    // problem would not fix it.
    // THE VERTICAL EXTENT, which for a turned element is its LONG edge.
    // Clamping the label by `short` measured its on-screen WIDTH against
    // the frame's height and let it hang off the top and bottom regardless.
    const tall = turned ? long : short
    const room = frame.height / 2 - tall / 2 - frame.height * BODY_EDGE
    upWorld = Math.max(-room, Math.min(room, upWorld))
    upWorld += frame.height * lift
    placeScreenPlane(node, state.camera, CARD_PAGE_DISTANCE, upWorld, across, scratch)
    // Turned a quarter turn anticlockwise, so it reads bottom-to-top like
    // the reference's. Applied after placeScreenPlane squared the quad to
    // the camera, and about the view axis, so it is a rotation on the screen
    // rather than in the world.
    if (turned) node.rotateZ(Math.PI / 2)
    // THE OPACITY IS THE POINT OF opacityRef, and this used to be a hard 1.
    //
    // With the fade pinned at full the ref could only ever gate `visible`
    // above, so the page's words went from absent to fully present in one
    // frame -- "the text just appears, instead of transitioning in
    // smoothly". Everything needed for the dissolve was already plumbed
    // through; this line was throwing it away.
    if (mat.current) mat.current.opacity = show
  })

  return (
    <mesh ref={mesh} name="sky-page-type" renderOrder={order} frustumCulled={false} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        ref={mat}
        transparent
        depthTest={false}
        depthWrite={false}
        opacity={0}
        toneMapped={false}
      />
    </mesh>
  )
}

export function SkyPage() {
  const ground = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial | null>(null)
  const scratch = useMemo(() => makeScreenPlaneScratch(), [])
  /** The page's opacity, published once a frame for the furniture to read.
   *  A ref rather than state: this changes every frame, and a render per
   *  frame would put the furniture a frame behind the ground it sits on. */
  const up = useRef(0)
  /** Which beat's page this is. STATE, because changing it repaints a
   *  canvas and swaps a texture -- the same reason SkyCard holds its block
   *  in state. It changes three times across the whole run. */
  /** BORN DRESSED FOR THE FIRST PARALLAX BEAT, for the same reason SkyCard
   *  is (see SKY_PARALLAX_FIRST): the page slides into frame carrying its
   *  words, and dressing is a render, so starting it blank means the first
   *  frame of the slide shows an empty page. A sweep caught it as one
   *  sample naming no beat while the window already showed one. */
  const [dressed, setDressed] = useState({
    label: SKY_TEXT_CUES[SKY_PARALLAX_FIRST]?.eyebrow ?? "",
    body: SKY_TEXT_CUES[SKY_PARALLAX_FIRST]?.body ?? "",
    portrait: false,
    style: cardStyleFor(skyParallaxOrdinal(SKY_PARALLAX_FIRST)),
    beat: SKY_PARALLAX_FIRST,
  })
  const portrait = dressed.portrait
  /** Under whichever card this beat is wearing, clear of its bottom edge. */
  const bodyUp = cardBottomShare(dressed.style, skyFrame.aspect, portrait) - BODY_GAP

  useFrame((state) => {
    const node = ground.current
    if (!node) return
    const offset = skyScroll.display
    // IT SLIDES, IT DOES NOT FADE. `lift` is a share of the frame's height:
    // +1 wholly below, 0 covering, -1 gone over the top. The page used to
    // arrive by having its opacity go 0 -> 1 as the beat index crossed,
    // which is why the arrival read as a hard cut -- "the transition from
    // the dragonite scene to the parallax is absolutely horrible".
    const lift = skyPageLift(offset)
    node.visible = Math.abs(lift) < 1
    // FULLY OPAQUE WHENEVER IT IS ON SCREEN. The page arrives by moving, so
    // its opacity is no longer a dimmer -- a page that faded as it slid
    // would show the sky through its own ground on the way in.
    // THE GROUND STAYS OPAQUE; ONLY THE WORDS DIP. `up` is read by the two
    // PageType elements and by nothing else -- the white page sets its own
    // opacity to 1 below -- so fading it dissolves the type across the turn
    // without ever showing the sky through the page.
    up.current = node.visible ? skyPageTypeFade(offset) : 0
    if (!node.visible) return
    // DRESSED FROM THE PLATE, NOT FROM THE BEAT SCHEDULE.
    //
    // The page is a caption for the window cut in it, so the two have to
    // name the same scene -- and they stopped doing that when the scene
    // change moved onto the flip. The plate turns over at nine tenths of a
    // slot while the beat's own threshold is at the end of it, so for that
    // last tenth the window carried the next scene's art under the previous
    // scene's heading: "Fact #04" beside scene two's mountains. The style
    // went with it, which also decides which gutter the copy sits in and
    // how far down it hangs, so the words were laid out for a plate that
    // was no longer there.
    //
    // Reading the card's own state makes the question unanswerable rather
    // than merely answered correctly. The page is only visible inside the
    // run (the early return above), which is exactly where skyCardState
    // reports a real scene.
    const card = skyCardState(offset)
    const beat = SKY_TEXT_CUES[card.index]
    const label = beat?.eyebrow ?? ""
    const body = beat?.body ?? ""
    const style = cardStyleFor(skyParallaxOrdinal(card.index))
    // PUBLISHED AS WHAT IS ON THE PAGE, not as what was just worked out.
    //
    // Which scene the words belong to is invisible to any check that reads
    // positions, and painted type is pixels by the time it reaches the
    // scene -- there is no string left to read. But the first version of
    // this published `card.index`, the value computed THIS frame, while
    // the type on screen is still whatever the last render painted. The
    // plate publishes its dressed state for the same reason, so comparing
    // the two was comparing an intention with a fact, and a sweep duly
    // found them one frame apart at both hand-overs.
    node.userData.beat = dressed.beat
    // Orientation is in here too: the page lays out differently on a phone,
    // and that is a re-render, not a per-frame number.
    const turned = skyFrame.portrait
    if (
      card.index !== dressed.beat ||
      label !== dressed.label ||
      body !== dressed.body ||
      turned !== dressed.portrait ||
      style !== dressed.style
    ) {
      setDressed({ label, body, portrait: turned, style, beat: card.index })
    }

    const frame = screenPlaneFrame(CARD_PAGE_DISTANCE)
    // Tall enough to cover while it is here, short enough to get out of the
    // way when it is not -- see CARD_PAGE_SPAN, which ties the two.
    node.scale.set(frame.width * 1.5, frame.height * CARD_PAGE_SPAN, 1)
    placeScreenPlane(
      node, state.camera, CARD_PAGE_DISTANCE,
      frame.height * lift * CARD_PAGE_TRAVEL, 0, scratch,
    )
    if (mat.current) mat.current.opacity = 1
  })

  return (
    <>
      <mesh ref={ground} name="sky-flat-page" renderOrder={CARD_PAGE_ORDER} frustumCulled={false} visible={false}>
        <planeGeometry args={[1, 1]} />
        {/* depthTest off so it covers the sky dome and the corridor whatever
            their depths are.

            THE RENDER ORDER ONLY SORTS WITHIN A PASS. three.js splits the
            frame into an opaque list and a transparent one and draws the
            opaque list FIRST, whole, whatever either list's renderOrder
            says -- so this, being transparent, is drawn after every opaque
            object in the scene. That is what makes it cover the sky; it is
            also what made it cover the window, which was opaque, and the
            three parallax windows came out as flat colour. The window is
            transparent too now, at a renderOrder above this one -- see
            SkyCard. */}
        <meshBasicMaterial
          ref={mat}
          color={CARD_PAGE_COLOUR}
          transparent
          depthTest={false}
          depthWrite={false}
          opacity={0}
          toneMapped={false}
        />
      </mesh>

      {/* The big label down the left margin, turned on its side. */}
      <PageType
        text={dressed.label}
        paint={paintPageLabel}
        anchor="left"
        up={portrait ? LABEL_UP_PORTRAIT : 0}
        size={portrait ? LABEL_HEIGHT_PORTRAIT : LABEL_HEIGHT}
        turned
        order={CARD_PAGE_ORDER + 2}
        opacityRef={up}
        scratch={scratch}
      />

      {/* The beat's copy, set plainly under the header.

          THERE WAS A PICTURE HERE -- a crop of the scene's own backdrop,
          with a label. "The placeholder picture, remove it. It will just be
          the header text that's used as fact # right now, and actual text
          which I will add." So the page is the two pieces of type and
          nothing else. */}
      <PageType
        text={dressed.body}
        paint={paintPageBody}
        anchor={portrait ? "centre" : cardCopySide(dressed.style)}
        from="top"
        up={bodyUp}
        size={portrait ? BODY_WIDTH_PORTRAIT : BODY_WIDTH}
        turned={false}
        order={CARD_PAGE_ORDER + 3}
        opacityRef={up}
        scratch={scratch}
      />
    </>
  )
}
