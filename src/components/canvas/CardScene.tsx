"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { useTexture } from "@react-three/drei"

import { skyFrame } from "@/helpers/skyFrame"
import {
  makeScreenPlaneScratch,
  placeScreenPlane,
  type CameraPose,
} from "@/helpers/screenPlane"
import { paintCardText, CARD_PAINT_WIDTH, type CardCopy } from "@/helpers/cardText"
import {
  CARD_LAYERS,
  CARD_PALETTES,
  CARD_PLATE_DISTANCE,
  CARD_PLATE_MARGIN,
  CARD_SUBJECT_HEIGHT,
  CARD_TEXT_SCREEN_BOTTOM,
  CARD_TEXT_SCREEN_GUTTER,
  CARD_TEXT_SCREEN_WIDTH,
  CARD_TEXT_SCREEN_WIDTH_PORTRAIT,
  cardLayerUrl,
} from "@/config/skyCards"

/** THE SCENE BEHIND THE CARD -- FULL SCREEN, AND NOT THE CARD'S CHILD.
 *
 *  "Currently the card has the parallax image inside of it, so when the card
 *  expands, the parallax image expands too, and when the card is to the
 *  side, the parallax image is to the side as well. This is wrong and looks
 *  bad. Separate it, the only relation it has to the card is that the card
 *  is the view into the parallax image."
 *
 *  That is exactly what this file used to get wrong, and the cause was one
 *  line inside drei: with the default `worldUnits = false`, MeshPortalMaterial
 *  does `scene.matrixWorld.copy(parent.matrixWorld)` -- it hands the portal's
 *  whole scene the window's transform. So the plates inherited the card's
 *  scale (they grew with it), its rotation (they came out crooked) and its
 *  offset (they sat off to one side with it).
 *
 *  SkyCard passes `worldUnits` now, which makes drei do
 *  `scene.matrixWorld.identity()` instead: the plates are in WORLD space and
 *  owe the card nothing. They are placed square to the camera, sized to fill
 *  the frame, every frame -- so they are a full-screen picture that happens
 *  to be visible only through whatever hole the card currently is. The card
 *  growing reveals more of a picture that never moved.
 *
 *  Think of it the way it was described: the sky is the top layer with a
 *  hole in it, and foreground, mid and background are full-screen sheets
 *  stacked behind, scrolling past the hole.
 */

/** Below this width-over-height, a plate is a cut-out subject rather than
 *  scenery, and is fitted to the frame's height instead of covering it. The
 *  backdrops and cliffs are all 1.54; the figure is 0.87. */
const SUBJECT_ASPECT = 1.2

function dressPlate(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
}



/** One full-screen sheet of painted art. */
function Plate({
  folder,
  layer,
  order,
  progressRef,
  camRef,
}: {
  folder: string
  layer: (typeof CARD_LAYERS)[number]
  order: number
  /** How far through the card's own scene the reader is, 0..1. */
  progressRef: React.RefObject<number>
  /** The REAL camera's pose -- see CameraPose. */
  camRef: React.RefObject<CameraPose | null>
}) {
  const map = useTexture(cardLayerUrl(folder, layer.file), dressPlate)
  const mesh = useRef<THREE.Mesh>(null)
  const scratch = useMemo(() => makeScreenPlaneScratch(), [])

  useFrame(() => {
    const node = mesh.current
    const cam = camRef.current
    if (!node || !cam) return
    const progress = progressRef.current ?? 0
    const d = CARD_PLATE_DISTANCE

    // The frame, in world units, at the sheet's own distance.
    const frameW = 2 * d * skyFrame.tanH
    const frameH = 2 * d * skyFrame.tanV

    const image = map.image as { width: number; height: number } | undefined
    const aspect = image && image.height ? image.width / image.height : 1
    const subject = aspect < SUBJECT_ASPECT

    // THE VIEW TRAVELS DOWN THE PICTURE, which is to say the sheet travels
    // UP the screen. It ran the other way: at progress 0 the sheet sat above
    // centre, so the frame opened on the BOTTOM of the image and walked up
    // to the top, and everything on screen slid downwards as you scrolled
    // down. On the reference a near mountain rises into the frame from below
    // and climbs out of the top. Hence the sign here, and it is the whole of
    // "it should be scrolling down, not up".
    //
    // The travel itself is stated per layer -- see CARD_LAYERS -- and capped
    // at the sheet's own overflow so it can never slide off its own picture.
    let w: number
    let h: number
    let up: number
    if (subject) {
      // A FIGURE STANDS IN THE SCENE -- see CARD_SUBJECT_HEIGHT. Sized to
      // less than the frame so it reads as someone in the picture rather
      // than a portrait filling it, and small enough to have somewhere to
      // travel.
      h = frameH * CARD_SUBJECT_HEIGHT
      w = h * aspect
      // AND NEVER WIDER THAN THE FRAME. Sized by height alone, a figure
      // 0.87 as wide as they are tall comes out 1.27 frames wide on a 9:16
      // phone -- both arms off the sides. Fitting to the width instead
      // where that happens costs the desktop nothing: there the same figure
      // is a third of the frame and this branch never runs.
      if (w > frameW * 0.9) {
        w = frameW * 0.9
        h = w / aspect
      }
      // CENTRED ON ITS TRAVEL, not stood on the floor. A cut-out has no
      // overflow of its own, so its travel is the layer's stated one and it
      // is hung so the midpoint of that journey is the middle of the frame
      // -- in frame throughout the middle of the scroll, cropped at the ends.
      up = (progress - 0.5) * layer.travel * frameH
    } else {
      // Scenery is drawn taller than the screen and covers the width, so no
      // edge of it can wander in. Its travel is the layer's, clamped to the
      // overflow it actually has.
      const tall = frameH * layer.zoom
      const boxW = frameW * CARD_PLATE_MARGIN
      const wide = aspect > boxW / tall
      w = wide ? tall * aspect : boxW
      h = wide ? tall : boxW / aspect
      const travel = Math.min(layer.travel * frameH, Math.max(0, h - frameH))
      up = (progress - 0.5) * travel
    }
    node.scale.set(w, h, 1)
    placeScreenPlane(node, cam, d, up, 0, scratch)
  })

  return (
    // Named so a probe can measure it. "The picture does not scale with the
    // window" is the claim this whole file exists to make good on, and it
    // cannot be checked on an anonymous mesh.
    <mesh ref={mesh} name={`card-sheet-${layer.file}`} renderOrder={order} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      {/* depthTest off and an explicit renderOrder: the sheets are stacked
          in paint order, back to front, and they all sit at the same
          distance, so there is no depth for the buffer to sort by. */}
      <meshBasicMaterial map={map} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** The beat's words, over the scene and clipped by the hole like everything
 *  else here -- so as the card opens the type is revealed with the picture
 *  rather than arriving separately on top of it. */
function Overlay({
  copy,
  ink,
  openRef,
  progressRef,
  camRef,
}: {
  copy: CardCopy
  ink: string
  openRef: React.RefObject<number>
  progressRef: React.RefObject<number>
  camRef: React.RefObject<CameraPose | null>
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const texture = useRef<THREE.CanvasTexture | null>(null)
  const painted = useRef<string | null>(null)
  const aspect = useRef(1)
  /** See where it is set: the canvas got narrower and the plane follows. */
  const widthScale = useRef(1)
  const scratch = useMemo(() => makeScreenPlaneScratch(), [])

  useEffect(() => {
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) painted.current = null
    })
    return () => {
      cancelled = true
    }
  }, [])

  useFrame(() => {
    const node = mesh.current
    const cam = camRef.current
    if (!node || !cam) return

    const key = `${copy.text}|${skyFrame.portrait}`
    if (painted.current !== key) {
      const c = (canvas.current ??= document.createElement("canvas"))
      // NO SCRIM. "For the text, it has the typical AI slop background. The
      // text needs no background." It was a soft dark wash painted into the
      // same canvas, there to hold white type over a busy picture -- which
      // is a real problem and this is the wrong answer to it. The reference
      // sets its captions straight onto the scene with nothing behind them.
      const m = paintCardText(c, copy, ink, skyFrame.portrait, false, true)
      aspect.current = m.height / m.width
      // THE CANVAS IS NARROWER THAN IT WAS, so the plane has to be too or
      // the same type would be drawn half again as large. The unscrimmed
      // canvas is now sized to the column rather than to the scrim's
      // fade-out, and CARD_TEXT_SCREEN_WIDTH was authored against the wide
      // one; this carries the authored number across unchanged. The plane's
      // HEIGHT is identical either way -- w * aspect cancels the factor --
      // so nothing about this caption moves.
      widthScale.current = m.width / CARD_PAINT_WIDTH
      const previous = texture.current
      if (!previous || previous.image !== c || previous.userData.h !== c.height) {
        previous?.dispose()
        const tex = new THREE.CanvasTexture(c)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        tex.userData.h = c.height
        texture.current = tex
      }
      texture.current!.needsUpdate = true
      if (mat.current) {
        mat.current.map = texture.current
        mat.current.needsUpdate = true
      }
      painted.current = key
    }

    // A SHADE NEARER THAN THE SHEETS, so it is never sorted behind one.
    const d = CARD_PLATE_DISTANCE * 0.92
    const frameW = 2 * d * skyFrame.tanH
    const frameH = 2 * d * skyFrame.tanV
    const share = skyFrame.portrait ? CARD_TEXT_SCREEN_WIDTH_PORTRAIT : CARD_TEXT_SCREEN_WIDTH
    const w = share * frameW * widthScale.current
    const h = w * aspect.current
    node.scale.set(w, h, 1)

    // Low and to the LEFT, drifting up a touch as the scene is scrolled --
    // the same gesture as the sheets, at the slowest rate of all, so the
    // words sit in the world rather than on the glass.
    //
    // Left rather than centred because the figure has the middle: see
    // CARD_TEXT_SCREEN_GUTTER.
    const progress = progressRef.current ?? 0
    const up = frameH * (CARD_TEXT_SCREEN_BOTTOM + 0.03 * progress) + h / 2
    const across = -(frameW / 2 - w / 2 - frameW * CARD_TEXT_SCREEN_GUTTER)
    placeScreenPlane(node, cam, d, up, across, scratch)

    // IN WITH THE CARD. A sliver of a full-screen heading showing through a
    // small card reads as a mistake; the words belong to the scene, so they
    // arrive once there is a scene to read them against.
    if (mat.current) {
      const open = openRef.current ?? 0
      mat.current.opacity = THREE.MathUtils.clamp((open - 0.45) / 0.35, 0, 1)
    }
  })

  return (
    // Named so a probe can read where the words actually sit. "The caption
    // is clear of the figure" is a placement claim, and placement claims
    // belong on a measurable object.
    <mesh ref={mesh} name="card-text" renderOrder={20} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial ref={mat} transparent depthTest={false} depthWrite={false} opacity={0} toneMapped={false} />
    </mesh>
  )
}

export function CardScene({
  folder,
  paletteIndex,
  nextFolder,
  copy,
  progressRef,
  openRef,
  camRef,
}: {
  /** Which folder of painted sheets this beat opens into. */
  folder: string
  /** Which palette the ground and the type take. */
  paletteIndex: number
  /** The folder the NEXT parallax beat will want, warmed while this one is
   *  up so its sheets are in drei's cache before the hole opens on them. */
  nextFolder?: string
  copy: CardCopy
  /** Progress through the card's own scene, 0..1. A ref: this changes every
   *  frame, and a render per frame would put the sheets a frame behind the
   *  window that reveals them. */
  progressRef: React.RefObject<number>
  /** How open the card is, 0..1 -- only the type uses it. */
  openRef: React.RefObject<number>
  /** The real camera's pose, handed down from SkyCard, which sees it. */
  camRef: React.RefObject<CameraPose | null>
}) {
  const palette = CARD_PALETTES[paletteIndex % CARD_PALETTES.length]
  const scratch = useMemo(() => makeScreenPlaneScratch(), [])
  const ground = useRef<THREE.Mesh>(null)

  useEffect(() => {
    if (!nextFolder) return
    CARD_LAYERS.forEach((layer) => useTexture.preload(cardLayerUrl(nextFolder, layer.file)))
  }, [nextFolder])

  useFrame(() => {
    const node = ground.current
    const cam = camRef.current
    if (!node || !cam) return
    const d = CARD_PLATE_DISTANCE * 1.4
    node.scale.set(2 * d * skyFrame.tanH * 1.6, 2 * d * skyFrame.tanV * 1.6, 1)
    placeScreenPlane(node, cam, d, 0, 0, scratch)
  })

  return (
    <>
      {/* Behind everything: a flat ground in the beat's own colour, so the
          hole shows a colour rather than the sky outside it while the
          plates are still loading or wherever a cut-out leaves a gap. */}
      <mesh ref={ground} renderOrder={-1} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color={palette.near} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* Suspended on its own, so a plate still in flight holds up only the
          plates -- the ground and the type render regardless. */}
      <Suspense fallback={null}>
        {CARD_LAYERS.map((layer, i) => (
          <Plate
            key={layer.file}
            folder={folder}
            layer={layer}
            order={i}
            progressRef={progressRef}
            camRef={camRef}
          />
        ))}
      </Suspense>

      <Overlay copy={copy} ink={palette.ink} openRef={openRef} progressRef={progressRef} camRef={camRef} />
    </>
  )
}
