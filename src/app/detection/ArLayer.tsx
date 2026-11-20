"use client"

import { useMemo, useRef, type RefObject } from "react"
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"

import { useGLTF } from "@/helpers/useGLTF"
import type { Intrinsics, Pose, Vec3 } from "@/lib/sfm/geometry"

/** The anchored object, drawn through the camera the tracker recovered.
 *
 *  THIS IS THE PROOF, not the decoration. Everything else on the page is a
 *  number or a cloud of dots that a viewer has to take on trust. An object
 *  that stays on the desk while you walk around it cannot be faked by a
 *  plausible-looking pose: a rotation off by two degrees, a mirrored
 *  decomposition, a translation in the wrong units -- every one of those shows
 *  up immediately as the object sliding, swimming or sinking through the
 *  surface.
 *
 *  THE POSE ARRIVES BY REF AND IS READ IN useFrame, NEVER AS A PROP. It
 *  changes at camera rate; passing it through React would mean a render of
 *  this tree for every frame the tracker solves, which is both wasteful and
 *  the thing `react-hooks/refs` exists to stop. The frame loop is outside
 *  render, so reading and mutating there is correct rather than merely
 *  tolerated -- the same split lib/scan/pointMaterial.ts relies on.
 *
 *  WORLD COORDINATES ARE OPENCV'S HERE, deliberately, and this is the one
 *  place in the project that does it. Reconstruction3D.tsx converts world
 *  points into three's frame on the way in because it is drawing a
 *  reconstruction for a human to orbit. This scene is not orbited -- it is
 *  seen through the real camera -- so the honest thing is to leave the world
 *  exactly as the solver expresses it and convert only the CAMERA's basis.
 *  Converting both would be two flips that cancel, which works right up until
 *  somebody adds a light.
 */

/** OpenCV's camera axes to three's: +Y down, +Z forward becomes +Y up, -Z
 *  forward. Its own inverse, which is why it appears once rather than twice. */
const FLIP = new THREE.Matrix4().makeScale(1, -1, -1)

function TrackedCamera({
  poseRef,
  k,
  width,
  height,
}: {
  poseRef: RefObject<Pose | null>
  k: Intrinsics
  width: number
  height: number
}) {
  const configured = useRef("")
  const basis = useRef(new THREE.Matrix4())

  useFrame((state) => {
    const camera = state.camera as THREE.PerspectiveCamera

    // Set up the frustum once per geometry, inside the frame loop rather than
    // an effect: `camera` is fiber's, and writing to it during render or from
    // an effect is the mutation react-hooks/immutability objects to.
    const key = `${k.fy}|${width}|${height}`
    if (configured.current !== key) {
      configured.current = key
      // three's `fov` is VERTICAL; the intrinsics came from a horizontal field
      // of view. Going through fy and the image height rather than reusing the
      // horizontal number is what keeps the virtual frustum the same shape as
      // the real one -- and a mismatch is exactly the "object drifts as you
      // pan" symptom.
      camera.fov = (2 * Math.atan(height / 2 / k.fy) * 180) / Math.PI
      camera.aspect = width / height
      camera.near = 0.01
      camera.far = 500
      camera.updateProjectionMatrix()
    }

    const pose = poseRef.current
    if (!pose) return
    // The solver gives [R|t] taking WORLD to CAMERA. three wants the inverse:
    // camera-local to world. So the camera's world rotation is R transposed,
    // its position is the camera centre -R^T t, and FLIP turns OpenCV's basis
    // into three's.
    const R = pose.R
    const m = basis.current.set(
      R[0][0], R[1][0], R[2][0], 0,
      R[0][1], R[1][1], R[2][1], 0,
      R[0][2], R[1][2], R[2][2], 0,
      0, 0, 0, 1,
    )
    m.multiply(FLIP)
    camera.quaternion.setFromRotationMatrix(m)
    camera.position.set(
      -(R[0][0] * pose.t[0] + R[1][0] * pose.t[1] + R[2][0] * pose.t[2]),
      -(R[0][1] * pose.t[0] + R[1][1] * pose.t[1] + R[2][1] * pose.t[2]),
      -(R[0][2] * pose.t[0] + R[1][2] * pose.t[1] + R[2][2] * pose.t[2]),
    )
  })
  return null
}

/** The thing that sits on your desk. */
function Anchored({ at, scale }: { at: Vec3; scale: number }) {
  const gltf = useGLTF("/models/pokeball.glb")
  const object = useMemo(() => gltf.scene.clone(), [gltf.scene])

  /** Measured, not assumed. Every model in public/ arrives at a different
   *  natural size, and the anchor needs a known one -- VrInterior documents
   *  the same Box3 fit for the same reason. */
  const unit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    return 1 / Math.max(size.x, size.y, size.z, 1e-6)
  }, [object])

  return (
    <group position={[at[0], at[1], at[2]]} scale={unit * scale}>
      <primitive object={object} />
    </group>
  )
}

export function ArLayer({
  poseRef,
  anchor,
  anchorScale,
  k,
  width,
  height,
}: {
  poseRef: RefObject<Pose | null>
  anchor: Vec3 | null
  anchorScale: number
  k: Intrinsics
  width: number
  height: number
}) {
  return (
    <Canvas
      className="sfm-ar"
      // TRANSPARENT, so the live video behind shows through. `alpha` has to be
      // on at context creation -- it cannot be turned on afterwards.
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <TrackedCamera poseRef={poseRef} k={k} width={width} height={height} />
      {/* Its own rig. There is no environment here and nothing else lit, so
          these are the whole of how the object reads against a real room. */}
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, -3, 2]} intensity={2} />
      {anchor && <Anchored at={anchor} scale={anchorScale} />}
    </Canvas>
  )
}
