"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"

import { SceneFallback } from "@/components/layout/SceneFallback"
import { useContextLoss } from "@/helpers/useContextLoss"
import { applySimilarity, umeyama, type Similarity } from "@/lib/sfm/align"
import type { Vec3 } from "@/lib/sfm/geometry"
import type { ReconstructionState } from "@/lib/sfm/reconstruct"

/** The reconstruction, drawn.
 *
 *  OPENCV'S AXES ARE NOT THREE'S, and this is the only place that is handled.
 *  OpenCV looks down +Z with +Y DOWN; three has +Y up and looks down -Z. So
 *  every point and every camera centre is flipped in Y and Z on the way in.
 *  Doing it here, once, keeps the solver in the convention its maths is
 *  written in -- the scan viewer makes the same decision for LAS's Z-up, with
 *  a different rotation, and the two must not be confused.
 */
const toThree = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p[0], -p[1], -p[2])

function Cloud({ state }: { state: ReconstructionState }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const n = state.points.length
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const v = toThree(state.points[i])
      pos[i * 3] = v.x
      pos[i * 3 + 1] = v.y
      pos[i * 3 + 2] = v.z
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3))
    if (state.colors.length >= n * 3) {
      // The colours were sampled from sRGB pixel bytes, so they have to be
      // linearised before three multiplies them -- the same correction
      // lib/scan/pointMaterial.ts documents at length for the point cloud.
      const lin = new Float32Array(n * 3)
      for (let i = 0; i < n * 3; i++) {
        const c = state.colors[i]
        lin[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      }
      g.setAttribute("color", new THREE.BufferAttribute(lin, 3))
    }
    return g
  }, [state])

  return (
    <points geometry={geometry} frustumCulled={false}>
      {/* No size attenuation. The cloud spans a wide range of depths and
          attenuated points dissolve to nothing at the far end, which reads as
          the reconstruction having failed there rather than as perspective.
          A flat two pixels keeps the whole structure legible. */}
      <pointsMaterial size={2} vertexColors sizeAttenuation={false} toneMapped={false} />
    </points>
  )
}

/** One camera, drawn as the pyramid it actually sees through. */
function Frustum({ centre, R, colour, scale = 0.16 }: { centre: Vec3; R: number[][]; colour: string; scale?: number }) {
  const geometry = useMemo(() => {
    // Camera axes in world space are the ROWS of R read as columns of R^T.
    const right = new THREE.Vector3(R[0][0], R[0][1], R[0][2])
    const up = new THREE.Vector3(R[1][0], R[1][1], R[1][2])
    const fwd = new THREE.Vector3(R[2][0], R[2][1], R[2][2])
    const c = new THREE.Vector3(centre[0], centre[1], centre[2])

    const corner = (sx: number, sy: number) =>
      c.clone()
        .add(fwd.clone().multiplyScalar(scale * 1.6))
        .add(right.clone().multiplyScalar(sx * scale))
        .add(up.clone().multiplyScalar(sy * scale * 0.75))

    const pts = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
    const verts: number[] = []
    const push = (a: THREE.Vector3, b: THREE.Vector3) => {
      // Flip into three's frame at the last moment, so the camera basis above
      // stays in OpenCV's convention where it was computed.
      verts.push(a.x, -a.y, -a.z, b.x, -b.y, -b.z)
    }
    for (const p of pts) push(c, p)
    for (let i = 0; i < 4; i++) push(pts[i], pts[(i + 1) % 4])

    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(verts), 3))
    return g
  }, [centre, R, scale])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={colour} toneMapped={false} />
    </lineSegments>
  )
}

function Path({ points, colour }: { points: Vec3[]; colour: string }) {
  /** A <primitive>, not <line>.
   *
   *  JSX resolves the intrinsic name `line` to SVG's SVGLineElement, not to
   *  three's Line, so `<line geometry={...}>` is a type error that has nothing
   *  to do with three. Constructing the object and handing it over sidesteps
   *  the name collision; <lineSegments> above has no such clash and is used
   *  directly. */
  const object = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setFromPoints(points.map(toThree))
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: colour, toneMapped: false }))
  }, [points, colour])
  if (points.length < 2) return null
  return <primitive object={object} />
}

/** Frame the reconstruction, and keep framing it as it grows.
 *
 *  TWO THINGS THIS GETS WRONG IF DONE NAIVELY, both of which it did.
 *
 *  1. FITTING ONCE. The bootstrap pair produces a few dozen points; every
 *     frame after it adds thousands. A fit taken at the first sign of a cloud
 *     frames that handful and never looks again, leaving the finished
 *     reconstruction mostly off-screen. So it refits whenever the cloud has
 *     grown by half again.
 *
 *  2. USING THE FULL BOUNDING BOX. A triangulated cloud always has a few
 *     points flung far away -- a correspondence that was wrong, or a ray pair
 *     too parallel to intersect anywhere sensible. They pass the reprojection
 *     gate and they are visually negligible, but they can be a hundred times
 *     further out than the scene, and a box drawn around them puts the actual
 *     subject in a few pixels at the centre. The fit therefore uses a
 *     PERCENTILE box, which is immune to a handful of strays, and includes the
 *     camera path so the trajectory is in frame too.
 */
function Fit({
  state,
  controls,
}: {
  state: ReconstructionState
  controls: React.RefObject<OrbitControlsImpl | null>
}) {
  const { camera } = useThree()
  const fittedAt = useRef(0)

  useFrame(() => {
    const n = state.points.length
    if (n < 20) return
    if (fittedAt.current && n < fittedAt.current * 1.5) return
    fittedAt.current = n

    const xs: number[] = []
    const ys: number[] = []
    const zs: number[] = []
    for (const p of state.points) {
      const v = toThree(p)
      xs.push(v.x); ys.push(v.y); zs.push(v.z)
    }
    const span = (values: number[]): [number, number] => {
      const s = [...values].sort((a, b) => a - b)
      const lo = s[Math.floor(s.length * 0.05)]
      const hi = s[Math.floor(s.length * 0.95)]
      return [lo, hi]
    }
    const [x0, x1] = span(xs)
    const [y0, y1] = span(ys)
    const [z0, z1] = span(zs)

    const box = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1))
    for (const c of state.cameras) box.expandByPoint(toThree(c.centre))

    const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1e-3)
    const centre = box.getCenter(new THREE.Vector3())
    camera.position.copy(centre).add(new THREE.Vector3(size * 0.45, size * 0.3, size * 0.55))
    camera.updateProjectionMatrix()

    // THE ORBIT TARGET, NOT JUST THE CAMERA. OrbitControls re-aims the camera
    // at its own `target` on every update, so a bare `camera.lookAt()` is
    // undone before the next frame is drawn and the reconstruction sits
    // stubbornly off to one side. ScanExperience.tsx records the same trap
    // from the other direction -- it moved the camera and never moved the
    // target, and nothing appeared to happen.
    const c = controls.current
    if (c) {
      c.target.copy(centre)
      c.update()
    } else {
      camera.lookAt(centre)
    }
  })
  return null
}

export function Reconstruction3D({
  state,
  truth,
}: {
  state: ReconstructionState | null
  truth: Vec3[]
}) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  /** The third guard every canvas in this project carries, alongside the
   *  error boundary in DetectionMount and the Suspense inside the tree. A
   *  browser that drops the WebGL context to free memory for another tab
   *  leaves a permanently black canvas unless the lost event is
   *  preventDefault'd, which is what this does. */
  const { lost, onCreated } = useContextLoss()
  /** The truth, brought into the reconstruction's own frame.
   *
   *  A monocular reconstruction is only defined up to a similarity, so the two
   *  trajectories cannot be drawn together until one is mapped onto the other.
   *  The estimate is left ALONE and the truth is moved -- the reconstruction
   *  is the thing being shown, and nudging it toward the answer would be
   *  drawing the conclusion rather than the result. */
  const alignedTruth = useMemo(() => {
    if (!state || state.cameras.length < 3) return []
    const est = state.cameras.map((c) => c.centre)
    const tru = state.cameras.map((c) => truth[c.frame]).filter(Boolean)
    if (tru.length !== est.length) return []
    const s: Similarity | null = umeyama(tru, est)
    if (!s) return []
    return tru.map((p) => applySimilarity(s, p))
  }, [state, truth])

  return (
    <>
    <Canvas
      className="sfm-3d"
      onCreated={onCreated}
      dpr={[1, 2]}
      camera={{ fov: 50, near: 0.01, far: 500, position: [2.5, 1.6, 3] }}
    >
      {/* Not black: a still-empty scene must not be mistakable for a dead
          context, the same reason the scan viewer clears to #0e1217. */}
      <color attach="background" args={["#0a0e13"]} />
      <OrbitControls ref={controls} enableDamping dampingFactor={0.08} makeDefault />
      {state && (
        <>
          <Fit state={state} controls={controls} />
          <Cloud state={state} />
          <Path points={state.cameras.map((c) => c.centre)} colour="#ffb37a" />
          {alignedTruth.length > 1 && <Path points={alignedTruth} colour="#4f6b7a" />}
          {state.cameras.map((c) => (
            <Frustum
              key={c.frame}
              centre={c.centre}
              R={c.pose.R}
              colour={state.bootstrap.includes(c.frame) ? "#7fd4c1" : "#ffb37a"}
            />
          ))}
        </>
      )}
    </Canvas>
    {lost && (
      <SceneFallback
        title="Rendering stopped"
        detail="The browser released the graphics context, usually to free memory for another tab. It may come back on its own."
        action="Reload"
        onAction={() => window.location.reload()}
      />
    )}
    </>
  )
}
