/** The minimap's projection.
 *
 *  One file because two separate things have to agree about where the island is
 *  on a square of pixels: the orthographic camera that renders the still, and
 *  the SVG that draws the destinations and the current position over it. If
 *  those ever disagreed the dot would drift off the island, and it would drift
 *  slowly enough to look like a physics bug rather than a units bug.
 */

/** Where the map is centred, in world x/z.
 *
 *  NOT the origin, because the island is not at the origin. Measured from the
 *  two things the map has to contain: the land (x -26.3..15.4, z -34.3..15.4)
 *  and the four destination markers, the furthest of which is left-tree at
 *  x -30.1. Their union is centred here -- the mass runs south and west, toward
 *  the bearings where the tall islands are.
 *
 *  The camera's ROUTE used to be in that union too, which is what pushed the
 *  centre out to (-6.8, -12.7) and the extent to 32. The route line is gone
 *  from the map -- the moving dot already says where you are -- so the extent
 *  only has to hold the land and the markers now. */
export const MAP_CENTER_X = -7.36
export const MAP_CENTER_Z = -9.45

/** Half the world-space width the map covers, around that centre.
 *
 *  A RADIUS, since the map turns.
 *
 *  It used to be a half-width: the island needed 22.76 either side of the
 *  centre in x, so 26 held it with margin. That was only ever true at one
 *  heading. Once the map started rotating, the frame has to hold the island's
 *  furthest CORNER at any angle, and it did not -- measured from the shipped
 *  miniature, the circumradius about MAP_CENTER is 34, with the sea reaching
 *  furthest, so the expanded map clipped the lagoon off along a hard straight
 *  edge as soon as you turned.
 *
 *  30 rather than 34: that 34 is measured from bounding-box corners, and the
 *  sea is a disc whose bbox corners are empty water -- its real reach is about
 *  28. Anything larger only shrinks the island for nothing.
 *
 *  This is the HORIZONTAL half-extent. The map does not cover a square of
 *  world: z is foreshortened by cos(tilt), so the same frustum reaches
 *  1/cos(tilt) further in z than in x. That is a property of looking at the
 *  ground from an angle, not a bug. */
export const MAP_HALF_EXTENT = 30

/** How far off straight-down the map is photographed, in radians.
 *
 *  68 degrees -- a low, near-side-on view, where the islands read as objects
 *  with undersides rather than as shapes on a plan.
 *
 *  It was 25 first, and it looked exactly like the dead-overhead version it
 *  replaced -- because the frustum was ALSO compressed by cos(tilt), which
 *  cancels the foreshortening precisely. That kept worldToMap free of the tilt,
 *  which was neat, but cancelling the foreshortening is the same thing as
 *  cancelling the tilt: the ground projected identically and only the hills
 *  leaned, by too little to notice. The compensation is gone and the factor
 *  lives in worldToMap now.
 *
 *  What a steeper angle costs is marker separation, and it is worth knowing the
 *  numbers before changing this. The four destinations are laid out on the
 *  GROUND, so the same cos(tilt) that flattens the sea flattens the distance
 *  between their dots. Measured vertical spread across the four: 59% of the
 *  frame at 45 degrees, 39% at 62, 31% at 68, 26% at 72. Their edge margin does
 *  not move (6.2%, set by x), so this is purely about telling them apart --
 *  past about 70 the three southern destinations start to collide. */
export const MAP_TILT = (68 * Math.PI) / 180

/** cos and sin of the tilt, named because four places need them and the
 *  relationship between them is the whole projection. */
export const MAP_TILT_COS = Math.cos(MAP_TILT)
export const MAP_TILT_SIN = Math.sin(MAP_TILT)

/** How far the map reaches in world z, either side of the centre.
 *
 *  Larger than the horizontal reach, by exactly the foreshortening factor: a
 *  world z offset only takes up `cos(tilt)` of the frame it would take up in x,
 *  so the same frame holds more of it. At 68 degrees that is 69.4 against 26 --
 *  which is why the island sits well inside the frame vertically while nearly
 *  filling it horizontally. */
export const MAP_HALF_EXTENT_Z = MAP_HALF_EXTENT / MAP_TILT_COS

/** The map's ground: everything the island and the sea do not cover.
 *
 *  Light gray rather than the white it started as, which was harsher than any
 *  other piece of chrome on the page. Carries a faint cool cast so it sits with
 *  the scene rather than looking like unpainted canvas. */
export const MAP_GROUND = 0xe6e9ea

/** World ground plane -> normalised map coordinates, 0..1.
 *
 *  `u` runs left to right with world +x. `v` runs TOP TO BOTTOM with world +z.
 *  Screen y grows downward, so v does too -- getting this backwards mirrors the
 *  island, which the verification checks for explicitly by asserting Home sits
 *  south of centre and the left tree west of it.
 *
 *  THE TILT IS THE `cos` ON THE v LINE, and it is the whole projection.
 *
 *  A ground point's offset in z lands in the camera's vertical axis multiplied
 *  by cos(tilt) -- that is the foreshortening, and it is what makes the picture
 *  read as a view of a place rather than a floor plan. The renderer's frustum
 *  is a plain square of `MAP_HALF_EXTENT`, with no compensation, so this factor
 *  is the only thing standing between a world z and a screen v.
 *
 *  The first version cancelled it, by compressing the camera's vertical
 *  half-height by the same cos. That kept this function tilt-free, which read
 *  as elegant, but cancelling the foreshortening cancels the visible tilt with
 *  it: the ground projected pixel-for-pixel as it had from straight overhead.
 *  If this factor ever disappears from here again, check the frustum first.
 *
 *  Height is still absent, and still on purpose. An orthographic camera
 *  displaces a point by `h * sin(tilt)`, so only things standing UP lean -- the
 *  hills and the trees, which is the point -- while the ground, and therefore
 *  every marker and the camera's own dot, stays exact.
 *
 *  `heading` swings the map round the island so the miniature is seen from the
 *  side the visitor is standing on. It is the azimuth of the map camera about
 *  MAP_CENTER, and it has to be the SAME number the camera uses or every marker
 *  drifts -- see mapHeading() for where it comes from and MiniMapCamera for the
 *  matching camera. At heading 0 both reduce to the fixed south-facing view
 *  this started as.
 *
 *  The derivation, since two places depend on it agreeing:
 *    right = ( cos h, 0, -sin h )
 *    up    = ( -cos t * sin h, sin t, -cos t * cos h )
 *  and a ground offset (dx, 0, dz) lands at
 *    camera x =  dx*cos h - dz*sin h
 *    camera y = -cos t * (dx*sin h + dz*cos h)
 *  which is what the two lines below are. */
export function worldToMap(x: number, z: number, heading = 0) {
  const dx = x - MAP_CENTER_X
  const dz = z - MAP_CENTER_Z
  const ch = Math.cos(heading)
  const sh = Math.sin(heading)
  return {
    u: (dx * ch - dz * sh + MAP_HALF_EXTENT) / (MAP_HALF_EXTENT * 2),
    v: ((dx * sh + dz * ch) * MAP_TILT_COS + MAP_HALF_EXTENT) / (MAP_HALF_EXTENT * 2),
  }
}

/** Where the map should be looking from, for a camera at `x`/`z`.
 *
 *  The azimuth of the visitor about the island's centre. Feeding this to both
 *  the map camera and worldToMap is what makes the miniature show the island
 *  from the side you are actually on -- turn the corner on the journey and the
 *  model turns with you.
 *
 *  atan2(dx, dz), not the usual atan2(dz, dx): heading 0 has to mean "from +z",
 *  which is the fixed view the map had before it could turn, and is the
 *  direction Home looks from. */
export function mapHeading(x: number, z: number) {
  return Math.atan2(x - MAP_CENTER_X, z - MAP_CENTER_Z)
}

/** Shortest signed angular distance from `a` to `b`, in radians.
 *
 *  Damping a heading without this walks the long way round whenever the
 *  journey crosses the +/-PI seam behind the island, and the map spins through
 *  a full turn to arrive somewhere a few degrees away. */
export function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a))
}

/** True when a world point is inside the region the map covers. Points outside
 *  are not drawn rather than clamped to the edge: a dot pinned to the border
 *  claims a position it does not have. The sky journey climbs 100 units and is
 *  exactly this case, which is why the widget hides up there.
 *
 *  Not a square any more -- it reaches MAP_HALF_EXTENT_Z in z against
 *  MAP_HALF_EXTENT in x, for the same reason the v line above carries a cos. */
export function insideMap(x: number, z: number) {
  return Math.abs(x - MAP_CENTER_X) <= MAP_HALF_EXTENT && Math.abs(z - MAP_CENTER_Z) <= MAP_HALF_EXTENT_Z
}

/** A percentage a browser will serialise back unchanged.
 *
 *  Same discipline as JourneyRail's: `${n}%` from a float writes
 *  "30.16430927577099%" into the server HTML, the browser normalises it to
 *  "30.1643%" on parse, and React reports a hydration mismatch. Number() after
 *  toFixed strips trailing zeros, which is the half that matters -- 71.8260
 *  becomes 71.826, exactly what the browser produces. */
export const mapPct = (n: number) => `${Number((n * 100).toFixed(3))}%`

// MAP_TEXTURE_SIZE, MAP_GROUND, MINIMAP_EXCLUDED, MINIMAP_WATER_NAME,
// MINIMAP_CAPTURE_PHASE, MAP_FOG_NEAR/FAR and MAP_SKY_CEILING all lived below
// this line. Every one of them existed to make a single captured FRAME of the
// live scene legible as a map -- which clouds to hide, how to beat the ocean's
// own fog, what colour to clear to. The map is its own small scene now, built
// from only the parts a map wants, so there is nothing to exclude and nothing
// to correct after the fact.
