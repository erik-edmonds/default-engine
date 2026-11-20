import { Matrix, SingularValueDecomposition, determinant } from "ml-matrix"

import type { Vec3 } from "@/lib/sfm/geometry"

/** Umeyama: the similarity transform that best maps one point set onto another.
 *
 *  WHY ANY OF THIS IS NEEDED. A monocular reconstruction is only defined up to
 *  a similarity -- rotate it, translate it, scale it, and every image it
 *  predicts is identical. So "is the recovered trajectory correct?" cannot be
 *  answered by comparing coordinates directly; the two have to be brought into
 *  one frame first, and only what survives that is real error. This is the
 *  standard alignment step behind every reported ATE in the SLAM literature.
 *
 *  IT IS A MEASUREMENT, NOT A CORRECTION. The transform is used to SCORE the
 *  reconstruction and to draw it beside the truth. It is never fed back into
 *  the reconstruction, which never sees a true pose at any point.
 *
 *  Umeyama (1991), "Least-squares estimation of transformation parameters
 *  between two point patterns" -- including the determinant correction that
 *  stops a reflection being chosen when it happens to fit better.
 */
export interface Similarity {
  scale: number
  R: number[][]
  t: Vec3
}

export function umeyama(from: Vec3[], to: Vec3[]): Similarity | null {
  const n = Math.min(from.length, to.length)
  if (n < 3) return null

  const mean = (v: Vec3[]): Vec3 => {
    const m: [number, number, number] = [0, 0, 0]
    for (const p of v) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2] }
    return [m[0] / v.length, m[1] / v.length, m[2] / v.length]
  }
  const mFrom = mean(from.slice(0, n))
  const mTo = mean(to.slice(0, n))

  const X = new Matrix(n, 3)
  const Y = new Matrix(n, 3)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < 3; j++) {
      X.set(i, j, from[i][j] - mFrom[j])
      Y.set(i, j, to[i][j] - mTo[j])
    }
  }

  let variance = 0
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) variance += X.get(i, j) ** 2
  variance /= n
  if (variance < 1e-12) return null

  const C = Y.transpose().mmul(X).div(n)
  const svd = new SingularValueDecomposition(C)
  const U = svd.leftSingularVectors
  const V = svd.rightSingularVectors
  const d = svd.diagonal

  // The reflection guard. Without it a mirrored trajectory can score better
  // than the true one, and the "error" reported would be meaningless.
  const S = Matrix.eye(3)
  if (determinant(U) * determinant(V) < 0) S.set(2, 2, -1)

  const R = U.mmul(S).mmul(V.transpose())
  const trace = d[0] * S.get(0, 0) + d[1] * S.get(1, 1) + d[2] * S.get(2, 2)
  const scale = trace / variance

  const rot = (p: Vec3): Vec3 => [
    R.get(0, 0) * p[0] + R.get(0, 1) * p[1] + R.get(0, 2) * p[2],
    R.get(1, 0) * p[0] + R.get(1, 1) * p[1] + R.get(1, 2) * p[2],
    R.get(2, 0) * p[0] + R.get(2, 1) * p[1] + R.get(2, 2) * p[2],
  ]
  const rm = rot(mFrom)
  return {
    scale,
    R: [
      [R.get(0, 0), R.get(0, 1), R.get(0, 2)],
      [R.get(1, 0), R.get(1, 1), R.get(1, 2)],
      [R.get(2, 0), R.get(2, 1), R.get(2, 2)],
    ],
    t: [mTo[0] - scale * rm[0], mTo[1] - scale * rm[1], mTo[2] - scale * rm[2]],
  }
}

export function applySimilarity(s: Similarity, p: Vec3): Vec3 {
  const r: Vec3 = [
    s.R[0][0] * p[0] + s.R[0][1] * p[1] + s.R[0][2] * p[2],
    s.R[1][0] * p[0] + s.R[1][1] * p[1] + s.R[1][2] * p[2],
    s.R[2][0] * p[0] + s.R[2][1] * p[1] + s.R[2][2] * p[2],
  ]
  return [s.scale * r[0] + s.t[0], s.scale * r[1] + s.t[1], s.scale * r[2] + s.t[2]]
}

/** Absolute trajectory error after alignment: the number worth printing. */
export function trajectoryError(estimated: Vec3[], truth: Vec3[]): { median: number; extent: number; percent: number } | null {
  const s = umeyama(estimated, truth)
  if (!s) return null
  const errors: number[] = []
  for (let i = 0; i < Math.min(estimated.length, truth.length); i++) {
    const p = applySimilarity(s, estimated[i])
    errors.push(Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1], p[2] - truth[i][2]))
  }
  errors.sort((a, b) => a - b)
  const median = errors.length % 2 ? errors[errors.length >> 1] : (errors[(errors.length >> 1) - 1] + errors[errors.length >> 1]) / 2

  // Scale the error against how far the camera actually travelled, so the
  // figure means something without knowing the scene's units.
  let extent = 0
  for (let i = 0; i < truth.length; i++)
    for (let j = i + 1; j < truth.length; j++)
      extent = Math.max(extent, Math.hypot(truth[i][0] - truth[j][0], truth[i][1] - truth[j][1], truth[i][2] - truth[j][2]))

  return { median, extent, percent: extent > 1e-9 ? (median / extent) * 100 : 0 }
}
