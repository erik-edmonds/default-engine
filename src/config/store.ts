/** Cloud placement.
 *
 *  These used to be two 1000-entry arrays built at module load, which meant a
 *  cloud's position was fixed before anything knew where the islands were. The
 *  low group shares a volume with the floating-island cluster, so whether a
 *  given page load put a cloud through a tree was luck -- which is why the
 *  problem came and went. Scene.tsx now vets the low group against the island's
 *  real bounds; the generator lives here so it can be re-rolled.
 */

export interface CloudDatum {
  /** Phase offset for the bob in Sky.tsx, so they don't rise and fall in step. */
  random: number
  /** LOCAL to the group that renders it -- see Scene.tsx for the offsets. */
  position: [number, number, number]
  rotation: [number, number, number]
}

/** The low group: same distribution as before, in the group's local space. */
export const randomVector = (r = 10): [number, number, number] => [
  r / 2 - Math.random() * 5 * r,
  r / 2 - Math.random() * r,
  r / 2 - Math.random() * r,
]

/** The high group, 100 units up. Nothing up there to collide with. */
const staticVector = (r = 10): [number, number, number] => [
  r / 2 - Math.random() * 5 * r + 10,
  100 + 6 * Math.random(),
  r / 2 - Math.random() * (5 * r) - 5,
]

export const makeCloud = (position: [number, number, number]): CloudDatum => ({
  random: Math.random(),
  position,
  rotation: [0, 0, 0],
})

/** Only as many as actually draw. The old arrays were 1000 long and `range`
 *  only capped the DRAW count -- every entry still mounted a component with its
 *  own useFrame. */
export const surface: CloudDatum[] = Array.from({ length: 15 }, () => makeCloud(staticVector()))
