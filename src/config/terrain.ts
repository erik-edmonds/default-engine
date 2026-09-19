/** What the island occupies, measured, by bearing.
 *
 *  Cloud placement has to avoid the islands -- they are opaque and
 *  depth-writing, so a cloud inside one hard-intersects it -- and until now that
 *  test read the live scene graph. That turned out to be the wrong source
 *  twice over:
 *
 *    - The models sit behind <Suspense> and the scene animates in, so a mount
 *      effect measured an island that was half-arrived and still moving. It
 *      found almost nothing to avoid and cleared every cloud.
 *    - Waiting for it to settle meant recomputing a 146-mesh world bounding box
 *      EVERY FRAME until it did, and it left the cloud data empty for those
 *      frames -- which broke drei's <Instances> in two separate ways (see the
 *      note on `limit` in Sky.tsx).
 *
 *  So the geometry is measured once, here, and the runtime just reads it. The
 *  clouds can then be placed on the very first render, which is what the
 *  instancer wants, and the per-frame cost is zero.
 *
 *  Measured off the shipped scene: every mesh that overlaps the band a cloud can
 *  occupy (y 1..30), binned into 72 arcs of 5 degrees. Excluded, because a cloud
 *  cannot collide with them: the ocean and sky planes, the water surface (clouds
 *  are above it), and the sun and moon discs (scenery on the far sphere, which
 *  otherwise reported a reach of 108 units).
 *
 *  It agrees with the independent reach-by-bearing table in config/journey.ts,
 *  which was derived from 48.9k transformed vertices: the tall island around
 *  bearing 155-235 standing to y 17.8, the moon island near 135-155, the left
 *  tree near 240-260, open water everywhere else. The radii here read larger
 *  because this measures each mesh's furthest bounding-box corner rather than
 *  its furthest vertex, which is the conservative direction for a keep-out test.
 *
 *  To re-measure after moving anything: scratchpad/terrainprobe.mjs.
 */

/** Furthest the island reaches from the world origin, per 5-degree bearing. */
const REACH = [
  9.6, 9.6, 9.6, 9.6, 8.9, 0, 0, 4.2, 4.2, 4.2, 4.2, 4.2,
  4.2, 4.2, 0, 0, 0, 0, 0, 5.7, 11.5, 11.5, 11.5, 11.5,
  11.1, 0, 0, 27.5, 27.5, 27.5, 27.5, 39, 39, 39, 39, 39,
  39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39, 39,
  30.9, 30.9, 30.9, 30.9, 0, 0, 0, 8.8, 9, 9, 9, 9,
  8.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9.2,
]

/** Highest it stands, per the same bearing. -10 means nothing is there at all. */
const TOP = [
  10, 10, 10, 10, 9.9, -10, -10, 1.6, 1.6, 1.6, 1.6, 1.6,
  1.6, 1.6, -10, -10, -10, -10, -10, 4.8, 12.8, 12.8, 12.8, 12.8,
  12.5, -10, -10, 4.4, 4.4, 7.3, 6.9, 17.8, 17.8, 17.8, 17.8, 17.8,
  17.8, 17.8, 17.8, 17.8, 17.8, 17.8, 17.8, 17.8, 17.8, 17.8, 17.8, 17.8,
  8.2, 8.5, 1.5, 1.5, -10, -10, -10, 7.7, 8.3, 8.3, 8.3, 8.3,
  7.5, -10, -10, -10, -10, -10, -10, -10, -10, -10, -10, 8.7,
]

const BIN_DEGREES = 360 / REACH.length

/** Is this point clear of the island, allowing for a body of the given size?
 *
 *  Conservative in both directions: REACH is the furthest bounding-box corner,
 *  so anything beyond it is outside every box in that arc; and a point above the
 *  arc's high point is clear whatever its radius. Neighbouring bins are checked
 *  too, because a cloud has width and can straddle a boundary into a taller arc.
 */
export function clearOfTerrain(
  [x, y, z]: [number, number, number],
  reachXZ: number,
  reachY: number,
): boolean {
  const radius = Math.hypot(x, z)
  const bearing = (Math.atan2(x, z) * (180 / Math.PI) + 360) % 360
  const centre = Math.floor(bearing / BIN_DEGREES)
  // How many bins to either side this body can spill into at this radius.
  const spill = radius > 0.001 ? Math.ceil(Math.atan2(reachXZ, radius) / (BIN_DEGREES * (Math.PI / 180))) : REACH.length
  for (let d = -spill; d <= spill; d++) {
    const bin = (centre + d + REACH.length * 8) % REACH.length
    if (radius > REACH[bin] + reachXZ) continue   // clear of this arc entirely
    if (y > TOP[bin] + reachY) continue           // over the top of it
    return false
  }
  return true
}
