/** The minimap's link between the island's canvas and the DOM.
 *
 *  Two channels, both module-level and both written from one `useFrame` in the
 *  ISLAND's canvas -- the only place that knows where the visitor is.
 *
 *  This also carried the rendered still, publish/get/subscribe for an ImageData
 *  the widget painted into a 2D canvas. The map is a live renderer now and there
 *  is no photograph to hand around.
 */

/** A point drawn over the map: the visitor's own dot, a destination marker, or
 *  a destination's 44px hit target.
 *
 *  Every one of them carries the WORLD position it stands for rather than a
 *  precomputed percentage, because the map turns now. A fixed `left`/`top`
 *  baked at module scope was correct only while the view was; the moment the
 *  miniature swings round the island, every marker has to be re-projected
 *  through the same heading the camera is using. */
export interface MinimapPoint {
  el: HTMLElement
  /** `null` means "wherever the visitor is" -- the orange dot. */
  world: { x: number; z: number } | null
}

const points = new Set<MinimapPoint>()

/** A Set, not one node: the corner widget and the open overlay can both be
 *  showing the same destination, and both have to move together. */
export function registerMinimapPoint(point: MinimapPoint) {
  points.add(point)
  return () => {
    points.delete(point)
  }
}

export function getMinimapPoints(): ReadonlySet<MinimapPoint> {
  return points
}

/** Which way the map is looking, in radians about the island's centre.
 *
 *  Written every frame by MinimapMarker (damped, so the model turns rather than
 *  snapping) and read by two very different consumers: the DOM code positioning
 *  the markers above, and the mini canvas's own camera. They must use the same
 *  number on the same frame or the island slides out from under its markers,
 *  which is the failure this file exists to make impossible.
 */
let heading = 0
type HeadingListener = (heading: number) => void
const headingListeners = new Set<HeadingListener>()

export function publishMinimapHeading(next: number) {
  heading = next
  for (const fn of headingListeners) fn(next)
}

export function getMinimapHeading() {
  return heading
}

/** A heading to hold instead of the visitor's own, while one is set.
 *
 *  Hovering a destination in the expanded map swings the island round to show
 *  it from THAT viewpoint -- a preview of where you are about to go. Written
 *  here rather than passed down because the thing that damps the heading lives
 *  in the island's canvas and the thing that knows what is hovered is a DOM
 *  list; this is the seam between them.
 *
 *  Null means "follow the visitor", which is what clears on mouse-out. */
let focus: number | null = null

export function setMinimapHeadingFocus(next: number | null) {
  focus = next
}

export function getMinimapHeadingFocus() {
  return focus
}

/** The mini canvas renders on demand, so it has to be told when to draw. */
export function subscribeMinimapHeading(fn: HeadingListener) {
  headingListeners.add(fn)
  return () => {
    headingListeners.delete(fn)
  }
}
