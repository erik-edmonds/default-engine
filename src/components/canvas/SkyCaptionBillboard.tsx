"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { skyScroll } from "@/helpers/skyScroll"
import { skyCaptionBox } from "@/helpers/skyCaptionBox"
import { flightBasis, makeFlightBasis, placeInFlightFrame, viewAxisUp } from "@/config/flightFrame"
import { corridorOrigin, skyTextFocus, SKY_TEXT_CUES } from "@/config/skyJourney"
import {
  CAPTION_CSS_WIDTH,
  CAPTION_FADE_IN,
  CAPTION_FAR_AXIAL,
  CAPTION_NEAR_AXIAL,
  CAPTION_SIDE_OFFSET,
  CAPTION_UP_OFFSET,
  CAPTION_WORLD_WIDTH,
} from "@/config/paperSky"
import { CAMERA_BEHIND } from "@/config/flightFrame"

/** The sky journey's text, standing IN the corridor.
 *
 *  Three arrangements have been tried and this is what separates them. Paper
 *  signs on strings could carry three or four words. A DOM block pinned to one
 *  half of the frame read beautifully but arrived all at once. A DOM block
 *  PROJECTED from a point in the corridor got the approach right -- small and
 *  far, growing, sweeping past -- but could never be behind anything, because
 *  it was painted over the canvas: "since it is in the scene, it shouldn't be
 *  on top of the dragonite, the dragonite should be blocking parts of it, like
 *  an object being obscured by something else closer."
 *
 *  So the words are geometry now: drawn once into a 2D canvas and carried on a
 *  plane in the corridor. Real depth-testing, so the Dragonite covers whatever
 *  part of the paragraph it stands in front of, per pixel.
 *
 *  WHY NOT drei's Html with occlude="blending", which is the obvious answer:
 *  tried, and it composites outside this scene's postprocessing, so what
 *  arrived was a small black rectangle where the words should be. And why not
 *  3D text (troika): it wants a font file, and the face this has to match is
 *  the one next/font generates for the name stamp, which has no stable URL.
 *  A canvas gets that face for free -- the browser already has it loaded.
 *
 *  Nothing here is on a clock. Where the block is, how big and how solid are
 *  all functions of `turn` -- the progress of this block's turn through its
 *  section (see skyTextFocus) -- so the reader's scroll drives every part. */

/** Pixels of texture per CSS pixel of the design. Three, because the block is
 *  drawn at CAPTION_CSS_WIDTH and grows to well over twice that on screen as
 *  it closes; at 1x the type would be soft exactly when it is most readable. */
const TEXTURE_SCALE = 3

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

/** The family the rest of the site is set in.
 *
 *  next/font rewrites the family name at build time, so it cannot be spelled
 *  here -- it is read off the same custom property the stylesheets use, which
 *  is the one place it is stated. */
function nunito() {
  if (typeof document === "undefined") return "sans-serif"
  const declared = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-nunito")
    .trim()
  return declared ? `${declared}, system-ui, sans-serif` : "system-ui, sans-serif"
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Draw one block, and report how tall it came out so the plane can match. */
function paint(canvas: HTMLCanvasElement, cue: (typeof SKY_TEXT_CUES)[number]) {
  const s = TEXTURE_SCALE
  const W = CAPTION_CSS_WIDTH
  const family = nunito()
  const ctx = canvas.getContext("2d")!

  // Measured first, on a throwaway pass, because the height depends on how the
  // body wraps and the canvas has to be sized before anything is drawn.
  ctx.font = `400 21px ${family}`
  const bodyLines = wrap(ctx, cue.body, W)
  ctx.font = `700 54px ${family}`
  const headLines = wrap(ctx, cue.text, W)
  const height = 15 + 16 + headLines.length * 57 + 18 + bodyLines.length * 33

  canvas.width = W * s
  canvas.height = Math.ceil(height) * s
  ctx.setTransform(s, 0, 0, s, 0, 0)
  // Aligned toward the middle of the picture, so the straight edge of the type
  // runs down the side the subject is on -- except the contact card, which is
  // ON the middle and so is set centred. Ragging it toward one side would
  // pull it off the axis it was just put on.
  const right = cue.side < 0
  ctx.textAlign = cue.centred ? "center" : right ? "right" : "left"
  const x = cue.centred ? W / 2 : right ? W : 0

  // The same shadow the DOM block carried: the paper sky is bright and its
  // value changes as clouds pass, so the type brings its own contrast rather
  // than relying on the backdrop.
  ctx.shadowColor = "rgba(24, 32, 46, 0.55)"
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 1

  let y = 15
  ctx.font = `700 15px ${family}`
  ctx.fillStyle = "rgba(255,255,255,0.82)"
  ctx.letterSpacing = "3.3px"
  ctx.fillText(cue.eyebrow.toUpperCase(), x, y)
  ctx.letterSpacing = "0px"

  y += 16 + 44
  ctx.font = `700 54px ${family}`
  ctx.fillStyle = "#ffffff"
  for (const l of headLines) {
    ctx.fillText(l, x, y)
    y += 57
  }

  y += 18 - 57 + 33
  ctx.font = `400 21px ${family}`
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  for (const l of bodyLines) {
    ctx.fillText(l, x, y)
    y += 33
  }
  return height
}

export function SkyCaptionBillboard() {
  const group = useRef<THREE.Group>(null)
  const mesh = useRef<THREE.Mesh>(null)
  const basis = useRef<ReturnType<typeof makeFlightBasis> | null>(null)
  const origin = useRef<{ x: number; y: number; z: number } | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const texture = useRef<THREE.CanvasTexture | null>(null)
  const material = useRef<THREE.MeshBasicMaterial | null>(null)
  // WHICH BLOCK THE CANVAS CURRENTLY HOLDS, and how tall it came out.
  //
  // Refs, not state, and that is a bug fix rather than an optimisation. The
  // cue used to live in useState: the frame loop called setIndex when the
  // block changed and a useEffect repainted the canvas on the next render.
  // Measured at offset 1033, which is the second block's section: the plane
  // was in the second block's HALF of the frame, at the second block's
  // distance, painted with the FIRST block's words. Position is computed in
  // the frame loop and content was arriving a render later, so on a machine
  // running at two frames a second the two were routinely a beat apart, and
  // the render that closed the gap sometimes never came at all.
  //
  // Painted here instead, in the same callback that places it, from the same
  // `focus` -- so the words on the plane and the plane's position cannot
  // disagree, whatever the frame rate.
  const painted = useRef(-1)
  const aspect = useRef(1)
  const fontsReady = useRef(false)
  // Lazily, inside the frame loop: a vector made during render is a render
  // value, and writing to one from a frame callback is what
  // react-hooks/immutability rejects.
  const corner = useRef<THREE.Vector3 | null>(null)

  // The one thing that genuinely cannot be done in the frame loop: waiting for
  // the webfont. A first paint before Nunito has loaded bakes the fallback
  // face into the texture, so the flag below forces one repaint when it
  // lands, and the frame loop does the actual drawing as usual.
  useEffect(() => {
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) {
        fontsReady.current = true
        painted.current = -1
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  useFrame((state) => {
    const node = group.current
    if (!node) return
    const focus = skyTextFocus(skyScroll.display)
    // turn < 0 is the quiet stretch between one block's turn and the next.
    if (focus.turn < 0) {
      node.visible = false
      skyCaptionBox.visible = false
      return
    }
    node.visible = true

    // PAINTED HERE, BEFORE IT IS PLACED. Same frame, same `focus`.
    if (focus.index !== painted.current) {
      const cue = SKY_TEXT_CUES[focus.index]
      if (cue) {
        const c = (canvas.current ??= document.createElement("canvas"))
        const height = paint(c, cue)
        aspect.current = height / CAPTION_CSS_WIDTH
        // A NEW TEXTURE WHENEVER THE CANVAS RESIZES, not a re-upload of the
        // old one. Blocks wrap to different numbers of lines, so the canvas
        // changes height from one to the next, and handing a driver a
        // resized canvas through the same texture object is how stale rows
        // of the previous block survive underneath the new one.
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
        if (material.current) {
          material.current.map = tex
          material.current.needsUpdate = true
        }
        painted.current = focus.index
      }
    }
    // The plane is authored square and SCALED to the block's proportions, so
    // the shape follows the paint in the same frame. Rebuilding
    // <planeGeometry> through React state was the other half of the lag.
    if (mesh.current) mesh.current.scale.set(1, aspect.current, 1)

    const axial = CAPTION_FAR_AXIAL + (CAPTION_NEAR_AXIAL - CAPTION_FAR_AXIAL) * focus.turn
    const ahead = axial - CAMERA_BEHIND
    placeInFlightFrame(
      flightBasis(skyScroll.display, (basis.current ??= makeFlightBasis())),
      corridorOrigin(skyScroll.display, (origin.current ??= { x: 0, y: 0, z: 0 })),
      ahead,
      // ON THE AXIS for the contact card -- see `centred` in skyTextFocus.
      focus.centred ? 0 : focus.side * CAPTION_SIDE_OFFSET,
      viewAxisUp(ahead) + CAPTION_UP_OFFSET,
      node.position,
    )
    // Square to the corridor, like every other flat thing out here -- see the
    // note on hang.rotation.y in PaperSky.
    node.rotation.y = basis.current
      ? Math.atan2(basis.current.fx, basis.current.fz) + Math.PI
      : Math.PI

    if (material.current) {
      // COMING OUT OF THE HAZE ONLY. There is no matching fade on the way
      // out: the block keeps its full strength all the way past the camera
      // and leaves through the side of the frame under its own travel.
      // Fading it out in front of the viewer was the bug.
      material.current.opacity = smoothstep(Math.min(1, focus.turn / CAPTION_FADE_IN))
    }

    // WHERE IT LANDED ON SCREEN, for the DOM contact panel to sit under.
    // See helpers/skyCaptionBox: the words are a texture and cannot be
    // clicked, so the last block's ACTIONS are real DOM placed against this.
    const plane = mesh.current
    if (plane) {
      plane.updateWorldMatrix(true, false)
      const box =
        plane.geometry.boundingBox ??
        (plane.geometry.computeBoundingBox(), plane.geometry.boundingBox!)
      let left = Infinity
      let right = -Infinity
      let bottom = -Infinity
      let behind = false
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          corner.current ??= new THREE.Vector3()
          const v = corner.current.set(x, y, 0).applyMatrix4(plane.matrixWorld)
          // Camera space first: project() flips sign behind the lens, and a
          // block that has swept past would otherwise report a box on the
          // wrong side of the picture.
          if (state.camera.worldToLocal(v.clone()).z >= 0) behind = true
          v.project(state.camera)
          const px = (v.x * 0.5 + 0.5) * state.size.width
          const py = (-v.y * 0.5 + 0.5) * state.size.height
          left = Math.min(left, px)
          right = Math.max(right, px)
          bottom = Math.max(bottom, py)
        }
      }
      // WHICH BLOCK IS ACTUALLY PAINTED ON THE PLANE, published so a probe can
      // check the words against the position. These two came apart once --
      // the second block's place in the frame carrying the first block's
      // text -- and nothing about where the plane ended up could have
      // revealed it.
      node.userData.cue = painted.current
      skyCaptionBox.visible = !behind
      skyCaptionBox.left = left
      skyCaptionBox.right = right
      skyCaptionBox.bottom = bottom
    }
  })

  return (
    <group ref={group} name="sky-caption-3d" visible={false}>
      <mesh ref={mesh} frustumCulled={false}>
        {/* Square, and scaled to the block's aspect in the frame loop. */}
        <planeGeometry args={[CAPTION_WORLD_WIDTH, CAPTION_WORLD_WIDTH]} />
        {/* depthTest ON is the whole point -- it is what lets the Dragonite
            stand in front of the words. depthWrite OFF because the plane is
            mostly transparent and would otherwise punch a hole in whatever is
            behind it. Unlit: this is type, not a surface, and it should not
            pick up the paper world's evening light. */}
        <meshBasicMaterial
          ref={material}
          transparent
          depthWrite={false}
          opacity={0}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
