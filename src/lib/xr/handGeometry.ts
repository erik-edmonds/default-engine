import * as THREE from "three"
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js"

/** A low-poly hand, as one geometry.
 *
 *  MERGED INTO A SINGLE BufferGeometry, not assembled from six meshes in JSX.
 *  This viewer puts `draws` on its own wrist readout and the whole route exists
 *  to measure frame cost, so shipping a decoration that quietly adds a dozen
 *  draw calls per hand would be the instrument charging itself for its own
 *  furniture. Six parts merged is one call; the same six as `<mesh>` children
 *  is six, twice over for two hands.
 *
 *  Built in GRIP SPACE, whose origin sits in the centre of the closed fist.
 *  The parts are laid out with the fingers along -Z, which is the direction a
 *  held controller points, and the back of the hand toward +Y. Those two
 *  choices are the only convention here, and `HAND_AXES` in config/xrScan.ts
 *  is where to correct them if the hand comes out rotated on real hardware --
 *  nothing below needs to change for that.
 *
 *  Deliberately a MITTEN. Separate articulated fingers would be a lie: a
 *  controller reports a grip pose and a trigger value, not finger joints, so
 *  five rigged fingers would either sit frozen in one pose or animate from
 *  data that does not exist. A closed mitten reads as "a hand holding
 *  something", which is exactly what is true.
 */

/** Metres. A hand is ~95mm across the knuckles and ~180mm heel to fingertip;
 *  this is slightly under, because a prop that reads as slightly small is
 *  far less unsettling than one that reads as slightly large. */
const PALM_W = 0.082
const PALM_L = 0.095
const PALM_T = 0.030
const FINGER_W = 0.017
const FINGER_L = 0.052
const FINGER_T = 0.019
const THUMB_L = 0.044

/** `side` only mirrors the thumb -- everything else is symmetric about X. */
export function buildHandGeometry(side: "left" | "right"): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const sign = side === "left" ? -1 : 1

  const add = (
    geo: THREE.BufferGeometry,
    position: [number, number, number],
    rotation?: [number, number, number],
  ) => {
    const m = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(rotation?.[0] ?? 0, rotation?.[1] ?? 0, rotation?.[2] ?? 0),
    )
    m.setPosition(position[0], position[1], position[2])
    geo.applyMatrix4(m)
    parts.push(geo)
  }

  // The palm. Centred on the grip origin so the hand pivots where a real one
  // would rather than swinging about its wrist.
  add(new THREE.BoxGeometry(PALM_W, PALM_T, PALM_L), [0, 0, 0])

  // Four fingers, curled forward and slightly down -- a relaxed grip, not a
  // flat salute. Spread across the palm's width with a hair of air between
  // them so the silhouette reads as fingers rather than as a slab.
  const gap = PALM_W / 4
  for (let i = 0; i < 4; i++) {
    const x = -PALM_W / 2 + gap * (i + 0.5)
    add(
      new THREE.BoxGeometry(FINGER_W, FINGER_T, FINGER_L),
      [x, -PALM_T * 0.28, -PALM_L / 2 - FINGER_L / 2 + 0.006],
      [-0.45, 0, 0],
    )
  }

  // The thumb: across the front of the fist, which is the one part that tells
  // you at a glance which hand you are looking at.
  add(
    new THREE.BoxGeometry(THUMB_L, FINGER_T, FINGER_W),
    [sign * (PALM_W / 2 - 0.004), PALM_T * 0.1, -PALM_L / 2 + 0.012],
    [0, 0, sign * 0.5],
  )

  // The cuff, so the hand ends somewhere instead of being cut off mid-forearm.
  add(new THREE.CylinderGeometry(PALM_W * 0.46, PALM_W * 0.42, 0.016, 10), [0, 0, PALM_L / 2 + 0.004], [Math.PI / 2, 0, 0])

  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error("hand geometry failed to merge")
  // Flat shading wants per-face normals, and a merged box soup has none worth
  // keeping -- recomputing gives the faceted read the island already has.
  merged.computeVertexNormals()
  merged.computeBoundingSphere()
  for (const p of parts) p.dispose()
  return merged
}
