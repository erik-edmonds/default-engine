"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { skyFrame } from "@/helpers/skyFrame"
import { skyCaptionBox } from "@/helpers/skyCaptionBox"
import { paintCardText, CARD_TEXT_CSS_WIDTH, type CardCopy } from "@/helpers/cardText"
import {
  CARD_ASPECT,
  CARD_LAYERS,
  CARD_PALETTES,
  CARD_TEXT_LEFT,
  CARD_TEXT_RISE,
  CARD_TEXT_TOP,
  CARD_TEXT_WIDTH,
  LAYER_OVERSIZE,
} from "@/config/skyCards"

/** THE SCENE INSIDE ONE CARD.
 *
 *  Everything here lives in the CARD'S OWN LOCAL SPACE -- CARD_ASPECT wide,
 *  1 tall, centred on the origin -- because drei's MeshPortalMaterial hands
 *  the portal's scene the parent mesh's world matrix verbatim
 *  (`scene.matrixWorld.copy(parent.matrixWorld)`). So these layers are
 *  carried by the card: they grow with it, turn with it, and travel down the
 *  corridor with it, without a single line of code to keep them in step.
 *
 *  That is also why the card's scale must stay UNIFORM and its aspect lives
 *  in its geometry -- see CARD_ASPECT. A non-uniform scale on the window
 *  would stretch everything below by the card's proportions.
 *
 *  Anything that strays outside the window is clipped by the portal for
 *  free, which is what lets the bands be oversized and slide about without
 *  ever showing an edge.
 *
 *  PLACEHOLDER, AND DELIBERATELY SO: "they can just have placeholder
 *  parallax things inside it, we can focus on finetuning it once the
 *  structure is correct." Cut-paper bands are the same material the sky
 *  outside is made of, so the placeholder is at least in the right world --
 *  and it is generated rather than authored, so none of it is art that has
 *  to be thrown away when the real contents arrive.
 */

/** The project's sine hash.
 *
 *  Not `(i * 7919) % 1000` or any of its relatives: seeds that are linear in
 *  the index are pairwise correlated, and three of them together put every
 *  object on a diagonal lattice. That was a real bug in the fish school this
 *  same round. */
function hash(n: number, salt: number) {
  const x = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** A band of soft paper hills: flat along the bottom, bumpy along the top.
 *
 *  Built as a THREE.Shape rather than displaced from a plane so the silhouette
 *  is a genuine curve at any size -- the card grows to fill the screen, and a
 *  low-poly skyline would show its segments by the time it got there. */
function bandGeometry(width: number, bumpHeight: number, bumps: number, seed: number) {
  const shape = new THREE.Shape()
  const left = -width / 2
  // The body hangs well below the card's bottom edge, so no amount of drift
  // can lift the band's underside into the picture.
  const bodyDepth = 2.2
  shape.moveTo(left, -bodyDepth)
  shape.lineTo(left, 0)
  const step = width / bumps
  for (let i = 0; i < bumps; i++) {
    const x0 = left + i * step
    const h = bumpHeight * (0.45 + 0.75 * hash(i, seed))
    shape.quadraticCurveTo(x0 + step * 0.5, h * 2, x0 + step, 0)
  }
  shape.lineTo(left + width, -bodyDepth)
  shape.closePath()
  return new THREE.ShapeGeometry(shape, 16)
}

export function CardScene({
  index,
  copy,
  insideRef,
}: {
  index: number
  copy: CardCopy
  /** How far through the card's own scene the reader is, 0..1.
   *
   *  A REF, not a prop value, and that is the same decision SkyCaptionBillboard
   *  had to make for the cue index. This changes every frame; threading it
   *  through React would be a render per frame, and -- worse -- the layers
   *  would be a render behind the card that carries them, which on a machine
   *  running at two frames a second is a visible lag between the window and
   *  what is in it. */
  insideRef: React.RefObject<number>
}) {
  const palette = CARD_PALETTES[index % CARD_PALETTES.length]

  // One geometry per layer, built once. Seeded off the card's index so each
  // card's skyline is its own, and stable across re-renders.
  const bands = useMemo(
    () =>
      CARD_LAYERS.map((layer, i) =>
        bandGeometry(CARD_ASPECT * LAYER_OVERSIZE, layer.height, layer.bumps, index * 3 + i),
      ),
    [index],
  )
  useEffect(() => () => bands.forEach((g) => g.dispose()), [bands])

  // Each band is mixed from the card's sky toward its near colour by its own
  // depth, so a card is one light rather than four unrelated colours.
  const colours = useMemo(
    () =>
      CARD_LAYERS.map((layer) =>
        new THREE.Color(palette.sky).lerp(new THREE.Color(palette.near), layer.tint),
      ),
    [palette],
  )

  const layerRefs = useRef<(THREE.Mesh | null)[]>([])
  const disc = useRef<THREE.Mesh>(null)
  const textMesh = useRef<THREE.Mesh>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const texture = useRef<THREE.CanvasTexture | null>(null)
  const textMat = useRef<THREE.MeshBasicMaterial | null>(null)
  const painted = useRef<string | null>(null)
  const textAspect = useRef(1)
  const corner = useRef<THREE.Vector3 | null>(null)

  // The one thing that cannot be done in the frame loop: waiting for the
  // webfont. A first paint before Nunito has loaded bakes the fallback face
  // into the texture, so this forces one repaint when it lands.
  useEffect(() => {
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) painted.current = null
    })
    return () => {
      cancelled = true
    }
  }, [])

  useFrame((state) => {
    const inside = insideRef.current ?? 0

    // PAINTED IN THE FRAME LOOP, for the reason SkyCaptionBillboard documents
    // at length: content arriving a render after the position it belongs to
    // is how the second block's place in the frame ended up carrying the
    // first block's words.
    const key = `${copy.text}|${skyFrame.portrait}`
    if (painted.current !== key) {
      const c = (canvas.current ??= document.createElement("canvas"))
      const height = paintCardText(c, copy, palette.ink, skyFrame.portrait)
      textAspect.current = height / CARD_TEXT_CSS_WIDTH
      // A NEW TEXTURE WHENEVER THE CANVAS RESIZES. Blocks wrap to different
      // numbers of lines, and handing a driver a resized canvas through the
      // same texture object is how stale rows of the previous block survive
      // underneath the new one.
      const previous = texture.current
      if (!previous || previous.image !== c || previous.userData.h !== c.height) {
        previous?.dispose()
        const tex = new THREE.CanvasTexture(c)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 8
        tex.userData.h = c.height
        texture.current = tex
      }
      const tex = texture.current!
      tex.needsUpdate = true
      if (textMat.current) {
        textMat.current.map = tex
        textMat.current.needsUpdate = true
      }
      painted.current = key
    }

    // The bands slide, near ones further than far ones. That difference IS
    // the parallax -- there is no camera move inside a card, the card holds
    // still at its reading distance for the whole of INSIDE, and all the
    // depth the reader feels comes from these four rates.
    CARD_LAYERS.forEach((layer, i) => {
      const node = layerRefs.current[i]
      if (!node) return
      node.position.set(
        layer.drift * inside,
        layer.height - 0.5 + layer.rise * inside,
        -layer.depth,
      )
    })
    // The sun sits furthest back and barely moves, which is what reads as
    // distance -- a disc that travelled with the hills would read as a
    // balloon.
    if (disc.current) disc.current.position.set(0.52 - 0.03 * inside, 0.26 + 0.01 * inside, -0.85)

    const text = textMesh.current
    if (text) {
      const width = CARD_TEXT_WIDTH
      text.scale.set(width, width * textAspect.current, 1)
      text.position.set(CARD_TEXT_LEFT + width / 2, CARD_TEXT_TOP + CARD_TEXT_RISE * inside, 0.03)

      // WHERE THE WORDS LANDED ON SCREEN, for the DOM contact panel to sit
      // under -- see helpers/skyCaptionBox. The copy is a texture and cannot
      // be clicked, so the last card's ACTIONS are real DOM placed against
      // this box.
      //
      // Measured here rather than on the card, because the panel belongs
      // under the TYPE and the card is most of the screen by the time the
      // contact block is up.
      text.updateWorldMatrix(true, false)
      const box =
        text.geometry.boundingBox ?? (text.geometry.computeBoundingBox(), text.geometry.boundingBox!)
      let left = Infinity
      let right = -Infinity
      let bottom = -Infinity
      let behind = false
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          corner.current ??= new THREE.Vector3()
          const v = corner.current.set(x, y, 0).applyMatrix4(text.matrixWorld)
          // Camera space first: project() flips sign behind the lens, and a
          // card that has swept past would otherwise report a box on the
          // wrong side of the picture.
          if (state.camera.worldToLocal(v.clone()).z >= 0) behind = true
          v.project(state.camera)
          left = Math.min(left, (v.x * 0.5 + 0.5) * state.size.width)
          right = Math.max(right, (v.x * 0.5 + 0.5) * state.size.width)
          bottom = Math.max(bottom, (-v.y * 0.5 + 0.5) * state.size.height)
        }
      }
      skyCaptionBox.visible = !behind
      skyCaptionBox.left = left
      skyCaptionBox.right = right
      skyCaptionBox.bottom = bottom
    }
  })

  return (
    <>
      {/* The backdrop, far enough behind the window that no drift can pull
          its edge into view, and big enough to cover the window at that
          distance. Unlit, like everything in here: this is cut paper, and a
          light in the portal's scene would be a second lighting rig to keep
          in step with the one outside. */}
      <mesh position={[0, 0, -1.3]}>
        <planeGeometry args={[CARD_ASPECT * 3, 3]} />
        <meshBasicMaterial color={palette.sky} toneMapped={false} />
      </mesh>

      <mesh ref={disc}>
        <circleGeometry args={[0.14, 48]} />
        <meshBasicMaterial color={palette.glow} toneMapped={false} />
      </mesh>

      {CARD_LAYERS.map((layer, i) => (
        <mesh
          key={i}
          ref={(node) => {
            layerRefs.current[i] = node
          }}
          geometry={bands[i]}
        >
          <meshBasicMaterial color={colours[i]} toneMapped={false} />
        </mesh>
      ))}

      <mesh ref={textMesh}>
        {/* Authored 1x1 and scaled in the frame loop, so the block's
            proportions follow whatever paintCardText wrapped the copy into
            without rebuilding a geometry buffer. */}
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={textMat} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}
