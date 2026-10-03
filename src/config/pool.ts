/** The dimensions of the pool behind the Models portal.
 *
 *  LIFTED OUT OF PortalInteriors.tsx SO THE FISH CAN READ THEM TOO.
 *
 *  FishSchool needs to know how deep the water runs, and PortalInteriors
 *  already imports FishSchool -- so importing the constants back the other way
 *  would be a cycle. They belong in a config module rather than in either
 *  component, which is also what stopped the two drifting apart: the school
 *  was authored against a 3.5-unit band while the pool was 13-odd deep, so
 *  every fish sat in the top quarter and scrolling down found empty water.
 */

import { CARD_GAP, CARD_TOP, PROJECTS } from "@/config/projects"

/** How deep the pool runs below the surface: far enough to hold the whole card
 *  column with clearance under the last one. */
export const POOL_DEPTH = -CARD_TOP + (PROJECTS.length - 1) * CARD_GAP + 2.6

/** Half-extents of the pool box.
 *
 *  Both are larger than they look like they need to be, and the reason is the
 *  same for each: the camera sits INSIDE this box and cannot move, so the box
 *  has to reach past whatever the camera can see.
 *
 *  Length has a hard floor. The camera parks 0.3 in front of the portal plane
 *  and the group sits at z -3, so the pool's near wall must land behind z +0.3
 *  or the camera is outside the box looking at its tiled exterior -- which is
 *  exactly what the first attempt at "move it further back" produced: a dark
 *  frame with a sliver of pool wall in one corner. 4.5 puts the near wall at
 *  +1.5, comfortably behind the camera, and the far wall at -7.5.
 *
 *  Width is set by the far wall. At 50 degrees of FOV the camera sees 11.6
 *  units across at that distance, so anything narrower than that shows the
 *  world past the pool's sides. */
export const POOL_HALF_WIDTH = 6
export const POOL_HALF_LENGTH = 4.5

/** How far the column can travel before the floor is in shot. */
export const SCROLL_RANGE = POOL_DEPTH - 3
