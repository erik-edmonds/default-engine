/** The dive's hand-off between the island and /portfolio.
 *
 *  Shared by both ends, so the flag one sets is literally the flag the other
 *  reads. sessionStorage rather than a query parameter deliberately: the URL
 *  stays clean, /portfolio stays statically prerendered, and a shared or
 *  bookmarked /portfolio link does not replay an arrival animation for someone
 *  who never dived.
 */

/** Set by the island as it submerges, consumed once by /portfolio. */
export const DIVE_ARRIVAL_KEY = "avatar:arrived-by-dive"

/** How long the wash holds the frame before the route changes. Long enough to
 *  cover the mount of a whole new scene, short enough not to read as a stall. */
export const DIVE_WASH_MS = 900
