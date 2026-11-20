import type { CvClient } from "@/lib/sfm/cvClient"
import {
  projection,
  triangulate,
  twoView,
  type Intrinsics,
  type Pose,
  type Vec2,
  type Vec3,
} from "@/lib/sfm/geometry"

/** Structure from motion on a live camera.
 *
 *  THE DIFFERENCE FROM reconstruct.ts, which does the same job offline: that
 *  one has every frame in hand, can choose its bootstrap pair by looking
 *  ahead, and may take as long as it likes. This one gets frames one at a time
 *  at camera rate and has to answer before the next arrives, so the shape is
 *  a state machine rather than a pipeline:
 *
 *    seeking   follow corners, measure parallax, try to bootstrap
 *    locked    resection every frame; add points at keyframes
 *    lost      too few points to solve; re-seed and go back to seeking
 *
 *  WHY IT CANNOT JUST RUN reconstruct(). Monocular initialisation needs
 *  translation, and nobody translates on command. The seeking state exists to
 *  ASK for it and to measure whether it happened -- the single most common way
 *  this fails in the wild is a visitor rotating on the spot, which produces no
 *  baseline and therefore no depth, however good the tracking looks.
 *
 *  SCALE IS ARBITRARY AND STAYS ARBITRARY. A monocular reconstruction is fixed
 *  only up to a similarity; the bootstrap's translation is a unit vector
 *  because that is all two views can tell you. Nothing here converts to metres
 *  and the UI must not print any.
 */

export type SlamState = "idle" | "seeking" | "locked" | "lost"

export interface SlamStatus {
  state: SlamState
  /** Points currently being followed. */
  tracked: number
  /** Points with a known 3D position that are visible right now. */
  anchored: number
  /** Size of the map. */
  mapped: number
  /** Median triangulation angle, degrees. The parallax the bootstrap needs. */
  parallax: number
  /** Median reprojection error of the bootstrap, pixels. */
  reprojection: number
  /** How many of the originally seeded points are STILL being followed.
   *
   *  Not a debugging leftover: this is the number the bootstrap actually runs
   *  on, and it is not the same as `tracked`. A point picked up by a later
   *  top-up is being followed but has no position in the seed frame, so it
   *  cannot contribute a correspondence to the two-view solve. When the two
   *  diverge, that difference IS the explanation. */
  paired: number
  keyframes: number
  /** What the operator should do, in a few words. */
  hint: string
}

/** A pinhole from an assumed field of view.
 *
 *  A real camera's intrinsics are unknown and this demo does not calibrate.
 *  An assumed ~60 degrees horizontal is close enough for most phone and laptop
 *  cameras that the geometry holds; being wrong shows up as the anchored
 *  object breathing slightly as you move, which is at least honest about
 *  itself. `?fov=` overrides it -- the same runtime-knob idiom as `?budget=`
 *  on the scan viewer. */
export function intrinsicsFromFov(width: number, height: number, fovDegrees = 60): Intrinsics {
  const f = width / 2 / Math.tan((fovDegrees * Math.PI) / 180 / 2)
  return { fx: f, fy: f, cx: width / 2, cy: height / 2 }
}

const MIN_BOOTSTRAP_POINTS = 40
const MIN_PARALLAX_DEG = 1.2
/** Below this many anchored points the pose solve is not worth trusting. */
const MIN_ANCHORED = 12
/** Below this many tracked points, top up at the next opportunity. */
const TOPUP_BELOW = 120

interface Keyframe {
  pose: Pose
  centre: Vec3
  seen: Map<number, Vec2>
}

const centreOf = (pose: Pose): Vec3 => [
  -(pose.R[0][0] * pose.t[0] + pose.R[1][0] * pose.t[1] + pose.R[2][0] * pose.t[2]),
  -(pose.R[0][1] * pose.t[0] + pose.R[1][1] * pose.t[1] + pose.R[2][1] * pose.t[2]),
  -(pose.R[0][2] * pose.t[0] + pose.R[1][2] * pose.t[1] + pose.R[2][2] * pose.t[2]),
]

const IDENTITY: Pose = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] }

function inFrontOf(pose: Pose, X: Vec3): boolean {
  return pose.R[2][0] * X[0] + pose.R[2][1] * X[1] + pose.R[2][2] * X[2] + pose.t[2] > 0
}

export class LiveSlam {
  state: SlamState = "idle"
  /** Where each tracked point was in the seed frame, for the bootstrap. */
  private seed = new Map<number, Vec2>()
  /** trackId -> world position. The map. */
  readonly points = new Map<number, Vec3>()
  readonly colors = new Map<number, [number, number, number]>()
  private keyframes: Keyframe[] = []
  pose: Pose | null = null
  /** Every pose solved, for drawing the path. */
  readonly trajectory: Vec3[] = []
  private parallax = 0
  private reprojection = 0
  private tracked = 0
  private paired = 0
  private anchored = 0
  private frames = 0
  /** Set when a keyframe found tracking had thinned; acted on by the NEXT
   *  frame, because topping up needs pixels and this frame's have already
   *  been transferred to the worker. */
  private needTopUp = false

  constructor(
    private readonly cv: CvClient,
    private readonly k: Intrinsics,
  ) {}

  status(): SlamStatus {
    return {
      state: this.state,
      tracked: this.tracked,
      anchored: this.anchored,
      mapped: this.points.size,
      parallax: this.parallax,
      reprojection: this.reprojection,
      paired: this.paired,
      keyframes: this.keyframes.length,
      hint: this.hint(),
    }
  }

  private hint(): string {
    switch (this.state) {
      case "idle":
        return "starting the camera"
      case "seeking":
        if (this.tracked < MIN_BOOTSTRAP_POINTS) return "point at something with detail"
        // THE INSTRUCTION THAT MATTERS. Turning on the spot produces no
        // baseline and can never triangulate, and it is what people do
        // unprompted. Say the one thing that fixes it.
        return "move sideways, slowly"
      case "locked":
        return "locked — look around"
      case "lost":
        return "lost — move back, or re-seed"
    }
  }

  /** Feed one frame. `pixels` is transferred to the worker. */
  async frame(
    pixels: ArrayBuffer,
    width: number,
    height: number,
    sample?: (x: number, y: number) => [number, number, number],
  ): Promise<{ points: Float32Array; ids: Int32Array }> {
    this.frames++

    // The first frame has nothing to follow, and a lost tracker has nothing
    // left worth following.
    if (this.state === "idle" || this.state === "lost") {
      const seeded = await this.cv.kltSeed(pixels, width, height, { maxCorners: 500, minDistance: 12 })
      this.seed.clear()
      for (let i = 0; i < seeded.ids.length; i++) {
        this.seed.set(seeded.ids[i], [seeded.points[i * 2], seeded.points[i * 2 + 1]])
      }
      this.tracked = seeded.ids.length
      this.state = "seeking"
      return { points: seeded.points, ids: seeded.ids }
    }

    // A top-up is a seed that KEEPS what is still being followed and adds
    // corners where the frame has gone empty. It also steps the tracker, so
    // it replaces kltStep for this frame rather than running alongside it.
    const step = this.needTopUp
      ? await this.cv.kltSeed(pixels, width, height, { maxCorners: 500, minDistance: 12, keep: true })
      : await this.cv.kltStep(pixels, width, height)
    this.needTopUp = false
    this.tracked = step.ids.length

    if (this.state === "seeking") await this.trySeeking(step, sample)
    else await this.tracking(step, sample)

    return { points: step.points, ids: step.ids }
  }

  /** Still trying to initialise. */
  private async trySeeking(
    step: { points: Float32Array; ids: Int32Array },
    sample?: (x: number, y: number) => [number, number, number],
  ): Promise<void> {
    const a: Vec2[] = []
    const b: Vec2[] = []
    const ids: number[] = []
    for (let i = 0; i < step.ids.length; i++) {
      const from = this.seed.get(step.ids[i])
      if (!from) continue
      a.push(from)
      b.push([step.points[i * 2], step.points[i * 2 + 1]])
      ids.push(step.ids[i])
    }
    this.paired = a.length
    if (a.length < MIN_BOOTSTRAP_POINTS) {
      if (this.tracked < MIN_BOOTSTRAP_POINTS / 2) this.state = "lost"
      return
    }

    const solved = twoView(a, b, this.k, { seed: 7 })
    if (!solved) return
    this.parallax = solved.parallax
    // Not enough baseline yet. This is the normal case for the first second
    // or two and is not a failure -- it is what the hint is asking about.
    if (solved.parallax < MIN_PARALLAX_DEG) return

    this.reprojection = solved.reprojection
    for (let i = 0; i < solved.inliers.length; i++) {
      const id = ids[solved.inliers[i]]
      const X = solved.points[i]
      if (!Number.isFinite(X[0] + X[1] + X[2])) continue
      this.points.set(id, X)
      if (sample) {
        const p = b[solved.inliers[i]]
        this.colors.set(id, sample(p[0], p[1]))
      }
    }
    if (this.points.size < MIN_ANCHORED) return

    const seenFirst = new Map<number, Vec2>()
    for (let i = 0; i < a.length; i++) seenFirst.set(ids[i], a[i])
    const seenNow = new Map<number, Vec2>()
    for (let i = 0; i < b.length; i++) seenNow.set(ids[i], b[i])

    this.keyframes = [
      { pose: IDENTITY, centre: [0, 0, 0], seen: seenFirst },
      { pose: solved.pose, centre: centreOf(solved.pose), seen: seenNow },
    ]
    this.pose = solved.pose
    this.trajectory.push([0, 0, 0], centreOf(solved.pose))
    this.state = "locked"
  }

  /** Initialised: solve this frame's pose, and grow the map when it thins. */
  private async tracking(
    step: { points: Float32Array; ids: Int32Array },
    sample?: (x: number, y: number) => [number, number, number],
  ): Promise<void> {
    const obj: number[] = []
    const img: number[] = []
    for (let i = 0; i < step.ids.length; i++) {
      const X = this.points.get(step.ids[i])
      if (!X) continue
      obj.push(X[0], X[1], X[2])
      img.push(step.points[i * 2], step.points[i * 2 + 1])
    }
    this.anchored = obj.length / 3

    if (this.anchored < MIN_ANCHORED) {
      this.state = "lost"
      this.pose = null
      return
    }

    const solved = await this.cv.pnp(Float64Array.from(obj), Float64Array.from(img), this.k)
    if (!solved) {
      this.state = "lost"
      this.pose = null
      return
    }
    const pose: Pose = { R: solved.R, t: solved.t }
    this.pose = pose
    const centre = centreOf(pose)
    this.trajectory.push(centre)

    // --- keyframe? -------------------------------------------------------
    //
    // Two reasons to take one, and they are different failures. Tracking has
    // THINNED -- points leave the frame and are never replaced, so the solve
    // starves -- or the camera has MOVED FAR from the last keyframe, which
    // means there is now enough baseline to triangulate what is being tracked
    // but has no depth yet.
    const last = this.keyframes[this.keyframes.length - 1]
    const baseline = Math.hypot(centre[0] - last.centre[0], centre[1] - last.centre[1], centre[2] - last.centre[2])
    const spread = Math.max(
      ...this.keyframes.map((kf) =>
        Math.hypot(centre[0] - kf.centre[0], centre[1] - kf.centre[1], centre[2] - kf.centre[2]),
      ),
    )
    const thin = step.ids.length < TOPUP_BELOW
    if (!thin && baseline < spread * 0.15) return

    const seen = new Map<number, Vec2>()
    for (let i = 0; i < step.ids.length; i++) seen.set(step.ids[i], [step.points[i * 2], step.points[i * 2 + 1]])

    // Triangulate what is tracked now and was tracked at an earlier keyframe,
    // choosing the LONGEST baseline available: a short one puts the point
    // somewhere very uncertain along its own ray.
    const P2 = projection(this.k, pose)
    for (const [id, here] of seen) {
      if (this.points.has(id)) continue
      let best: { kf: Keyframe; there: Vec2; baseline: number } | null = null
      for (const kf of this.keyframes) {
        const there = kf.seen.get(id)
        if (!there) continue
        const d = Math.hypot(centre[0] - kf.centre[0], centre[1] - kf.centre[1], centre[2] - kf.centre[2])
        if (!best || d > best.baseline) best = { kf, there, baseline: d }
      }
      if (!best || best.baseline < 1e-6) continue
      const X = triangulate(projection(this.k, best.kf.pose), P2, best.there, here)
      if (!Number.isFinite(X[0] + X[1] + X[2])) continue
      if (!inFrontOf(best.kf.pose, X) || !inFrontOf(pose, X)) continue
      this.points.set(id, X)
      if (sample) this.colors.set(id, sample(here[0], here[1]))
    }

    this.keyframes.push({ pose, centre, seen })
    // Bounded: every keyframe holds a map of every point it saw, and an
    // unbounded list of them is a slow memory leak on a long session.
    if (this.keyframes.length > 12) this.keyframes.shift()

    this.needTopUp = thin
  }

  /** Points of the map, as flat arrays for the viewer. */
  cloud(): { positions: Float32Array; colors: Float32Array } {
    const n = this.points.size
    const positions = new Float32Array(n * 3)
    const colors = new Float32Array(n * 3)
    let i = 0
    for (const [id, X] of this.points) {
      positions[i * 3] = X[0]
      positions[i * 3 + 1] = X[1]
      positions[i * 3 + 2] = X[2]
      const c = this.colors.get(id) ?? [0.8, 0.84, 0.9]
      colors[i * 3] = c[0]
      colors[i * 3 + 1] = c[1]
      colors[i * 3 + 2] = c[2]
      i++
    }
    return { positions, colors }
  }

  /** Throw the map away and start looking again. */
  reset(): void {
    this.state = "idle"
    this.needTopUp = false
    this.seed.clear()
    this.points.clear()
    this.colors.clear()
    this.keyframes = []
    this.trajectory.length = 0
    this.pose = null
    this.parallax = 0
    this.reprojection = 0
    this.anchored = 0
    this.paired = 0
  }
}
