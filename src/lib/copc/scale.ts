import * as THREE from "three"

/** The transform chain that puts a survey in a room.
 *
 *  Pure arithmetic, separated from React so a probe can assert it without a
 *  renderer — which matters, because the central claim below (that the scale
 *  cancels out of the LOD) is the kind of thing that is either exactly true
 *  or quietly broken.
 *
 *  Three nested groups:
 *
 *      placement   position = T      metres: where the model sits
 *        scale     scale    = k      ONE uniform scalar
 *          recentre position = -A    file units
 *            <PointCloud/>           unchanged
 *
 *  so that world = T + k·R·(p − A), where R is the Z-up→Y-up rotation the
 *  cloud already carries.
 *
 *  WHY k MUST BE A SCALAR AND NEVER A Vector3. `selectNodes` scores nodes by
 *  `spacing(level) × factor / distance`, with both spacing and distance in
 *  the cloud's own units — it transforms the camera into local space rather
 *  than transforming 278 boxes out of it. A uniform k therefore cancels
 *  exactly and the LOD is scale-invariant for free. A non-uniform scale makes
 *  `distance` anisotropic and the cancellation silently fails: the model
 *  would pick its level of detail based on which way you were standing.
 *
 *  WHY THE SCALE IS NEVER ON <XROrigin>. three builds each eye as
 *  `parent.matrixWorld × camera.matrix`, where camera.matrix is the raw pose
 *  from the runtime and the projection is untouched. A scale on the origin
 *  therefore multiplies the user's interpupillary distance. At 1:710 an IPD
 *  of 63 mm becomes 0.09 mm: no stereo at all, and the world reads as flat
 *  and infinitely far away. The model is small; the person is not.
 */

export interface ScanRig {
  /** Uniform scalar on the `scale` group. */
  k: number
  /** Metres: position of the `placement` group. */
  placement: [number, number, number]
  /** File units: the point translated to the origin before scaling. */
  anchor: [number, number, number]
  /** For the readout — 710 means 1:710. */
  ratio: number
}

/** The whole site as a model you walk around.
 *
 *  Self-normalising on the longest extent, so the GEOMETRY needs no unit
 *  conversion: whatever the file's units, the model comes out `longestMetres`
 *  across.
 *
 *  THE REPORTED RATIO IS A DIFFERENT MATTER, and `1/k` is not it. `k` is
 *  metres-per-file-unit, so inverting it gives file-units-per-metre -- a
 *  number with mixed units that only coincides with the scale ratio when the
 *  file happens to be in metres. Autzen is in feet: its longest extent is
 *  4655.5 ft, k is 2.0/4655.5 = 4.296e-4, and 1/k is 2328 -- but the site is
 *  1419 m long and the model is 2 m, so the scale is 1:710. Reporting 2328
 *  would be wrong by exactly the 3.28 ft/m conversion, and wrong in the
 *  confident way: a plausible number on a panel, in a headset, with nothing
 *  to compare it against.
 *
 *  So the ratio takes `unitsToMetres` even though the geometry does not.
 */
export function tabletopRig(
  sizeInFileUnits: [number, number, number],
  centreInFileUnits: [number, number, number],
  longestMetres: number,
  placement: [number, number, number],
  unitsToMetres: number,
): ScanRig {
  const longest = Math.max(sizeInFileUnits[0], sizeInFileUnits[1], sizeInFileUnits[2], 1e-9)
  const k = longestMetres / longest
  return {
    k,
    placement,
    anchor: [...centreInFileUnits],
    ratio: Math.round((longest * unitsToMetres) / longestMetres),
  }
}

/** Life size, standing at `standAt`.
 *
 *  `unitsToMetres` is the only place the file's units matter — 0.3048 for a
 *  survey in feet, 1 for one in metres. Getting it wrong does not look
 *  subtly off; at 0.3048 you would be 5.6 units tall in a world that thinks
 *  it is metric.
 */
export function lifeSizeRig(
  unitsToMetres: number,
  standAt: [number, number, number],
): ScanRig {
  return { k: unitsToMetres, placement: [0, 0, 0], anchor: [...standAt], ratio: 1 }
}

/** World position of a point given in file units, under a rig.
 *
 *  `rotation` is the cloud's own Z-up→Y-up rotation, applied between the
 *  recentre and the scale — exactly where the group chain applies it.
 */
export function fileToWorld(
  point: [number, number, number],
  rig: ScanRig,
  rotation: THREE.Euler,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target
    .set(point[0] - rig.anchor[0], point[1] - rig.anchor[1], point[2] - rig.anchor[2])
    .applyEuler(rotation)
    .multiplyScalar(rig.k)
    .add(new THREE.Vector3(...rig.placement))
}

/** The inverse, for turning a teleport landing point back into file units. */
export function worldToFile(
  world: THREE.Vector3,
  rig: ScanRig,
  rotation: THREE.Euler,
): [number, number, number] {
  const inverse = new THREE.Euler(-rotation.x, -rotation.y, -rotation.z, "ZYX")
  const v = world
    .clone()
    .sub(new THREE.Vector3(...rig.placement))
    .divideScalar(rig.k)
    .applyEuler(inverse)
  return [v.x + rig.anchor[0], v.y + rig.anchor[1], v.z + rig.anchor[2]]
}
