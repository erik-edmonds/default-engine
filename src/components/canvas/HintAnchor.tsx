"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { useAtomValue, useSetAtom } from "jotai"

import { activeHint, hintNode, hintOnScreen } from "@/helpers/hints"

/** How close to the edge a target may sit and still count as "in frame".
 *
 *  PIXELS, not a fraction of NDC, and that is the whole point. This was 0.82
 *  of the half-frame, which reserves 128px on a 1280-wide desktop and 35px on
 *  a 393-wide phone -- backwards, since the narrow viewport is the one that
 *  cannot spare a tenth of itself. MEASURED: with the island at 85 degrees the
 *  beacon lands at ndc x 0.8197 on a 393x852 phone, so the hint pointing at it
 *  blinked out on the frame the idle sway pushed it past 0.82, on the one
 *  viewport where that hint matters most.
 *
 *  What actually has to fit is the marker -- a 16px ring, so 8px plus a little
 *  -- because the CAPTION is already handled: it flips to the marker's left
 *  past two thirds of the width (see dataset.hintSide below), which is exactly
 *  the case where a right-hand caption would run off. */
const EDGE_INSET_PX = 24

// Puts the active hint's marker where its subject is.
//
// Lives inside <Canvas> because it needs the camera; writes straight to
// SceneHint's DOM node (published through hints.ts) because that node is a
// sibling of the canvas, outside this React tree. Both halves of that are the
// technique NavigationProjector already uses -- project in useFrame, assign
// el.style.transform, never re-render React for a position change.
//
// Deliberately not drei's <Html>: it is unused everywhere else in this project,
// and it would mount a wrapper div and its own per-frame transform for what is
// one project() call here.
export function HintAnchor() {
  const hint = useAtomValue(activeHint)
  const setHintOnScreen = useSetAtom(hintOnScreen)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  const v = useMemo(() => new THREE.Vector3(), [])
  // Last value written to the hintOnScreen atom. jotai bails out on an equal
  // value anyway, but this keeps the write itself off all but a handful of
  // frames.
  const reportedOnScreen = useRef(false)

  const report = (onScreen: boolean) => {
    if (reportedOnScreen.current === onScreen) return
    reportedOnScreen.current = onScreen
    setHintOnScreen(onScreen)
  }

  useFrame(() => {
    const el = hintNode.current
    if (!hint) {
      report(false)
      return
    }
    // Screen-anchored hints need no projection -- SceneHint places them the
    // moment they activate, so they are on screen as soon as they exist.
    if (hint.target.kind === "screen") {
      report(true)
      return
    }
    if (!el) {
      report(false)
      return
    }

    const source = v.copy(hint.target.position)
    const maxDistance = hint.target.maxDistance

    // Too far to act on? Then it is not an instruction, it is clutter.
    if (maxDistance !== undefined && camera.position.distanceTo(source) > maxDistance) {
      el.style.visibility = "hidden"
      report(false)
      return
    }

    source.project(camera)
    // z > 1 means the target is behind the camera. project() still returns
    // plausible-looking x/y there (mirrored through the origin), which would
    // park the marker on the opposite side of the frame from its subject.
    if (source.z > 1 || !onScreen(source, size.width, size.height)) {
      el.style.visibility = "hidden"
      report(false)
      return
    }

    const x = (source.x * 0.5 + 0.5) * size.width
    const y = (-source.y * 0.5 + 0.5) * size.height
    // No centring translate: SceneHint's inner box is zero-sized and hangs
    // everything off this one point, so the transform lands the marker exactly
    // on the target and the caption sits beside it.
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`
    // Flip the caption to the marker's left near the right edge, where a
    // right-hand caption would run off the viewport.
    el.dataset.hintSide = x > size.width * 0.66 ? "left" : "right"
    el.style.visibility = "visible"
    report(true)
  })

  return null
}

/** True once `ndc` has been projected and lands comfortably inside the frame.
 *
 *  The inset is converted per AXIS, so a tall narrow viewport gets the same
 *  24px at the top as at the side rather than the same FRACTION, which on a
 *  phone is three times as many pixels vertically as horizontally. */
function onScreen(ndc: THREE.Vector3, width: number, height: number) {
  const marginX = 1 - (2 * EDGE_INSET_PX) / width
  const marginY = 1 - (2 * EDGE_INSET_PX) / height
  return ndc.z <= 1 && Math.abs(ndc.x) < marginX && Math.abs(ndc.y) < marginY
}
