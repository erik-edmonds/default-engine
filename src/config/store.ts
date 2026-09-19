import { clearOfTerrain } from "@/config/terrain"

/** Cloud placement.
 *
 *  Three separate faults lived here, and the visible symptom -- "clumped on
 *  desktop, completely invisible on mobile" -- was two of them at once.
 *
 *  1. The low group was drawn from a 50 x 10 x 10 box. That maps to 77 degrees
 *     of azimuth but only 26 of elevation at a single depth, so from any given
 *     viewpoint the clouds that WERE on screen arrived as one line across the
 *     top of the frame. Whether any were on screen at all was luck.
 *  2. The high group sat at y 100-106, which is 52-90 degrees above the view
 *     axis against a 25 degree vertical half-fov. It was 0% on screen from
 *     every viewpoint on both devices -- fifteen of the twenty clouds were
 *     being simulated and drawn where nobody could ever see them, and at 85-124
 *     units out they were 88-100% fog-coloured into the bargain.
 *  3. Mobile lost the rest to frustum culling, which is not a placement problem
 *     at all -- see the note on frustumCulled in Sky.tsx.
 *
 *  What replaces the two boxes is one stratified ring sampler, used by both
 *  layers. The ring is divided into equal bearing buckets and every bucket gets
 *  its own cloud, jittered inside it. That is what turns "probably visible"
 *  into a guarantee: a frame spans a known arc of bearing, so buckets narrower
 *  than that arc cannot all fall outside it. Uniform random sampling has no
 *  such property, which is precisely why the old sky came and went.
 *
 *  Positions are WORLD space now, not local to an offset group. The old scheme
 *  meant every collision test had to convert, and the conversion is where the
 *  clearance bug lived.
 */

export interface CloudDatum {
  /** Phase offset for the bob in Sky.tsx, so they don't rise and fall in step. */
  random: number
  /** World space. */
  position: [number, number, number]
  rotation: [number, number, number]
}

/** One ring of clouds around the island cluster.
 *
 *  `count` is also the number of bearing buckets, so it sets the guarantee
 *  directly: the widest gap in bearing is 360/count degrees. */
export interface CloudRing {
  count: number
  /** Distance from the world origin. The island's terrain reaches 34 units at
   *  its widest bearing and the journey camera flies at radius 18-34, so a ring
   *  has to start outside both or the camera flies through its own sky. */
  radius: [number, number]
  /** World height. */
  height: [number, number]
}

/** How far a cloud's body reaches from its own centre.
 *
 *  The GLB's half-extents are (2.689, 1.164, 1.910), grown by the 1.4x hover
 *  scale. Horizontally this is a single radius rather than per-axis, because
 *  clouds now carry a random yaw and a rotated box's footprint is the diagonal
 *  -- the old per-axis vector was only correct for an unrotated cloud, and had
 *  its z inflated ~2.66x besides. The vertical term carries the +/-0.5 bob that
 *  Sky.tsx applies every frame: a cloud that merely touches when idle would
 *  still punch through when it rises. */
export const CLOUD_REACH_XZ = Math.hypot(2.689, 1.910) * 1.4
export const CLOUD_REACH_Y = 1.164 * 1.4 + 0.5

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** The island, from the measured table rather than the live scene graph.
 *
 *  This is what lets placement happen on the first render instead of waiting
 *  several frames for the island to mount and settle -- see config/terrain.ts
 *  for why that wait was both expensive and wrong. */
const defaultClear = (p: [number, number, number]) => clearOfTerrain(p, CLOUD_REACH_XZ, CLOUD_REACH_Y)

/**
 * Place one ring's worth of clouds, stratified by bearing.
 *
 * `isClear` vetoes a position (the island is opaque and depth-writing, so a
 * cloud inside one hard-intersects it). A rejected draw is re-rolled WITHIN ITS
 * OWN BUCKET so the bearing coverage -- the whole point of stratifying -- is
 * never traded away to dodge a tree. Only if a bucket cannot be satisfied at
 * all does the cloud take its best attempt, which keeps `count` exact: a sky
 * that quietly ships fewer clouds than it claims is how this became hard to
 * diagnose the first time.
 */
export function ringClouds(
  { count, radius, height }: CloudRing,
  isClear: (position: [number, number, number]) => boolean = defaultClear,
): CloudDatum[] {
  const out: CloudDatum[] = []
  const bucket = (Math.PI * 2) / count
  for (let i = 0; i < count; i++) {
    let position: [number, number, number] | null = null
    let fallback: [number, number, number] | null = null
    let lastBearing = bucket * (i + 0.5)
    for (let attempt = 0; attempt < 32; attempt++) {
      // Jittered inside this bucket, never outside it.
      const bearing = bucket * (i + Math.random())
      const r = lerp(radius[0], radius[1], Math.random())
      const y = lerp(height[0], height[1], Math.random())
      const candidate: [number, number, number] = [Math.sin(bearing) * r, y, Math.cos(bearing) * r]
      fallback ??= candidate
      lastBearing = bearing
      if (isClear(candidate)) {
        position = candidate
        break
      }
    }

    // Nothing in this bucket's own band was clear, which happens where the
    // island fills the whole wedge -- bearings 165-220 reach radius 34 and stand
    // 17.8 units tall, and both rings start well inside that.
    //
    // Give up the BAND rather than the bearing: step outward, then upward, until
    // the cloud is in open air. The bearing is the coverage guarantee and the
    // count is what makes the sky the density it claims, so those are the two
    // things worth keeping; an exact radius is not. This used to accept the
    // first blocked draw instead, which is how clouds carried on appearing
    // inside the tall island even with a clearance test in place -- the test ran,
    // failed, and was then ignored.
    if (!position) {
      const sin = Math.sin(lastBearing)
      const cos = Math.cos(lastBearing)
      // Stops at the FIRST radius that clears, deliberately. Adding a couple of
      // units of cosmetic margin here was tried and reverted: these fallback
      // clouds sit at the bearings where the tall island blocks everything else,
      // so they are the only thing in frame there, and pushing them further out
      // put them past night's 70-unit fog. Measured, the margin took the
      // portrait floor from 2 clouds to 0 -- it bought a tidier silhouette and
      // sold the guarantee the whole ring exists for.
      search: for (let lift = 0; lift <= 4; lift++) {
        for (let r = radius[1]; r <= radius[1] + 44; r += 2) {
          const candidate: [number, number, number] = [sin * r, height[1] + lift * 3, cos * r]
          if (isClear(candidate)) {
            position = candidate
            break search
          }
        }
      }
    }

    out.push({
      random: Math.random(),
      position: position ?? fallback!,
      // A random yaw, so a ring of the same mesh does not read as a ring of the
      // same mesh. Yaw only: a cloud rolled onto its side stops being a cloud.
      rotation: [0, Math.random() * Math.PI * 2, 0],
    })
  }
  return out
}

/** The sky: two rings of cloud around the island, tuned against measurement
 *  rather than by eye.
 *
 *  Every number here was chosen by walking the journey's own camera poses,
 *  building the real projection at each, and counting what actually lands
 *  inside the frustum AND survives the fog -- at both a 1280x800 and a 400x860
 *  viewport. The shipped sky scored a median of 0 clouds on a phone and had
 *  viewpoints with none at all on desktop; its high group scored 0 sightings
 *  across every pose and every aspect, even under the most generous (daytime)
 *  fog. See the notes at the top of this file for why.
 *
 *  Three constraints fix these bands, and they pull against each other:
 *
 *    - The camera looks DOWN, between 5 and 32 degrees, never level. Clouds
 *      parked above it are out of frame, which is the whole story of the old
 *      y=100 group.
 *    - Night fog ends at 70 units, so a cloud further than about 65 from the
 *      camera is the fog's colour whether it is in frame or not. The camera
 *      flies at radius 15-43 and looks inward across the island, so a ring much
 *      wider than this is invisible for the same reason the old one was.
 *    - The terrain reaches radius 34 at its widest bearing and tops out at
 *      y 17.8, so a ring inside that has to be vetted, not just placed.
 *
 *  The two rings overlap in radius and separate in HEIGHT: the low one threads
 *  between and below the island tops, the high one sits above them. That is
 *  what gives the sky depth without putting anything where it cannot be seen.
 *
 *  The inner radii are deliberately tight -- 16 and 20, well inside the
 *  terrain's own reach, with the clearance test relied upon to push individual
 *  clouds out. A wider ring measured better on paper and had a hole in it: at
 *  u ~ 0.55 the camera is 40 units out looking back across the island, so
 *  everything on a wide ring is 60-80 units away and the night fog takes all of
 *  it. Portrait showed ZERO clouds there. Clouds threaded between the islands
 *  are what fill that pose, which is why the sampler has a clearance test at
 *  all rather than a radius that simply avoids the problem.
 *
 *  Measured result (40 placements x 121 journey poses + the authored home
 *  viewpoint, NIGHT fog -- the harshest preset -- counting a cloud only if it
 *  is in the frustum AND under 90% fogged):
 *
 *      400x860    min 2   p05  5   median  8
 *      1280x800   min 7   p05 11   median 22
 *
 *  Every aspect (including landscape phone) and every fog preset clears a
 *  floor of at least one cloud at every pose, which is the actual requirement:
 *  the sky is never empty, whichever way you are looking.
 *
 *  Desktop sees about three times as many because its horizontal field is
 *  about three times wider (73 degrees against 25) -- the same sky, more of it
 *  on screen at once. */
export const CLOUD_RING_LOW: CloudRing = { count: 24, radius: [16, 34], height: [4, 16] }
export const CLOUD_RING_HIGH: CloudRing = { count: 18, radius: [20, 36], height: [14, 26] }
