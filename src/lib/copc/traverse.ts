import * as THREE from "three"

import type { CopcSource } from "./source"

/** Which nodes should be on screen right now.
 *
 *  Pure, and separable from React and from loading on purpose: given a
 *  camera and a budget it returns a ranked list, and a probe can drive it
 *  with a scripted camera path and assert the budget holds without a
 *  renderer.
 *
 *  THE ARITHMETIC THIS EXISTS FOR. The sample file is 10.6M points; a desktop
 *  draws perhaps 1-2M and a standalone headset far fewer. A real 2GB farm
 *  scan is 100-300M. So the viewer shows well under a tenth of the data at
 *  any instant, and the octree is not an optimisation -- it is the only
 *  reason any of this runs at all. */

export interface Selection {
  /** Keys to have resident, best first. */
  wanted: string[]
  /** Pages that must be fetched before traversal can go deeper here. */
  pagesToLoad: string[]
  /** Total points the wanted set would put on screen. */
  points: number
}

export interface SelectOptions {
  /** The cloud group's world matrix.
   *
   *  LOAD-BEARING, AND ITS ABSENCE WAS A REAL BUG. Node boxes come from the
   *  octree key, so they are in the file's own LOCAL space -- but the cloud
   *  is rendered under a group rotated -90 degrees about X (LAS is Z-up,
   *  three.js is Y-up). Testing local boxes against a world frustum compares
   *  two different spaces; it selected a few nodes by accidental overlap and
   *  dropped the rest, which looked like an over-conservative LOD rather
   *  than a coordinate bug.
   *
   *  Rather than transform every box, the frustum and the camera are brought
   *  INTO local space once per selection. */
  groupMatrixWorld: THREE.Matrix4
  /** Stop adding nodes once this many points are selected. */
  pointBudget: number
  /** Screen-space error target: a node is worth loading while its point
   *  spacing, projected, is coarser than this many pixels. Lower = more
   *  detail = more nodes. */
  targetPixelSpacing?: number
  /** DRAWING-BUFFER height in device pixels -- not the CSS box.
   *
   *  THIS IS THE DIFFERENCE BETWEEN A WORKING HEADSET AND A BLURRY ONE.
   *  In an XR session three calls `setPixelRatio(1)` and then
   *  `setSize(layer.textureWidth, layer.textureHeight, false)`
   *  (WebXRManager). That `false` is `updateStyle`: the canvas CSS box is
   *  never touched, so fiber's ResizeObserver never fires and
   *  `state.size.height` stays at the DOM height (~800) while the eye
   *  framebuffer is ~2208. Feed it the CSS height and the metric below is
   *  ~2.7x too small, which selects roughly SEVEN TIMES too few nodes -- and
   *  it looks like a conservative LOD, not a bug.
   *
   *  `gl.getDrawingBufferSize().y` is right in both cases: on the desktop it
   *  is `size.height * dpr`, and in a session it is the layer's own texture
   *  height. */
  viewportHeight: number
}

const box = new THREE.Box3()
const min = new THREE.Vector3()
const max = new THREE.Vector3()
const centre = new THREE.Vector3()
const frustum = new THREE.Frustum()
const projScreen = new THREE.Matrix4()
const inverseModel = new THREE.Matrix4()
const cameraLocal = new THREE.Vector3()

export function selectNodes(
  source: CopcSource,
  camera: THREE.PerspectiveCamera,
  { pointBudget, targetPixelSpacing = 2, viewportHeight, groupMatrixWorld }: SelectOptions,
): Selection {
  // projection * view * model puts the frustum in the model's own space, so
  // the node boxes below can be tested exactly as the octree defines them.
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(groupMatrixWorld)
  frustum.setFromProjectionMatrix(projScreen)
  // ...and the camera's position has to make the same trip, or every
  // distance -- which is what the LOD score divides by -- is measured
  // between two different coordinate systems.
  inverseModel.copy(groupMatrixWorld).invert()
  cameraLocal.copy(camera.position).applyMatrix4(inverseModel)

  // Converts a world size at a given distance into pixels:
  // px = world * factor / distance.
  //
  // TAKEN FROM THE PROJECTION MATRIX, NOT FROM `fov`. element 5 is
  // `1 / tan(fovY / 2)` for a symmetric frustum, so on the desktop this is
  // numerically identical to `height / (2 * tan(fov/2))` -- asserted to
  // machine precision in the probe. But an XR eye frustum is ASYMMETRIC and
  // off-axis, and `camera.fov` is then only a scalar three derives back out
  // of it. The matrix is the thing that actually projects.
  const factor = 0.5 * viewportHeight * camera.projectionMatrix.elements[5]

  const wanted: string[] = []
  const pagesToLoad: string[] = []
  let points = 0

  // Breadth-first from the root, scored. A node is only considered once its
  // parent is already in `wanted` -- loading a child whose parent is absent
  // would punch a hole in the cloud rather than refine it.
  interface Candidate { key: string; score: number; depth: number }
  let frontier: Candidate[] = [{ key: "0-0-0-0", score: Infinity, depth: 0 }]

  while (frontier.length && points < pointBudget) {
    frontier.sort((a, b) => b.score - a.score)
    const next: Candidate[] = []

    for (const candidate of frontier) {
      if (points >= pointBudget) break
      const node = source.nodes.get(candidate.key)

      // A key with no node but a pending page is the lazy-hierarchy case:
      // the octree genuinely continues here, we just have not read the index
      // yet. Report it and stop descending this branch for now.
      if (!node) {
        if (source.pages.has(candidate.key)) pagesToLoad.push(candidate.key)
        continue
      }

      wanted.push(candidate.key)
      points += node.pointCount

      // Children, scored by projected spacing.
      const [d, x, y, z] = candidate.key.split("-").map(Number)
      const childSpacing = source.spacingAt(d + 1)
      for (let i = 0; i < 8; i++) {
        const key = `${d + 1}-${x * 2 + (i & 1)}-${y * 2 + ((i >> 1) & 1)}-${z * 2 + ((i >> 2) & 1)}`
        if (!source.nodes.has(key) && !source.pages.has(key)) continue

        const b = source.nodeBox(key)
        min.set(b.min[0], b.min[1], b.min[2])
        max.set(b.max[0], b.max[1], b.max[2])
        box.set(min, max)
        if (!frustum.intersectsBox(box)) continue

        box.getCenter(centre)
        const distance = Math.max(cameraLocal.distanceTo(centre), 0.001)
        const pixelSpacing = (childSpacing * factor) / distance
        // Already finer than the target: refining further would spend points
        // on detail nobody can see.
        if (pixelSpacing < targetPixelSpacing) continue
        next.push({ key, score: pixelSpacing, depth: d + 1 })
      }
    }
    frontier = next
  }

  return { wanted, pagesToLoad, points }
}

/** What to drop when over the byte cap.
 *
 *  BY DISTANCE, NOT RECENCY. In a headset -- and with an orbit control on a
 *  desktop -- you look away and back constantly, so a least-recently-used
 *  policy evicts exactly the nodes you are about to want again and thrashes.
 *  Farthest-first keeps the neighbourhood you are standing in. */
export function evictionOrder(
  resident: Iterable<string>,
  source: CopcSource,
  camera: THREE.PerspectiveCamera,
  keep: ReadonlySet<string>,
  groupMatrixWorld: THREE.Matrix4,
): string[] {
  // Same space as the boxes, for the same reason as above.
  inverseModel.copy(groupMatrixWorld).invert()
  cameraLocal.copy(camera.position).applyMatrix4(inverseModel)
  const scored: { key: string; distance: number }[] = []
  for (const key of resident) {
    if (keep.has(key)) continue
    const b = source.nodeBox(key)
    min.set(b.min[0], b.min[1], b.min[2])
    max.set(b.max[0], b.max[1], b.max[2])
    box.set(min, max)
    box.getCenter(centre)
    scored.push({ key, distance: cameraLocal.distanceTo(centre) })
  }
  return scored.sort((a, b) => b.distance - a.distance).map((s) => s.key)
}
