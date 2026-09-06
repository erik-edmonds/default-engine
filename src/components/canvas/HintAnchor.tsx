"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { useAtomValue, useSetAtom } from "jotai"

import { activeHint, cloudOnScreen, getHintClouds, hintNode, hintOnScreen } from "@/helpers/hints"

/** How far into the margin a target may sit and still count as "in frame".
 *  Slightly inside the edge (NDC runs -1..1) so a hint never pins itself half
 *  off the side of the viewport. */
const NDC_MARGIN = 0.82

/** cloudOnScreen only gates whether a hint may start, so it does not need a
 *  per-frame answer. */
const CLOUD_SCAN_INTERVAL_FRAMES = 15

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
  const setCloudOnScreen = useSetAtom(cloudOnScreen)
  const setHintOnScreen = useSetAtom(hintOnScreen)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)

  const v = useMemo(() => new THREE.Vector3(), [])
  const probe = useMemo(() => new THREE.Vector3(), [])
  const frame = useRef(0)
  // Held for the life of one clouds hint. Re-picking every frame would let the
  // marker hop between clouds as they bob past each other.
  const chosenCloud = useRef<THREE.Object3D | null>(null)
  // Last value written to the hintOnScreen atom. jotai bails out on an equal
  // value anyway, but this keeps the write itself off all but a handful of
  // frames.
  const reportedOnScreen = useRef(false)

  const report = (onScreen: boolean) => {
    if (reportedOnScreen.current === onScreen) return
    reportedOnScreen.current = onScreen
    setHintOnScreen(onScreen)
  }

  useEffect(() => {
    chosenCloud.current = null
  }, [hint])

  useFrame(() => {
    frame.current++

    // Is there a cloud worth pointing at? Answered continuously, whether or not
    // a hint is up, because the director has to know this *before* it commits
    // to the clouds hint and has no camera of its own to work it out with.
    if (frame.current % CLOUD_SCAN_INTERVAL_FRAMES === 0) {
      setCloudOnScreen(pickCloud(camera, probe) !== null)
    }

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

    let source: THREE.Vector3 | null = null
    if (hint.target.kind === "world") {
      source = v.copy(hint.target.position)
    } else {
      // Keep the chosen cloud while it stays in frame; only look for another
      // once it leaves.
      if (chosenCloud.current && !onScreen(chosenCloud.current.getWorldPosition(probe).project(camera))) {
        chosenCloud.current = null
      }
      if (!chosenCloud.current) chosenCloud.current = pickCloud(camera, probe)
      source = chosenCloud.current ? chosenCloud.current.getWorldPosition(v) : null
    }

    if (!source) {
      el.style.visibility = "hidden"
      report(false)
      return
    }

    source.project(camera)
    // z > 1 means the target is behind the camera. project() still returns
    // plausible-looking x/y there (mirrored through the origin), which would
    // park the marker on the opposite side of the frame from its subject.
    if (source.z > 1 || !onScreen(source)) {
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

/** True once `ndc` has been projected and lands comfortably inside the frame. */
function onScreen(ndc: THREE.Vector3) {
  return ndc.z <= 1 && Math.abs(ndc.x) < NDC_MARGIN && Math.abs(ndc.y) < NDC_MARGIN
}

/** The registered cloud nearest the centre of frame, or null if none is in it.
 *  Centre-most rather than nearest-to-camera: the point is to pick the one the
 *  user is most likely to already be looking at. */
function pickCloud(camera: THREE.Camera, scratch: THREE.Vector3) {
  let best: THREE.Object3D | null = null
  let bestDistance = Infinity

  for (const cloud of getHintClouds()) {
    cloud.getWorldPosition(scratch).project(camera)
    if (!onScreen(scratch)) continue
    const distance = Math.hypot(scratch.x, scratch.y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = cloud
    }
  }

  return best
}
