"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { skyScroll } from "@/helpers/skyScroll"
import { skyFrame } from "@/helpers/skyFrame"
import { skyCaptionBox } from "@/helpers/skyCaptionBox"
import { paintCardText, CARD_TEXT_CSS_WIDTH, type CardTextMetrics } from "@/helpers/cardText"
import {
  makeScreenPlaneScratch,
  placeScreenPlane,
  screenPlaneFrame,
} from "@/helpers/screenPlane"
import { skyTextFocus, SKY_TEXT_CUES } from "@/config/skyJourney"

/** THE WORDS FOR EVERY SECTION THAT IS NOT A CARD.
 *
 *  Section 3's type lives inside the card, clipped by its hole (see
 *  CardScene's Overlay). This is the other three:
 *
 *    intro  section 1 -- one centred line while the corridor is still flying
 *    side   section 2 -- a block set in one half of the frame, the subject
 *                        crossing the other, appearing in place on scroll
 *    outro  section 4 -- the contact card, centred, with the DOM panel of
 *                        real links positioned under it
 *
 *  APPEARS, DOES NOT FLY IN. "Text doesn't scroll in, it appears in on
 *  scroll to the proper section for the text to appear." So this is a plane
 *  parked square to the camera at a fixed distance -- it does not travel
 *  down a corridor, it does not grow, it fades up as its beat comes round
 *  and fades down as the beat ends. The scroll moves the reader between
 *  beats; within one, the words are simply there.
 */

/** How far in front of the camera the type hangs. Nearer than the card's
 *  sheets so it is never sorted behind one, far enough that the lens'
 *  perspective does not warp a wide block at the edges. */
const TEXT_DISTANCE = 18

/** DARK INK, NOT WHITE. These words sit on the open paper sky, which is a
 *  pale flat blue -- white type on it with the card's dark scrim behind came
 *  out as a grey smudge you could not read. Near-black with a soft white
 *  halo is how ink on paper behaves, and the sky is made of paper. */
const SKY_INK = "#16202e"

/** THE COLUMN OF TYPE as a share of the frame's width -- not the plane's.
 *
 *  These are the on-screen column widths the old numbers produced (0.4 and
 *  0.52 of the frame, of which 460/745 was type), restated against the
 *  column itself now that the canvas is sized to it. The rendered type does
 *  not change size by a pixel; what changes is that the plane's centre is
 *  now the column's centre, so placing one side mirrors the other. */
const TEXT_COLUMN = 0.247
const TEXT_COLUMN_CENTRED = 0.321

/** The gap between the frame's edge and the column's outer edge, both sides.
 *
 *  THIS IS THE MIRROR. The old placement put the plane's centre at a fixed
 *  0.26 of the frame either side of the middle -- but the type sat left of
 *  that plane's centre, so the two sides were not reflections of each other:
 *  a left-hand block ran to within 0.054 of the frame's edge while a
 *  right-hand one stopped 0.179 short of it and crowded the middle instead,
 *  where the subject is. Measured from the frame's edge, both sides get the
 *  same margin by construction. 0.054 is what the left-hand blocks already
 *  had, so they do not move at all and only the right-hand ones are
 *  corrected. */
const TEXT_MARGIN = 0.054

/** How far ABOVE centre the intro sits.
 *
 *  The subject hangs on his string in the middle of the frame through the
 *  whole of section 1, so a centred intro is printed straight across him --
 *  which is exactly how it came out. The contact card has no such problem
 *  and stays centred: by then he has been drawn up out of shot. */
const TEXT_INTRO_UP = 0.3

/** Where in the beat's turn the words are up.
 *
 *  Both ends are ramps rather than cuts, and the hold between them is most
 *  of the beat -- the reader should be able to stop anywhere in the middle
 *  of a beat and read it, which is also where the scroll magnet parks. */
const FADE_IN_BY = 0.22
const FADE_OUT_FROM = 0.8

function fadeFor(turn: number) {
  if (turn < 0) return 0
  if (turn < FADE_IN_BY) return THREE.MathUtils.smoothstep(turn / FADE_IN_BY, 0, 1)
  if (turn > FADE_OUT_FROM) {
    return 1 - THREE.MathUtils.smoothstep((turn - FADE_OUT_FROM) / (1 - FADE_OUT_FROM), 0, 1)
  }
  return 1
}

export function SkyText() {
  const group = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useRef<THREE.MeshBasicMaterial | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const texture = useRef<THREE.CanvasTexture | null>(null)
  const painted = useRef<string | null>(null)
  /** What the last paint turned out to be: how tall, how wide, and where the
   *  ink actually landed. Placement and the contact panel's box both read
   *  it, so neither has to assume the canvas's padding. */
  const metrics = useRef<CardTextMetrics>({
    height: 1,
    width: CARD_TEXT_CSS_WIDTH,
    column: { left: 0, right: CARD_TEXT_CSS_WIDTH },
    ink: { left: 0, right: CARD_TEXT_CSS_WIDTH, top: 0, bottom: 1 },
  })
  const corner = useRef<THREE.Vector3 | null>(null)
  const scratch = useMemo(() => makeScreenPlaneScratch(), [])

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
    const node = group.current
    const plane = mesh.current
    if (!node || !plane) return

    const focus = skyTextFocus(skyScroll.display)
    const cue = focus.index < 0 ? null : SKY_TEXT_CUES[focus.index]
    // Section 3's words belong to the card, which clips them to its hole.
    if (!cue || cue.mode === "parallax" || focus.turn < 0) {
      node.visible = false
      if (!cue || cue.mode !== "outro") skyCaptionBox.visible = false
      return
    }
    node.visible = true

    // PAINTED IN THE FRAME LOOP, from the same focus that places it. Content
    // arriving a render after the position it belongs to is how one block's
    // place in the frame once ended up carrying another block's words.
    const key = `${cue.text}|${skyFrame.portrait}`
    if (painted.current !== key) {
      const c = (canvas.current ??= document.createElement("canvas"))
      // CENTRED BEATS GET CENTRED LINES. The intro and the outro sit on the
      // frame's axis, and a left-aligned column centred on that axis leaves
      // a short heading hanging to one side of it -- "Get to know me" is one
      // line of fourteen characters in a column built for nine words. The
      // facts stay left-aligned: they are set beside the subject, where the
      // column's own edge is what lines up with the frame's.
      metrics.current = paintCardText(
        c,
        cue,
        SKY_INK,
        skyFrame.portrait,
        false,
        cue.mode !== "side",
      )
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

    const frame = screenPlaneFrame(TEXT_DISTANCE)
    const m = metrics.current
    const centred = cue.mode !== "side"
    const col = centred ? TEXT_COLUMN_CENTRED : TEXT_COLUMN
    // The plane is the whole canvas; the column is the part of it with type
    // on. Size by the column and let the canvas follow, so the rendered type
    // is the same size whatever margin the canvas carries.
    const w = col * frame.width * (m.width / CARD_TEXT_CSS_WIDTH)
    const h = w * (m.height / m.width)
    plane.scale.set(w, h, 1)

    // THE WORDS SIT OPPOSITE THE SUBJECT. `side` alternates within the
    // section, and AvatarController reads the same number to put him in the
    // other half -- see skyDriftSide.
    //
    // Placed by its OUTER MARGIN so the two sides are reflections. See
    // TEXT_MARGIN.
    //
    // AND NOTHING ELSE. There was a correction here that measured the INK
    // and shifted the plane to centre it, meant to catch a word too long to
    // break. It fires on every beat instead: the type is left-aligned and
    // never fills its column, so the ink's centre is always left of the
    // column's, and the correction quietly pulled every block sideways by
    // the length of its own rag -- which put the intro 0.022 off the axis
    // and made the three facts' margins differ by 0.013 when the whole
    // point of this was that they should not. The canvas is symmetric about
    // the column; align the column and stop.
    const across = centred ? 0 : cue.side * (0.5 - TEXT_MARGIN - col / 2) * frame.width
    const up = cue.mode === "intro" ? TEXT_INTRO_UP * frame.height : 0
    placeScreenPlane(node, state.camera, TEXT_DISTANCE, up, across, scratch)

    if (mat.current) mat.current.opacity = fadeFor(focus.turn)

    // WHERE THE COLUMN OF TYPE LANDED, in ndc. Published because "the two
    // sides are mirrors" is a claim about the column's margins, and the
    // column is a region inside a canvas inside a plane -- no check reading
    // the mesh's own box can see it.
    corner.current ??= new THREE.Vector3()
    // IN THE PLANE'S OWN UNIT SPACE. The geometry is a 1x1 quad and the
    // scale lives in the matrix, so a point handed to applyMatrix4 must be
    // the fraction, not the fraction times the width -- multiplying first
    // applies the scale twice and reports a column five times wider than
    // the frame.
    plane.updateWorldMatrix(true, false)
    const edges: number[] = []
    for (const f of [m.column.left / m.width - 0.5, m.column.right / m.width - 0.5]) {
      const v = corner.current.set(f, 0, 0).applyMatrix4(plane.matrixWorld)
      v.project(state.camera)
      edges.push(v.x)
    }
    node.userData.colLeftNdc = Math.min(edges[0], edges[1])
    node.userData.colRightNdc = Math.max(edges[0], edges[1])
    node.userData.cueSide = cue.side
    node.userData.cueMode = cue.mode
    node.userData.opacity = fadeFor(focus.turn)

    // WHERE THE WORDS LANDED, for the contact panel to sit under. Only the
    // outro has DOM under it, and publishing the box for any other beat
    // would have the panel chasing a block it does not belong to.
    if (cue.mode === "outro") {
      plane.updateWorldMatrix(true, false)
      // FROM THE INK, NOT FROM THE QUAD.
      //
      // The plane carries the canvas's padding, and the contact panel below
      // is sized from this box -- so boxing the quad made the panel wider
      // than the words it hangs under and pushed its left edge out past
      // them. These are the measured ink edges in the plane's own unit
      // space, which is what the corners below are expressed in.
      const inkX0 = m.ink.left / m.width - 0.5
      const inkX1 = m.ink.right / m.width - 0.5
      const inkY0 = 0.5 - m.ink.bottom / m.height
      const inkY1 = 0.5 - m.ink.top / m.height
      let left = Infinity
      let right = -Infinity
      let bottom = -Infinity
      let behind = false
      for (const x of [inkX0, inkX1]) {
        for (const y of [inkY0, inkY1]) {
          corner.current ??= new THREE.Vector3()
          const v = corner.current.set(x, y, 0).applyMatrix4(plane.matrixWorld)
          if (state.camera.worldToLocal(v.clone()).z >= 0) behind = true
          v.project(state.camera)
          left = Math.min(left, (v.x * 0.5 + 0.5) * state.size.width)
          right = Math.max(right, (v.x * 0.5 + 0.5) * state.size.width)
          bottom = Math.max(bottom, (-v.y * 0.5 + 0.5) * state.size.height)
        }
      }
      skyCaptionBox.visible = !behind && fadeFor(focus.turn) > 0.5
      skyCaptionBox.left = left
      skyCaptionBox.right = right
      skyCaptionBox.bottom = bottom
    } else {
      skyCaptionBox.visible = false
    }
  })

  return (
    <group ref={group} name="sky-text" visible={false}>
      <mesh ref={mesh} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        {/* depthTest ON so the subject can pass in front of the words --
            that occlusion is what keeps the type in the scene rather than
            on the glass. depthWrite OFF because it is mostly transparent. */}
        <meshBasicMaterial ref={mat} transparent depthWrite={false} opacity={0} toneMapped={false} />
      </mesh>
    </group>
  )
}
