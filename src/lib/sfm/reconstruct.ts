import type { CvClient } from "@/lib/sfm/cvClient"
import { projection, triangulate, twoView, type Intrinsics, type Pose, type Vec2, type Vec3 } from "@/lib/sfm/geometry"

/** Incremental structure from motion over an ordered set of frames.
 *
 *  THE SHAPE OF IT, and why it is not just a loop of two-view solves. A
 *  two-view solve recovers a pose up to an unknown scale. Chaining them gives
 *  a sequence of reconstructions in unrelated units that cannot be drawn in
 *  one scene. So: ONE bootstrap pair fixes the scale and the coordinate frame,
 *  and every later frame is placed by resection against the points that
 *  already exist -- which is what carries that single frame through the whole
 *  sequence.
 *
 *  WHO DOES WHAT. OpenCV finds the corners, describes them, matches them and
 *  resections each new camera (`solvePnPRansac`). geometry.ts supplies the one
 *  thing the build does not ship: the two-view bootstrap -- fundamental
 *  matrix, essential matrix, the four-way pose decomposition and triangulation.
 *
 *  TRACKS ARE THE BOOKKEEPING. A corner seen in frames 3, 4 and 5 is one point
 *  in the world, and it has to be recognised as such or the same point is
 *  triangulated three times into three slightly different places. Consecutive
 *  matches are chained into tracks by union: a match (frame i feature a) ->
 *  (frame i+1 feature b) extends whatever track `a` belongs to.
 */

export interface FrameFeatures {
  points: Float32Array
  descriptors: Uint8Array
  cols: number
  count: number
}

export interface ReconstructedCamera {
  frame: number
  pose: Pose
  /** Camera centre in world coordinates: -R^T t. */
  centre: Vec3
}

export interface ReconstructionState {
  cameras: ReconstructedCamera[]
  /** One entry per triangulated track, in the bootstrap pair's frame. */
  points: Vec3[]
  /** RGB per point, 0..1, sampled from the frame it was first seen in. */
  colors: Float32Array
  /** Median reprojection error of the bootstrap, in pixels. */
  reprojection: number
  /** Median triangulation angle of the bootstrap, in degrees. */
  parallax: number
  /** Which pair bootstrapped it. */
  bootstrap: [number, number]
  matchesLastFrame: number
  inliersLastFrame: number
}

/** A corner, as one entry in a track. */
interface Observation {
  frame: number
  feature: number
}

/** Chain consecutive matches into tracks.
 *
 *  `key(frame, feature)` -> track id, grown left to right. A match that
 *  attaches to a feature already in a track extends that track; a match
 *  between two unseen features starts one.
 */
export function buildTracks(
  matches: Map<number, Int32Array>,
  frameCount: number,
): { tracks: Observation[][]; lookup: Map<string, number> } {
  const lookup = new Map<string, number>()
  const tracks: Observation[][] = []
  const key = (frame: number, feature: number) => `${frame}:${feature}`

  for (let i = 0; i + 1 < frameCount; i++) {
    const pairs = matches.get(i)
    if (!pairs) continue
    for (let p = 0; p < pairs.length; p += 2) {
      const a = pairs[p]
      const b = pairs[p + 1]
      const ka = key(i, a)
      const kb = key(i + 1, b)
      let id = lookup.get(ka)
      if (id === undefined) {
        id = tracks.length
        tracks.push([{ frame: i, feature: a }])
        lookup.set(ka, id)
      }
      // A feature in frame i+1 can be the best match for two different
      // features in frame i. Keep the first claim; a track that forks is a
      // track that would triangulate to a point between two real ones.
      if (!lookup.has(kb)) {
        tracks[id].push({ frame: i + 1, feature: b })
        lookup.set(kb, id)
      }
    }
  }
  return { tracks, lookup }
}

const xyAt = (f: FrameFeatures, i: number): Vec2 => [f.points[i * 2], f.points[i * 2 + 1]]

function inFrontOf(pose: Pose, X: Vec3): boolean {
  return pose.R[2][0] * X[0] + pose.R[2][1] * X[1] + pose.R[2][2] * X[2] + pose.t[2] > 0
}

/** How far the projected point lands from where it was actually seen. The
 *  gate that keeps a badly conditioned triangulation out of the cloud. */
function reprojectionError(k: Intrinsics, pose: Pose, X: Vec3, seen: Vec2): number {
  const c = [
    pose.R[0][0] * X[0] + pose.R[0][1] * X[1] + pose.R[0][2] * X[2] + pose.t[0],
    pose.R[1][0] * X[0] + pose.R[1][1] * X[1] + pose.R[1][2] * X[2] + pose.t[1],
    pose.R[2][0] * X[0] + pose.R[2][1] * X[1] + pose.R[2][2] * X[2] + pose.t[2],
  ]
  if (c[2] <= 1e-9) return Number.POSITIVE_INFINITY
  const px = k.fx * (c[0] / c[2]) + k.cx
  const py = k.fy * (c[1] / c[2]) + k.cy
  return Math.hypot(px - seen[0], py - seen[1])
}

/** Sample a frame's pixel under a feature, for point colour. */
function sampleColor(pixels: ImageData, x: number, y: number): [number, number, number] {
  const px = Math.max(0, Math.min(pixels.width - 1, Math.round(x)))
  const py = Math.max(0, Math.min(pixels.height - 1, Math.round(y)))
  const o = (py * pixels.width + px) * 4
  return [pixels.data[o] / 255, pixels.data[o + 1] / 255, pixels.data[o + 2] / 255]
}

export interface ReconstructOptions {
  /** How far ahead of frame 0 to START looking for a bootstrap pair.
   *
   *  A FLOOR, NOT A TARGET -- the search walks forward from here and takes the
   *  first pair that has both enough correspondences and enough parallax, so
   *  setting it low costs nothing and setting it high can starve the search
   *  outright. Learned by setting it to 4: tracks are built by chaining
   *  CONSECUTIVE matches, so demanding frame 0 and frame 4 share a track means
   *  surviving four matches in a row, and once the camera moves a few degrees
   *  a step almost none do. The result was "no pair had enough parallax",
   *  which was not the failing condition at all -- there were simply fewer
   *  than thirty tracks left to test it on. */
  minBaseline?: number
  /** Degrees. Below this the pair has no usable triangulation angle. */
  minParallax?: number
  onProgress?: (state: ReconstructionState, stage: string) => void
  /** Each consecutive pair's surviving matches, as they are computed, so the
   *  2D view can draw them while the solve is still running. */
  onMatches?: (from: number, pairs: Int32Array) => void
}

/** Run the whole thing. Yields progress so the viewer can grow as it goes. */
export async function reconstruct(
  cv: CvClient,
  frames: { pixels: ImageData }[],
  features: FrameFeatures[],
  k: Intrinsics,
  options: ReconstructOptions = {},
): Promise<ReconstructionState | null> {
  const minBaseline = options.minBaseline ?? 2
  const minParallax = options.minParallax ?? 1.5

  // --- 1. Match every consecutive pair -----------------------------------
  const matches = new Map<number, Int32Array>()
  for (let i = 0; i + 1 < features.length; i++) {
    const a = features[i]
    const b = features[i + 1]
    // Copies: `match` transfers what it is given, and these descriptors are
    // matched again against the next frame.
    const { pairs } = await cv.match(
      a.descriptors.slice().buffer,
      b.descriptors.slice().buffer,
      a.count,
      b.count,
      a.cols,
    )
    matches.set(i, pairs)
    options.onMatches?.(i, pairs)
  }

  const { tracks, lookup } = buildTracks(matches, features.length)

  /** Which tracks each frame observes, so the incremental stage does not
   *  rescan every track for every frame. */
  const byFrame = new Map<number, { track: number; feature: number }[]>()
  tracks.forEach((track, id) => {
    for (const o of track) {
      const list = byFrame.get(o.frame)
      if (list) list.push({ track: id, feature: o.feature })
      else byFrame.set(o.frame, [{ track: id, feature: o.feature }])
    }
  })

  // --- 2. Bootstrap ------------------------------------------------------
  //
  // Frame 0 against the first frame far enough away to triangulate. Adjacent
  // frames of a smooth camera move are nearly the same view, and a tiny
  // baseline gives points at wildly uncertain depth -- the reconstruction
  // looks like a smear along the viewing direction.
  let boot: { b: number; result: NonNullable<ReturnType<typeof twoView>>; obs: Observation[][] } | null = null
  for (let b = minBaseline; b < features.length; b++) {
    const a0: Vec2[] = []
    const b0: Vec2[] = []
    const used: Observation[][] = []
    for (const track of tracks) {
      const o0 = track.find((o) => o.frame === 0)
      const ob = track.find((o) => o.frame === b)
      if (!o0 || !ob) continue
      a0.push(xyAt(features[0], o0.feature))
      b0.push(xyAt(features[b], ob.feature))
      used.push(track)
    }
    if (a0.length < 30) continue
    const result = twoView(a0, b0, k, { seed: 7 })
    if (!result) continue
    if (result.parallax < minParallax) continue
    boot = { b, result, obs: used }
    break
  }
  if (!boot) return null

  // --- 3. The seed cloud -------------------------------------------------
  // Track ids, not object identity. `tracks.indexOf(track)` is a linear scan
  // per point over tens of thousands of tracks -- it worked, and it was most
  // of the bootstrap's cost.
  const trackIndex = new Map<Observation[], number>()
  tracks.forEach((t, i) => trackIndex.set(t, i))

  const trackPoint = new Map<number, Vec3>()
  const trackColor = new Map<number, [number, number, number]>()

  const colorFor = (id: number): [number, number, number] => {
    const track = tracks[id]
    const o = track[0]
    const [x, y] = xyAt(features[o.frame], o.feature)
    return sampleColor(frames[o.frame].pixels, x, y)
  }

  for (let i = 0; i < boot.result.inliers.length; i++) {
    const track = boot.obs[boot.result.inliers[i]]
    const id = trackIndex.get(track)
    if (id === undefined) continue
    trackPoint.set(id, boot.result.points[i])
    trackColor.set(id, colorFor(id))
  }

  /** Flatten the map into the arrays the viewer draws. */
  const snapshot = (): { points: Vec3[]; colors: Float32Array } => {
    const points: Vec3[] = []
    const colors: number[] = []
    for (const [id, X] of trackPoint) {
      points.push(X)
      const c = trackColor.get(id) ?? [0.8, 0.8, 0.8]
      colors.push(c[0], c[1], c[2])
    }
    return { points, colors: Float32Array.from(colors) }
  }

  const centreOf = (pose: Pose): Vec3 => [
    -(pose.R[0][0] * pose.t[0] + pose.R[1][0] * pose.t[1] + pose.R[2][0] * pose.t[2]),
    -(pose.R[0][1] * pose.t[0] + pose.R[1][1] * pose.t[1] + pose.R[2][1] * pose.t[2]),
    -(pose.R[0][2] * pose.t[0] + pose.R[1][2] * pose.t[1] + pose.R[2][2] * pose.t[2]),
  ]

  const identity: Pose = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] }
  /** Every camera whose pose is known, so new points can be triangulated
   *  against whichever of them gives the longest baseline. */
  const placed = new Map<number, Pose>([[0, identity], [boot.b, boot.result.pose]])
  const first = snapshot()
  const state: ReconstructionState = {
    cameras: [
      { frame: 0, pose: identity, centre: [0, 0, 0] },
      { frame: boot.b, pose: boot.result.pose, centre: centreOf(boot.result.pose) },
    ],
    points: first.points,
    colors: first.colors,
    reprojection: boot.result.reprojection,
    parallax: boot.result.parallax,
    bootstrap: [0, boot.b],
    matchesLastFrame: boot.result.inliers.length,
    inliersLastFrame: boot.result.inliers.length,
  }
  options.onProgress?.(state, `bootstrapped on frames 0 and ${boot.b}`)

  // --- 4. Every other frame, by resection --------------------------------
  for (let f = 1; f < features.length; f++) {
    if (f === boot.b) continue
    const obj: number[] = []
    const img: number[] = []
    const feat = features[f]
    for (let i = 0; i < feat.count; i++) {
      const id = lookup.get(`${f}:${i}`)
      if (id === undefined) continue
      const X = trackPoint.get(id)
      if (!X) continue
      obj.push(X[0], X[1], X[2])
      const [x, y] = xyAt(feat, i)
      img.push(x, y)
    }
    if (obj.length / 3 < 8) continue

    const solved = await cv.pnp(Float64Array.from(obj), Float64Array.from(img), k)
    if (!solved) continue
    const pose: Pose = { R: solved.R, t: solved.t }
    placed.set(f, pose)
    state.cameras.push({ frame: f, pose, centre: centreOf(pose) })
    state.matchesLastFrame = obj.length / 3
    state.inliersLastFrame = solved.inliers.length
    state.cameras.sort((x, y) => x.frame - y.frame)

    // --- 5. GROW THE CLOUD ------------------------------------------------
    //
    // Without this the reconstruction is only ever the bootstrap pair's
    // points, and it starves itself: later frames look at a cloud they can
    // barely see, PnP runs out of correspondences and most of the sequence
    // never gets placed at all. Measured before this existed -- 48 frames in,
    // 11 cameras placed and 65 points out.
    //
    // So every newly placed camera triangulates the tracks it shares with an
    // ALREADY placed one. The partner is chosen for the longest baseline
    // available, because a short one puts the point somewhere along a very
    // uncertain ray.
    const centre = centreOf(pose)
    const P2 = projection(k, pose)
    const observed = byFrame.get(f) ?? []
    for (const { track: id, feature } of observed) {
      if (trackPoint.has(id)) continue
      let partner: { frame: number; pose: Pose; feature: number; baseline: number } | null = null
      for (const o of tracks[id]) {
        if (o.frame === f) continue
        const other = placed.get(o.frame)
        if (!other) continue
        const c = centreOf(other)
        const baseline = Math.hypot(centre[0] - c[0], centre[1] - c[1], centre[2] - c[2])
        if (!partner || baseline > partner.baseline) {
          partner = { frame: o.frame, pose: other, feature: o.feature, baseline }
        }
      }
      if (!partner || partner.baseline < 1e-6) continue

      const X = triangulate(
        projection(k, partner.pose),
        P2,
        xyAt(features[partner.frame], partner.feature),
        xyAt(features[f], feature),
      )
      if (!Number.isFinite(X[0] + X[1] + X[2])) continue
      // In front of both, or it is behind a camera that can see it.
      if (!inFrontOf(partner.pose, X) || !inFrontOf(pose, X)) continue
      if (reprojectionError(k, pose, X, xyAt(features[f], feature)) > 4) continue

      trackPoint.set(id, X)
      trackColor.set(id, colorFor(id))
    }

    const grown = snapshot()
    state.points = grown.points
    state.colors = grown.colors
    options.onProgress?.({ ...state }, `placed frame ${f} — ${state.points.length} points`)
  }

  return state
}
