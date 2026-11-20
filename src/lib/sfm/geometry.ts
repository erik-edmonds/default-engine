import { Matrix, SingularValueDecomposition, determinant } from "ml-matrix"

/** The two-view geometry OpenCV.js does not ship.
 *
 *  WHY THIS FILE EXISTS AT ALL. The build whitelist includes `findHomography`
 *  and `solvePnPRansac` but NOT `findFundamentalMat`, `findEssentialMat`,
 *  `recoverPose` or `triangulatePoints` -- verified by enumerating the shipped
 *  binary, not by reading the config, because the OpenCV forums are full of
 *  people who whitelisted a function and still got `undefined`. So the step
 *  from "matched points" to "where the camera moved and where the points are"
 *  is implemented here.
 *
 *  PURE FUNCTIONS, NO DOM, NO OPENCV. That is what lets scripts/sfm-math-test
 *  run the whole thing in node against correspondences generated from a known
 *  pose, which is the only way to know a pose solver is right -- a wrong one
 *  still produces a plausible-looking cloud, and debugging it through a
 *  rendered point cloud is hopeless.
 *
 *  Conventions: image points are pixels; a camera is [R|t] taking WORLD points
 *  to CAMERA coordinates; the first camera is the identity. OpenCV's axes
 *  (+X right, +Y down, +Z forward) throughout -- the conversion to three's
 *  Y-up happens in the viewer, once, and nowhere else.
 */

export type Vec2 = readonly [number, number]
export type Vec3 = readonly [number, number, number]

export interface Intrinsics {
  fx: number
  fy: number
  cx: number
  cy: number
}

export interface Pose {
  /** Row-major 3x3, world -> camera. */
  R: number[][]
  /** Translation, world -> camera. Unit length for a two-view solve: a
   *  monocular pair fixes direction, never scale. */
  t: Vec3
}

/** Mulberry32 again, because RANSAC must not use Math.random.
 *
 *  Two reasons, and the second is the one that matters: a seeded sampler makes
 *  a reconstruction reproducible, so the same input gives the same answer in a
 *  test, in a screenshot and in front of a visitor. An unseeded one makes
 *  every failure a one-off nobody can reproduce. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hartley normalisation: centroid to the origin, mean distance to sqrt(2).
 *
 *  NOT OPTIONAL. The eight-point algorithm on raw pixel coordinates is
 *  famously unstable -- entries of A differ by six orders of magnitude between
 *  the x*x' terms and the 1s, and the smallest singular vector is then mostly
 *  numerical noise. Normalising first is the single change that turns it from
 *  a textbook curiosity into something that works. */
function normalize(points: Vec2[]): { normalized: Vec2[]; T: Matrix } {
  const n = points.length
  let cx = 0
  let cy = 0
  for (const [x, y] of points) {
    cx += x
    cy += y
  }
  cx /= n
  cy /= n

  let mean = 0
  for (const [x, y] of points) mean += Math.hypot(x - cx, y - cy)
  mean /= n
  // A degenerate set -- every point identical -- would divide by zero here.
  const scale = mean > 1e-12 ? Math.SQRT2 / mean : 1

  const normalized = points.map(([x, y]) => [(x - cx) * scale, (y - cy) * scale] as Vec2)
  const T = new Matrix([
    [scale, 0, -scale * cx],
    [0, scale, -scale * cy],
    [0, 0, 1],
  ])
  return { normalized, T }
}

/** The fundamental matrix from eight or more correspondences. */
export function eightPoint(a: Vec2[], b: Vec2[]): Matrix | null {
  if (a.length < 8 || a.length !== b.length) return null
  const { normalized: na, T: Ta } = normalize(a)
  const { normalized: nb, T: Tb } = normalize(b)

  const rows: number[][] = []
  for (let i = 0; i < na.length; i++) {
    const [x1, y1] = na[i]
    const [x2, y2] = nb[i]
    rows.push([x2 * x1, x2 * y1, x2, y2 * x1, y2 * y1, y2, x1, y1, 1])
  }

  // PADDED TO NINE ROWS, AND THIS IS NOT COSMETIC.
  //
  // With exactly eight correspondences A is 8x9 -- fewer rows than columns --
  // and ml-matrix returns an ECONOMY decomposition whose V is 9x8. The vector
  // the eight-point algorithm needs is the null-space vector, the ninth right
  // singular vector, and in that form it is not present at all: taking the
  // last available column silently returns a different vector entirely.
  //
  // The symptom is brutal to diagnose because nothing throws. The solve
  // returns a plausible full-rank-looking F, RANSAC scores it, and a handful
  // of correspondences happen to agree with it. Measured before this line
  // existed: on 120 EXACT, noise-free correspondences, RANSAC settled on 45
  // inliers instead of 120, and the recovered pose was still correct -- it
  // just threw away two thirds of the data to get there.
  //
  // A row of zeros changes nothing about the solution space and makes A 9x9,
  // so V is 9x9 and its last column is the null vector. Harmless when there
  // are already nine or more rows, so it is applied unconditionally.
  while (rows.length < 9) rows.push([0, 0, 0, 0, 0, 0, 0, 0, 0])

  const svd = new SingularValueDecomposition(new Matrix(rows), { autoTranspose: true })
  const V = svd.rightSingularVectors
  const f = V.getColumn(V.columns - 1)
  let F = new Matrix([
    [f[0], f[1], f[2]],
    [f[3], f[4], f[5]],
    [f[6], f[7], f[8]],
  ])

  // RANK TWO, ENFORCED. A fundamental matrix is singular by construction --
  // every epipolar line passes through the epipole. The least-squares solve
  // does not know that, so its answer is generically full rank, and the
  // epipolar lines it predicts do not meet. Zeroing the smallest singular
  // value is the projection back onto the set of valid F.
  const fs = new SingularValueDecomposition(F)
  const d = fs.diagonal
  const S = Matrix.zeros(3, 3)
  S.set(0, 0, d[0])
  S.set(1, 1, d[1])
  S.set(2, 2, 0)
  F = fs.leftSingularVectors.mmul(S).mmul(fs.rightSingularVectors.transpose())

  // Undo the normalisation: F = Tb^T * F_norm * Ta
  return Tb.transpose().mmul(F).mmul(Ta)
}

/** Sampson distance -- the first-order approximation to reprojection error,
 *  and the right residual for RANSAC on F. Plain algebraic error |x'Fx| is
 *  scale-dependent and quietly favours points near the epipole. */
export function sampson(F: Matrix, p: Vec2, q: Vec2): number {
  const [x1, y1] = p
  const [x2, y2] = q
  const Fx = [
    F.get(0, 0) * x1 + F.get(0, 1) * y1 + F.get(0, 2),
    F.get(1, 0) * x1 + F.get(1, 1) * y1 + F.get(1, 2),
    F.get(2, 0) * x1 + F.get(2, 1) * y1 + F.get(2, 2),
  ]
  const Ftx = [
    F.get(0, 0) * x2 + F.get(1, 0) * y2 + F.get(2, 0),
    F.get(0, 1) * x2 + F.get(1, 1) * y2 + F.get(2, 1),
    F.get(0, 2) * x2 + F.get(1, 2) * y2 + F.get(2, 2),
  ]
  const xFx = x2 * Fx[0] + y2 * Fx[1] + Fx[2]
  const denom = Fx[0] * Fx[0] + Fx[1] * Fx[1] + Ftx[0] * Ftx[0] + Ftx[1] * Ftx[1]
  return denom > 1e-12 ? (xFx * xFx) / denom : Number.POSITIVE_INFINITY
}

export interface RansacResult {
  F: Matrix
  inliers: number[]
  iterations: number
}

/** RANSAC over the eight-point solve. */
export function ransacFundamental(
  a: Vec2[],
  b: Vec2[],
  options: { threshold?: number; maxIterations?: number; seed?: number } = {},
): RansacResult | null {
  const threshold = options.threshold ?? 3
  const maxIterations = options.maxIterations ?? 2000
  const rand = prng(options.seed ?? 1)
  const n = a.length
  if (n < 8) return null

  const t2 = threshold * threshold
  let best: number[] = []
  let bestF: Matrix | null = null
  let iterations = 0

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1
    const pick = new Set<number>()
    while (pick.size < 8) pick.add(Math.floor(rand() * n))
    const idx = [...pick]
    const F = eightPoint(idx.map((i) => a[i]), idx.map((i) => b[i]))
    if (!F) continue

    const inliers: number[] = []
    for (let i = 0; i < n; i++) if (sampson(F, a[i], b[i]) < t2) inliers.push(i)

    if (inliers.length > best.length) {
      best = inliers
      bestF = F
      // Adaptive stop: once a hypothesis explains almost everything, more
      // sampling cannot improve it and only costs time.
      if (best.length > n * 0.92) break
    }
  }
  if (!bestF || best.length < 8) return null

  // REFIT ON ALL INLIERS. The winning hypothesis came from eight points chosen
  // at random; the useful estimate uses every point that agreed with it.
  const refit = eightPoint(best.map((i) => a[i]), best.map((i) => b[i]))
  return { F: refit ?? bestF, inliers: best, iterations }
}

function intrinsicsMatrix(k: Intrinsics): Matrix {
  return new Matrix([
    [k.fx, 0, k.cx],
    [0, k.fy, k.cy],
    [0, 0, 1],
  ])
}

/** The four (R, t) a single essential matrix admits. */
export function decomposeEssential(E: Matrix): Pose[] {
  const svd = new SingularValueDecomposition(E)
  let U = svd.leftSingularVectors
  let V = svd.rightSingularVectors

  // A rotation has determinant +1. SVD is free to hand back reflections, and
  // one slipping through produces a mirrored reconstruction that passes every
  // other check -- points in front of both cameras, small residuals, and
  // completely wrong.
  if (determinant(U) < 0) U = U.mmul(Matrix.diag([1, 1, -1]))
  if (determinant(V) < 0) V = V.mmul(Matrix.diag([1, 1, -1]))

  const W = new Matrix([
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ])
  const Ra = U.mmul(W).mmul(V.transpose())
  const Rb = U.mmul(W.transpose()).mmul(V.transpose())
  const u = U.getColumn(2)
  const t: Vec3 = [u[0], u[1], u[2]]
  const negT: Vec3 = [-u[0], -u[1], -u[2]]

  const toRows = (m: Matrix): number[][] => [
    [m.get(0, 0), m.get(0, 1), m.get(0, 2)],
    [m.get(1, 0), m.get(1, 1), m.get(1, 2)],
    [m.get(2, 0), m.get(2, 1), m.get(2, 2)],
  ]
  return [
    { R: toRows(Ra), t },
    { R: toRows(Ra), t: negT },
    { R: toRows(Rb), t },
    { R: toRows(Rb), t: negT },
  ]
}

/** 3x4 projection matrix K[R|t]. Exported because the incremental stage needs
 *  to triangulate against cameras this module did not solve -- they came back
 *  from OpenCV's `solvePnPRansac`. */
export function projection(k: Intrinsics, pose: Pose | null): Matrix {
  const K = intrinsicsMatrix(k)
  const Rt = pose
    ? new Matrix([
        [pose.R[0][0], pose.R[0][1], pose.R[0][2], pose.t[0]],
        [pose.R[1][0], pose.R[1][1], pose.R[1][2], pose.t[1]],
        [pose.R[2][0], pose.R[2][1], pose.R[2][2], pose.t[2]],
      ])
    : new Matrix([
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ])
  return K.mmul(Rt)
}

/** Linear DLT triangulation of one correspondence. */
export function triangulate(P1: Matrix, P2: Matrix, p: Vec2, q: Vec2): Vec3 {
  const [x1, y1] = p
  const [x2, y2] = q
  /** One DLT row: x * P_row2 - P_row(axis), i.e. the cross product of the
   *  measured pixel with its own projection, written out. */
  const row = (x: number, axis: 0 | 1, P: Matrix) => [
    x * P.get(2, 0) - P.get(axis, 0),
    x * P.get(2, 1) - P.get(axis, 1),
    x * P.get(2, 2) - P.get(axis, 2),
    x * P.get(2, 3) - P.get(axis, 3),
  ]
  const A = new Matrix([
    row(x1, 0, P1),
    row(y1, 1, P1),
    row(x2, 0, P2),
    row(y2, 1, P2),
  ])
  const svd = new SingularValueDecomposition(A, { autoTranspose: true })
  const V = svd.rightSingularVectors
  const X = V.getColumn(V.columns - 1)
  const w = Math.abs(X[3]) > 1e-12 ? X[3] : 1e-12
  return [X[0] / w, X[1] / w, X[2] / w]
}

export interface TwoViewResult {
  pose: Pose
  /** Indices into the input arrays that survived RANSAC and cheirality. */
  inliers: number[]
  points: Vec3[]
  /** Median reprojection error over `inliers`, in pixels. */
  reprojection: number
  /** Median angle between the two rays, in degrees. The parallax check: near
   *  zero means the camera did not translate and nothing can be triangulated,
   *  however good the matching was. */
  parallax: number
}

function inFront(pose: Pose | null, X: Vec3): boolean {
  if (!pose) return X[2] > 0
  const z = pose.R[2][0] * X[0] + pose.R[2][1] * X[1] + pose.R[2][2] * X[2] + pose.t[2]
  return z > 0
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((x, y) => x - y)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Everything from matched points to a pose and a cloud. */
export function twoView(
  a: Vec2[],
  b: Vec2[],
  k: Intrinsics,
  options: { threshold?: number; seed?: number } = {},
): TwoViewResult | null {
  const ransac = ransacFundamental(a, b, { threshold: options.threshold, seed: options.seed })
  if (!ransac) return null

  const K = intrinsicsMatrix(k)
  const E = K.transpose().mmul(ransac.F).mmul(K)
  const candidates = decomposeEssential(E)

  const P1 = projection(k, null)
  const ia = ransac.inliers.map((i) => a[i])
  const ib = ransac.inliers.map((i) => b[i])

  // CHEIRALITY PICKS THE ANSWER. All four candidates satisfy the epipolar
  // constraint equally; only one puts the scene in front of both cameras.
  let best: TwoViewResult | null = null
  for (const pose of candidates) {
    const P2 = projection(k, pose)
    const kept: number[] = []
    const points: Vec3[] = []
    for (let i = 0; i < ia.length; i++) {
      const X = triangulate(P1, P2, ia[i], ib[i])
      if (!Number.isFinite(X[0] + X[1] + X[2])) continue
      if (!inFront(null, X) || !inFront(pose, X)) continue
      kept.push(ransac.inliers[i])
      points.push(X)
    }
    if (!best || kept.length > best.inliers.length) {
      const errors: number[] = []
      const angles: number[] = []
      for (let i = 0; i < points.length; i++) {
        const X = points[i]
        const u = K.mmul(new Matrix([[X[0]], [X[1]], [X[2]]]))
        const px = u.get(0, 0) / u.get(2, 0)
        const py = u.get(1, 0) / u.get(2, 0)
        const src = a[kept[i]]
        errors.push(Math.hypot(px - src[0], py - src[1]))

        // Angle between the ray from camera one and the ray from camera two.
        const c2: Vec3 = [
          -(pose.R[0][0] * pose.t[0] + pose.R[1][0] * pose.t[1] + pose.R[2][0] * pose.t[2]),
          -(pose.R[0][1] * pose.t[0] + pose.R[1][1] * pose.t[1] + pose.R[2][1] * pose.t[2]),
          -(pose.R[0][2] * pose.t[0] + pose.R[1][2] * pose.t[1] + pose.R[2][2] * pose.t[2]),
        ]
        const r1 = [X[0], X[1], X[2]]
        const r2 = [X[0] - c2[0], X[1] - c2[1], X[2] - c2[2]]
        const n1 = Math.hypot(r1[0], r1[1], r1[2])
        const n2 = Math.hypot(r2[0], r2[1], r2[2])
        if (n1 > 1e-9 && n2 > 1e-9) {
          const dot = (r1[0] * r2[0] + r1[1] * r2[1] + r1[2] * r2[2]) / (n1 * n2)
          angles.push((Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI)
        }
      }
      best = {
        pose,
        inliers: kept,
        points,
        reprojection: median(errors),
        parallax: median(angles),
      }
    }
  }
  return best
}
