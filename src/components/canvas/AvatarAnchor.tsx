"use client"

import { useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { useAtomValue, useSetAtom } from "jotai"

import { BUBBLE_ANCHOR_UP, bubbleNode, bubbleOnScreen, unreadNode } from "@/helpers/avatarBubble"
import { cameraFlying, inSkyJourney, openPortalId, skySequenceStarted } from "@/helpers/StateProvider"

/** Slightly inside the edge, so a bubble never pins itself half off the
 *  viewport. The same margin and the same reason as HintAnchor's. */
const NDC_MARGIN = 0.86

/** Gutter kept between the panel and the edge of the viewport. */
const EDGE_GUTTER = 16

/** THE PANEL IS AS WIDE AS THERE IS ROOM, NOT AS WIDE AS THE VIEWPORT.
 *
 *  `max-width: min(17rem, 100vw - 4rem)` was the first attempt and it is
 *  wrong by construction: it measures the viewport, and what constrains the
 *  panel is the distance from the AVATAR to the edge. Measured at 404x986 he
 *  projects to x=173, the panel opens rightward from 187, and 272px of
 *  permitted width ran 55px off the screen -- the copy was visibly cut mid
 *  word. So the projector, which is the only thing that knows where he is,
 *  publishes the room it can see and CSS clamps to that. */
const PANEL_IDEAL = 272

/** Below this, neither side has enough room to read in, and the panel stops
 *  hanging off him horizontally: it spans the viewport instead and keeps only
 *  its vertical anchor, which is what a speech bubble does on a phone. 250
 *  rather than something smaller because the alternative at that width is
 *  roughly twenty characters a line, which is a column, not a sentence. */
const MIN_SIDE_ROOM = 250

// Puts the avatar's speech bubble and unread marker where the avatar is.
//
// Lives inside <Canvas> because it needs the camera; writes straight to the
// DOM nodes published through helpers/avatarBubble because those nodes are
// siblings of the canvas, outside this React tree. Project in useFrame,
// assign el.style.transform, never re-render React for a position change --
// the technique HintAnchor, CursorDriver and NavigationProjector all use.
//
// THE AVATAR HAS NEVER BEEN PROJECTED BEFORE. He has been a named node
// ("avatar-root") since the sky sequence needed to find a subject with no
// skeleton, and this file is the first thing to ask where he is on screen.
export function AvatarAnchor() {
  const camera = useThree((state) => state.camera)
  const scene = useThree((state) => state.scene)
  const size = useThree((state) => state.size)
  const setOnScreen = useSetAtom(bubbleOnScreen)
  // The island only. In the sky he is a cutout on a string flying past
  // captions of his own, and a DOM panel over a moving camera is the thing
  // SkyContact's own note says is safe only when the camera is parked.
  const inSky = useAtomValue(inSkyJourney)
  const sequence = useAtomValue(skySequenceStarted)
  // ...and not inside a portal. The camera flies through the window into
  // another scene; the avatar is left behind on the beach but can still
  // project into frame from there, which would float a speech bubble over an
  // interior he is not in. The two portal beats that DO belong in there are
  // hints.ts's, and that file's header says why they stayed captions.
  const portal = useAtomValue(openPortalId)
  // ...AND NOT WHILE THE CAMERA IS MOVING.
  //
  // "The text follows the camera around when it's moving, it's not useful and
  // is in the way." The panel is welded to the avatar's head, so a hotspot
  // flight drags it right across the frame -- a paragraph of prose sliding
  // over the scene while the viewer is trying to watch the move. It is
  // something he says while you are stood with him, so it is only up when the
  // camera is actually parked.
  const flying = useAtomValue(cameraFlying)

  // Created lazily INSIDE the frame callback, not by useMemo. A value
  // produced during render belongs to the render, and writing to one from a
  // frame callback is what react-hooks/immutability rejects -- the same trap
  // PaperSky's flight basis and SkyCaptionBillboard's corner vector both
  // work around this way.
  const vRef = useRef<THREE.Vector3 | null>(null)
  const node = useRef<THREE.Object3D | null>(null)
  const reported = useRef(false)

  const report = (on: boolean) => {
    if (reported.current === on) return
    reported.current = on
    setOnScreen(on)
  }

  useFrame(() => {
    const bubble = bubbleNode.current
    const unread = unreadNode.current
    if (!bubble && !unread) return

    const hide = () => {
      if (bubble) bubble.style.visibility = "hidden"
      if (unread) unread.style.visibility = "hidden"
      report(false)
    }

    if (inSky || sequence || portal !== null || flying) return hide()

    // Looked up rather than held: the subtree is rebuilt whenever the model
    // kind changes (base / dragonite / cardboard), so a reference captured
    // once goes stale on the first transformation.
    if (!node.current || !node.current.parent) {
      node.current = scene.getObjectByName("avatar-root") ?? null
    }
    const root = node.current
    if (!root) return hide()

    const v = (vRef.current ??= new THREE.Vector3())
    root.getWorldPosition(v)
    v.y += BUBBLE_ANCHOR_UP
    v.project(camera)
    // z > 1 is behind the camera, where project() returns plausible but
    // mirrored coordinates -- it would put the bubble on the opposite side of
    // the frame from the person supposedly speaking.
    if (v.z > 1 || Math.abs(v.x) > NDC_MARGIN || Math.abs(v.y) > NDC_MARGIN) return hide()

    const x = (v.x * 0.5 + 0.5) * size.width
    const y = (-v.y * 0.5 + 0.5) * size.height

    // Open toward whichever side actually has more room, and tell CSS how
    // much that is. This replaced a fixed "flip past 60% of the width", which
    // asked the wrong question: on a narrow frame both sides can be too small
    // and the flip just chose which edge to overflow.
    const roomRight = size.width - x - EDGE_GUTTER
    const roomLeft = x - EDGE_GUTTER
    const side = roomRight >= roomLeft ? "right" : "left"
    const room = Math.max(roomRight, roomLeft)
    const fit = room < MIN_SIDE_ROOM ? "viewport" : "beside"

    for (const el of [bubble, unread]) {
      if (!el) continue
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`
      el.dataset.bubbleSide = side
      el.style.visibility = "visible"
    }
    if (bubble) {
      bubble.dataset.bubbleFit = fit
      bubble.style.setProperty("--bubble-room", `${Math.round(Math.min(room, PANEL_IDEAL))}px`)
      // Its own screen x, so the viewport-wide layout can cancel the
      // transform on one axis and still ride it on the other.
      bubble.style.setProperty("--bubble-x", `${Math.round(x)}px`)
    }
    report(true)
  })

  return null
}
