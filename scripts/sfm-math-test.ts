/** THE POSE SOLVER, AGAINST A POSE IT IS NOT TOLD.
 *
 *  Run:  node --experimental-strip-types --import ./scripts/alias-hook.mjs \
 *          scripts/sfm-math-test.ts
 *
 *  IN THE REPO, NOT IN A TEMP DIRECTORY, for the reason scan-colour-probe.mjs
 *  states at length: every check this project wrote in a scratch dir has been
 *  lost, twice, and the suites that survived (xr-measure-test, copc-golden)
 *  survived because they are committed.
 *
 *  WHY THIS SUITE IS THE IMPORTANT ONE. src/lib/sfm/geometry.ts implements the
 *  part OpenCV.js does not ship -- the fundamental matrix, the essential
 *  matrix, the four-way pose decomposition and triangulation. A WRONG pose
 *  solver does not crash. It returns a rotation, a translation and a cloud of
 *  points that look entirely reasonable on screen, and the error shows up as
 *  "the reconstruction is a bit skewed", which is unfalsifiable by eye. A
 *  mirrored decomposition in particular passes cheirality, passes the
 *  reprojection check, and is simply inside out.
 *
 *  So: generate points, place two cameras at a KNOWN pose, project, feed the
 *  projections in, and demand the pose back. No OpenCV, no DOM, no browser --
 *  which is also why it runs in a second.
 */
import {
  decomposeEssential,
  eightPoint,
  ransacFundamental,
  sampson,
  twoView,
  type Intrinsics,
  type Vec2,
  type Vec3,
} from "../src/lib/sfm/geometry.ts"

const results: boolean[] = []
function check(name: string, ok: boolean, detail = ""): void {
  results.push(ok)
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`)
}

/** Deterministic, for the reason geometry.ts gives about RANSAC. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const K: Intrinsics = { fx: 525, fy: 525, cx: 320, cy: 240 }

function rotation(rx: number, ry: number, rz: number): number[][] {
  const [cx, sx] = [Math.cos(rx), Math.sin(rx)]
  const [cy, sy] = [Math.cos(ry), Math.sin(ry)]
  const [cz, sz] = [Math.cos(rz), Math.sin(rz)]
  const Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
  const Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
  const Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
  const mul = (A: number[][], B: number[][]) =>
    A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)))
  return mul(mul(Rz, Ry), Rx)
}

function project(R: number[][] | null, t: Vec3 | null, X: Vec3): Vec2 | null {
  const c = R && t
    ? [
        R[0][0] * X[0] + R[0][1] * X[1] + R[0][2] * X[2] + t[0],
        R[1][0] * X[0] + R[1][1] * X[1] + R[1][2] * X[2] + t[1],
        R[2][0] * X[0] + R[2][1] * X[1] + R[2][2] * X[2] + t[2],
      ]
    : [X[0], X[1], X[2]]
  if (c[2] <= 1e-6) return null
  return [K.fx * (c[0] / c[2]) + K.cx, K.fy * (c[1] / c[2]) + K.cy]
}

/** A scene and a second camera, with the truth kept to one side. */
function scene(count: number, seed: number, R: number[][], t: Vec3) {
  const rand = prng(seed)
  const a: Vec2[] = []
  const b: Vec2[] = []
  const world: Vec3[] = []
  let guard = 0
  while (a.length < count && guard++ < count * 40) {
    const X: Vec3 = [(rand() - 0.5) * 4, (rand() - 0.5) * 3, 4 + rand() * 6]
    const p = project(null, null, X)
    const q = project(R, t, X)
    if (!p || !q) continue
    if (p[0] < 0 || p[0] > 640 || p[1] < 0 || p[1] > 480) continue
    if (q[0] < 0 || q[0] > 640 || q[1] < 0 || q[1] > 480) continue
    a.push(p)
    b.push(q)
    world.push(X)
  }
  return { a, b, world }
}

const angleBetween = (u: Vec3, v: Vec3) => {
  const nu = Math.hypot(u[0], u[1], u[2])
  const nv = Math.hypot(v[0], v[1], v[2])
  const d = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (nu * nv)
  return (Math.acos(Math.max(-1, Math.min(1, d))) * 180) / Math.PI
}

const rotationError = (A: number[][], B: number[][]) => {
  // trace(A^T B) = 1 + 2cos(theta) for two rotations theta apart.
  let trace = 0
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) trace += A[j][i] * B[j][i]
  return (Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * 180) / Math.PI
}

console.log("\n  THE EIGHT-POINT SOLVE\n")
{
  const R = rotation(0.05, 0.22, -0.03)
  const t: Vec3 = [-1.2, 0.15, 0.3]
  const { a, b } = scene(80, 11, R, t)
  check("the scene projects into both views", a.length >= 60, `${a.length} correspondences`)

  const F = eightPoint(a, b)
  check("eight-point returns a matrix", F !== null)
  if (F) {
    const worst = Math.max(...a.map((p, i) => Math.sqrt(sampson(F, p, b[i]))))
    check("every exact correspondence satisfies it", worst < 1e-3, `worst Sampson ${worst.toExponential(2)} px`)
    // rank 2 <=> determinant 0. A full-rank F is the classic missed step.
    const det =
      F.get(0, 0) * (F.get(1, 1) * F.get(2, 2) - F.get(1, 2) * F.get(2, 1)) -
      F.get(0, 1) * (F.get(1, 0) * F.get(2, 2) - F.get(1, 2) * F.get(2, 0)) +
      F.get(0, 2) * (F.get(1, 0) * F.get(2, 1) - F.get(1, 1) * F.get(2, 0))
    const scale = Math.max(...[0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => Math.abs(F.get(i, j)))))
    check("rank two is enforced", Math.abs(det) / (scale ** 3) < 1e-6, `|det|/scale^3 = ${(Math.abs(det) / scale ** 3).toExponential(2)}`)
  }

  check("fewer than eight points is refused", eightPoint(a.slice(0, 7), b.slice(0, 7)) === null)
}

console.log("\n  THE FOUR-WAY DECOMPOSITION\n")
{
  const R = rotation(0.02, 0.3, 0.01)
  const t: Vec3 = [-1, 0, 0]
  const { a, b } = scene(80, 21, R, t)
  const F = eightPoint(a, b)!
  const Kx = [[K.fx, 0, K.cx], [0, K.fy, K.cy], [0, 0, 1]]
  // E = K^T F K, by hand so the test does not reuse the code under test.
  const E: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0
    for (let m = 0; m < 3; m++) for (let n = 0; n < 3; n++) s += Kx[m][i] * F.get(m, n) * Kx[n][j]
    E[i][j] = s
  }
  const { Matrix } = await import("ml-matrix")
  const poses = decomposeEssential(new Matrix(E))
  check("exactly four candidates", poses.length === 4)
  check(
    "each candidate is a proper rotation",
    poses.every((p) => {
      const d =
        p.R[0][0] * (p.R[1][1] * p.R[2][2] - p.R[1][2] * p.R[2][1]) -
        p.R[0][1] * (p.R[1][0] * p.R[2][2] - p.R[1][2] * p.R[2][0]) +
        p.R[0][2] * (p.R[1][0] * p.R[2][1] - p.R[1][1] * p.R[2][0])
      return Math.abs(d - 1) < 1e-6
    }),
    "determinant +1, never a reflection",
  )
  const bestR = Math.min(...poses.map((p) => rotationError(p.R, R)))
  check("the true rotation is among them", bestR < 0.5, `closest ${bestR.toFixed(3)} deg`)
}

console.log("\n  END TO END, AGAINST A POSE IT WAS NOT TOLD\n")
for (const [name, rx, ry, rz, tx, ty, tz, seed] of [
  ["sideways", 0.02, 0.25, 0.0, -1.5, 0.0, 0.0, 31],
  ["sideways and up", 0.12, 0.18, 0.05, -1.0, -0.7, 0.2, 32],
  ["forward-ish", 0.03, 0.12, -0.02, -0.6, 0.1, 0.9, 33],
] as const) {
  const R = rotation(rx, ry, rz)
  const t: Vec3 = [tx, ty, tz]
  const { a, b, world } = scene(120, seed, R, t)
  const result = twoView(a, b, K, { seed: 7 })
  if (!result) {
    check(`${name}: solved`, false)
    continue
  }
  const rErr = rotationError(result.pose.R, R)
  // Translation is only ever recovered up to scale, so compare DIRECTION.
  const tErr = angleBetween(result.pose.t, t)
  check(`${name}: rotation recovered`, rErr < 1, `${rErr.toFixed(3)} deg`)
  check(`${name}: translation direction recovered`, tErr < 1.5, `${tErr.toFixed(3)} deg`)
  check(`${name}: most points kept`, result.inliers.length > a.length * 0.8, `${result.inliers.length}/${a.length}`)
  check(`${name}: reprojection is sub-pixel`, result.reprojection < 1, `${result.reprojection.toFixed(4)} px`)
  check(`${name}: parallax is reported`, result.parallax > 1, `${result.parallax.toFixed(2)} deg`)

  // The recovered cloud is up to scale; check SHAPE, by comparing the ratio
  // of distances between pairs against the truth's.
  const idx = result.inliers
  if (idx.length > 10) {
    const d = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
    const ratios: number[] = []
    for (let i = 0; i + 1 < Math.min(40, idx.length); i++) {
      const dTrue = d(world[idx[i]], world[idx[i + 1]])
      const dGot = d(result.points[i], result.points[i + 1])
      if (dTrue > 1e-3) ratios.push(dGot / dTrue)
    }
    const mean = ratios.reduce((s, v) => s + v, 0) / ratios.length
    const spread = Math.max(...ratios.map((r) => Math.abs(r / mean - 1)))
    check(`${name}: cloud shape is consistent`, spread < 0.02, `worst deviation ${(spread * 100).toFixed(2)}%`)
  }
}

console.log("\n  WHAT MUST BE REFUSED\n")
{
  // PURE ROTATION. The commonest real failure: the camera turned but never
  // moved, so there is no baseline and nothing can be triangulated. The
  // epipolar geometry is degenerate and any "reconstruction" is invented.
  const R = rotation(0.0, 0.25, 0.0)
  const { a, b } = scene(120, 41, R, [0, 0, 0])
  const result = twoView(a, b, K, { seed: 7 })
  const parallax = result?.parallax ?? 0
  check("pure rotation reports no parallax", parallax < 0.5, `${parallax.toFixed(4)} deg -- caller must reject on this`)
}
{
  const R = rotation(0.02, 0.2, 0)
  const { a, b } = scene(7, 51, R, [-1, 0, 0])
  check("too few correspondences is refused", twoView(a, b, K) === null, `${a.length} points`)
}
{
  // Noise that is pure outliers: RANSAC must not find a consensus.
  const rand = prng(61)
  const a: Vec2[] = []
  const b: Vec2[] = []
  for (let i = 0; i < 100; i++) {
    a.push([rand() * 640, rand() * 480])
    b.push([rand() * 640, rand() * 480])
  }
  const r = ransacFundamental(a, b, { threshold: 1, seed: 7 })
  const share = r ? r.inliers.length / a.length : 0
  check("random correspondences reach no consensus", share < 0.35, `${(share * 100).toFixed(0)}% "inliers"`)
}

const passed = results.filter(Boolean).length
console.log(`\n  ${passed}/${results.length} checks passed\n`)
if (passed !== results.length) process.exit(1)
