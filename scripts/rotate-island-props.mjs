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

// ---------------------------------------------------------------------------
// EVERYTHING BELOW WAS MISSING, and that is why the 90->100 turn took two
// goes. The script above covered positions.ts, torches.ts and a prose note
// about journey.ts; six more groups of hand-measured world points were left
// for the human to notice, and Charizard was the one that got away -- it spent
// three rounds 3.71 units out over open water (see Scene.tsx).
//
// If a value is a world point on or above the island, it belongs here.
// ---------------------------------------------------------------------------

console.log('\n--- config/journey.ts : WAYPOINTS ---')
console.log('    bearings take the delta; `look` targets are world points.\n')
for (const b of [50, 105, 138, 150, 182, 222, 226]) bearing(`  bearing`, b)
console.log()
pos('look @50', [0.35, -1, 1.97])
pos('look @105', [-0.35, 0, -1.97])
pos('look @138', [5.1, 4, -17.15])
pos('look @150', [6.72, 4, -19.46])
pos('look @182', [-1.16, 3, -18.07])
pos('look @222', [-13.32, 4, -17.96])
pos('look @226', [-17.61, 9, -19.23])

console.log('\n--- components/canvas/Scene.tsx : the props standing on the island ---\n')
pos('Hologram', [1.75, -2.75, 8])
pos('palm-near', [-3.231, -1.481, -0.762])
pos('palm-left', [-0.922, -1.402, -2.939])
pos('palm-right', [-0.122, -1.434, -1.858])
pos('Guitar', [0.1, -0.7, 1])
pos('Gull', [1, -2.76, 5.8])
pos('Charizard', [7.67, 3.63, -19.83])
console.log('    Charizard, the palms and the Gull also carry a rotation; a Y-only')
console.log('    turn means ADDING the delta to their rotation[1]. In radians that')
console.log(`    is ${D}.`)

console.log('\n--- components/models/Waterfall.tsx ---\n')
pos('splash group', [-3, -4, -12])

console.log('\n--- config/optics.ts : OPTICS_WAKE_POINTS ---')
console.log('    [0] MUST stay equal to the rotated Hologram position + [0, 1.4, 0],')
console.log("    or BeaconCompanion's offset stops being zero and silently")
console.log('    translates the whole tour.\n')
for (const p of [
  [1.75, -1.35, 8.0], [2.6, 0.8, 5.5], [0.0, 1.6, 2.0], [-2.3, -0.5, 4.0],
  [-6.0, 0.6, -1.0], [-7.5, 0.4, -4.8], [-3.0, 2.2, -5.5], [3.0, 1.8, -3.0],
  [7.2, 0.0, -0.8], [2.5, 0.4, 3.5], [-1.0, -0.4, 8.0], [-3.2, -0.9, 9.9],
]) pos('  ', p)

console.log('\n--- config/optics.ts : the survey pose ---\n')
pos('OPTICS_CAMERA_POSITION', [-5, 12, 32])
pos('OPTICS_CAMERA_LOOK', [-5, 0, -6])

console.log('\n--- config/minimap.ts : MAP_CENTER ---\n')
pos('MAP_CENTER_X/Z (y is ignored)', [-7.36, 0, -9.45])

console.log('\n--- components/canvas/MiniIsland.tsx ---')
console.log('    ISLAND_ROTATION was a hardcoded Math.PI/2 and went stale the last')
console.log('    time. It imports ISLAND_ROTATION_Y now, so there is nothing to do.')
