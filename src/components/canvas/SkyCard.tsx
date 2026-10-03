"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { MeshPortalMaterial } from "@react-three/drei"

import { skyScroll } from "@/helpers/skyScroll"
import { skyCaptionBox } from "@/helpers/skyCaptionBox"
import { frameHalfHeight, frameHalfWidth } from "@/helpers/skyFrame"
import { CAMERA_BEHIND, flightBasis, makeFlightBasis, placeInFlightFrame, viewAxisUp } from "@/config/flightFrame"
import { corridorOrigin, skyCardState, SKY_TEXT_CUES } from "@/config/skyJourney"
import {
  CARD_ASPECT,
  CARD_CORNER,
  CARD_FAR_AXIAL,
  CARD_NEAR_AXIAL,
  CARD_READ_AHEAD,
  CARD_READ_AXIAL,
  CARD_SIDE_NDC,
  CARD_TURN,
  CARD_UP_NDC,
  CARD_WIDTH_NDC,
  cardCoverScale,
} from "@/config/skyCards"
import { CardScene } from "@/components/canvas/CardScene"

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

/** The window's shape: a rounded rectangle, CARD_ASPECT by 1.
 *
 *  A Shape rather than a plane because the corners have to be genuinely
 *  curved -- the card ends up covering the whole screen, and a chamfer made
 *  of three segments would be unmistakable by the time it got there. The UVs
 *  ShapeGeometry generates are unnormalised and wrong, which does not matter
 *  in the slightest: this mesh's material is the portal, and a portal samples
 *  by screen position, not by UV. */
function cardGeometry() {
  const w = CARD_ASPECT
  const h = 1
  const r = CARD_CORNER
  const x = -w / 2
  const y = -h / 2
  const shape = new THREE.Shape()
  shape.moveTo(x + r, y)
  shape.lineTo(x + w - r, y)
  shape.quadraticCurveTo(x + w, y, x + w, y + r)
  shape.lineTo(x + w, y + h - r)
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  shape.lineTo(x + r, y + h)
  shape.quadraticCurveTo(x, y + h, x, y + h - r)
  shape.lineTo(x, y + r)
  shape.quadraticCurveTo(x, y, x + r, y)
  return new THREE.ShapeGeometry(shape, 10)
}

export function SkyCard() {
  const group = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const basis = useRef<ReturnType<typeof makeFlightBasis> | null>(null)
  const origin = useRef<{ x: number; y: number; z: number } | null>(null)
  /** How far through the current card's own scene the reader is. Handed to
   *  CardScene as a ref so the layers move without a render per frame. */
  const inside = useRef(0)

  /** Which block the card is currently dressed as.
   *
   *  State, because the scene inside it is React -- its palette, its skyline
   *  and its words all change with the block. The frame loop below refuses to
   *  SHOW the card until this has caught up, which is the whole guard: a card
   *  placed for block two carrying block one's scene is exactly the fault the
   *  old caption billboard shipped once, and it is invisible to any check
   *  that only looks at where things are. */
  const [block, setBlock] = useState(0)

  const geometry = useMemo(() => cardGeometry(), [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    const node = group.current
    if (!node) return
    const card = skyCardState(skyScroll.display)

    if (card.index < 0 || card.phase === "away") {
      node.visible = false
      skyCaptionBox.visible = false
      return
    }
    if (card.index !== block) {
      // Dressed next render. The index changes during the quiet stretch
      // between blocks, where the card is away anyway, so this costs nothing
      // visible -- but it is what guarantees the two can never disagree.
      setBlock(card.index)
      node.visible = false
      skyCaptionBox.visible = false
      return
    }
    node.visible = true
    inside.current = card.inside
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
    node.userData.inside = card.inside
    node.userData.block = block

    // DEPTH. The approach brings the card out of the haze exactly as the old
    // caption came in -- that part of the corridor was tuned over three
    // rounds and is inherited rather than reinvented. It then STOPS at its
    // reading distance for the whole of expand/inside/contract, because a
    // card that is the screen cannot also be travelling, and finally sweeps
    // past the lens on the way out.
    let axial: number
    if (card.phase === "approach") {
      // Eased, so the card does not arrive at its reading distance still
      // travelling and then stop dead the instant it starts to grow.
      axial = CARD_FAR_AXIAL + (CARD_READ_AXIAL - CARD_FAR_AXIAL) * (card.u * card.u * (3 - 2 * card.u))
    } else if (card.phase === "depart") {
      // Linear on the way out: it is leaving, and easing the far end would
      // have it decelerate into the lens.
      axial = CARD_READ_AXIAL + (CARD_NEAR_AXIAL - CARD_READ_AXIAL) * card.u
    } else {
      axial = CARD_READ_AXIAL
    }
    const ahead = axial - CAMERA_BEHIND

    // SIZE. Both ends are measured at the card's READING distance, not at its
    // live one, and that is the same reasoning the caption needed: a size
    // re-derived at the live distance would pin the card to the screen and it
    // would never appear to approach or to leave at all. Held at a constant
    // world size, perspective does the approach for free.
    const halfW = frameHalfWidth(CARD_READ_AHEAD)
    const halfH = frameHalfHeight(CARD_READ_AHEAD)
    const shut = (CARD_WIDTH_NDC * 2 * halfW) / CARD_ASPECT
    const open = cardCoverScale(halfW, halfH)
    const scale = shut + (open - shut) * card.open
    // UNIFORM, always. The portal's scene inherits this matrix whole (see
    // CardScene), so a non-uniform scale here would stretch everything inside
    // the card by the card's own proportions.
    if (mesh.current) mesh.current.scale.setScalar(scale)

    // PLACE. Off to its own side of the frame while it is a card, dead centre
    // by the time it is the screen -- the subject occupies the other half for
    // the whole of the approach, which is the composition the sky is built
    // around, and there is no other half left once the card has opened.
    const shutness = 1 - card.open
    placeInFlightFrame(
      flightBasis(skyScroll.display, (basis.current ??= makeFlightBasis())),
      corridorOrigin(skyScroll.display, (origin.current ??= { x: 0, y: 0, z: 0 })),
      ahead,
      card.side * CARD_SIDE_NDC * halfW * shutness,
      viewAxisUp(ahead) + CARD_UP_NDC * halfH * shutness,
      node.position,
    )

    // TURN. A closed card is a few degrees off square, which is what makes it
    // read as an object standing in the corridor rather than a rectangle
    // pasted onto the picture -- it is the first thing the second reference
    // clip shows. It unwinds to exactly square as the card opens, because a
    // screen cannot be at an angle.
    const square = basis.current ? Math.atan2(basis.current.fx, basis.current.fz) + Math.PI : Math.PI
    node.rotation.set(0, square - card.side * CARD_TURN * shutness, 0)
  })

  return (
    <group ref={group} name="sky-card" visible={false}>
      <mesh ref={mesh} geometry={geometry}>
        {/* blur 0 skips the SDF pass entirely -- see the note above on why
            blend is never raised off zero. */}
        <MeshPortalMaterial blend={0} blur={0} resolution={512} side={THREE.DoubleSide}>
          <CardScene
            key={block}
            index={block}
            copy={SKY_TEXT_CUES[block]}
            insideRef={inside}
          />
        </MeshPortalMaterial>
      </mesh>
    </group>
  )
}
