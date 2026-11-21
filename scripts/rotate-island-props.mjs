/** Rotate everything that stands on the island when the island itself turns.
 *
 *   node scripts/rotate-island-props.mjs <oldDegrees> <newDegrees>
 *   node scripts/rotate-island-props.mjs 90 100
 *
 *  WHY THIS EXISTS. The terrain is one <Merged> inside
 *  <group name="island-terrain"> (components/canvas/Scene.tsx). The hotspot
 *  rings, the destination viewpoints, the portals derived from them, the
 *  torches and the sky journey's whole flight path are world-space SIBLINGS of
 *  that group -- hand-measured against the island as it stood, and they do not
 *  follow when it turns. Turning the island from 90 to 100 degrees left every
 *  one of them behind by 10 degrees, and the portals and torches ended up
 *  hanging off their islands in open air.
 *
 *  WHY IT IS A ROTATION AND NOT A RE-SURVEY. The island is rigid, so each
 *  attached point just needs the DIFFERENCE applied about the world Y axis.
 *  The island's `position={[0,-5.5,0]}` is a Y offset only and a Y rotation is
 *  unaffected by a Y translation, so the pivot is the world Y axis and every
 *  measured HEIGHT is preserved exactly -- each ring stays on the rock it was
 *  measured on, at the height it was measured at.
 *
 *  THE ONE TRAP. A recorded camera orientation is a full XYZ Euler, and
 *  rotating it is NOT "add the delta to the Y component" -- that is only true
 *  for a Y-only rotation. These go through quaternion composition
 *  (q_delta * q_old) and come back out as an Euler. */
import * as THREE from 'three'

const [, , oldDeg, newDeg] = process.argv
if (oldDeg === undefined || newDeg === undefined) {
  console.error('usage: node scripts/rotate-island-props.mjs <oldDegrees> <newDegrees>')
  console.error('example: node scripts/rotate-island-props.mjs 90 100')
  process.exit(1)
}

const D = THREE.MathUtils.degToRad(Number(newDeg) - Number(oldDeg))
const Y = new THREE.Vector3(0, 1, 0)
const qD = new THREE.Quaternion().setFromAxisAngle(Y, D)

console.log(`island ${oldDeg} deg -> ${newDeg} deg   delta ${(Number(newDeg) - Number(oldDeg))} deg = ${D} rad\n`)

const r2 = (n) => Number(n.toFixed(2))

function pos(label, p, full = false) {
  const v = new THREE.Vector3(...p).applyAxisAngle(Y, D)
  const out = full ? v.toArray() : v.toArray().map(r2)
  console.log(`${label}\n  [${p.join(', ')}]\n  -> [${out.join(', ')}]   moved ${new THREE.Vector3(...p).distanceTo(v).toFixed(2)}u`)
}

function euler(label, e) {
  const q = qD.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...e)))
  const n = new THREE.Euler().setFromQuaternion(q)
  console.log(`${label}\n  (${e.join(', ')})\n  -> (${n.x}, ${n.y}, ${n.z})`)
}

function bearing(label, deg) {
  const n = ((deg + THREE.MathUtils.radToDeg(D)) % 360 + 360) % 360
  console.log(`${label}: ${deg} -> ${Math.round(n)}`)
}

export { pos, euler, bearing, D, qD, Y }

// ---------------------------------------------------------------------------
// Paste the CURRENT values below and run. Each heading says where the result
// goes. Update this block whenever the shape of the data changes.
// ---------------------------------------------------------------------------

console.log('--- config/positions.ts : hotspot rings (rounded) ---\n')
pos('HOME_HOTSPOT_POSITION', [-3.59, -1.8, 3.5])
pos('LEFT_TREE_HOTSPOT_POSITION', [-16.71, 3.47, -10.19])
pos('MOON_ISLAND_HOTSPOT_POSITION', [7.41, 5.57, -21.33])
pos('UPPER_ISLAND_HOTSPOT_POSITION', [-11.24, 12.97, -11.3])

console.log('\n--- config/positions.ts : destination viewpoints (full precision) ---')
console.log('    The portals follow these automatically via portalTransformFor.\n')
pos('LEFT_TREE_VIEWPOINT_POSITION', [-32.7641641288276, 3.1939029441428497, -12.344836413979273], true)
euler('LEFT_TREE_VIEWPOINT_ROTATION', [2.842485524524102, -1.381167490290896, 2.8475409479402063])
pos('MOON_ISLAND_VIEWPOINT_POSITION', [10.753882390370874, 6.795693566831701, -25.959456018690705], true)
euler('MOON_ISLAND_VIEWPOINT_ROTATION', [-2.9397248864109176, 0.45495698796346024, 3.0519035400785604])
pos('UPPER_ISLAND_VIEWPOINT_POSITION', [-16.89723485805785, 15.973606020841718, -25.92586314538039], true)
euler('UPPER_ISLAND_VIEWPOINT_ROTATION', [-2.796415022766344, -0.7073409748468277, -2.912054737215411])

console.log('\n--- config/torches.ts : TORCH_SITES (rotationY takes the delta added) ---\n')
pos('left-tree', [-20.39, 1.51, -6.8])
pos('moon-island', [6.07, 5.42, -20.88])
pos('upper', [-10.57, 11.26, -10.55])

console.log('\n--- config/journey.ts : every WAYPOINTS/ROUTE_ARC bearing takes the delta ---')
console.log('    ...and every `look` target is a world point, so rotate it with pos().')
console.log('\n--- config/terrain.ts : REACH and TOP are 72 bins of 5 degrees ---')
console.log('    A multiple of 5 degrees is an exact roll of delta/5 places.')
console.log(`    This delta = ${THREE.MathUtils.radToDeg(D)} deg = ${THREE.MathUtils.radToDeg(D) / 5} bins.`)
