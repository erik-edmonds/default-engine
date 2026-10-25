/** The scans the viewer can open.
 *
 *  A hard-coded table, and the seam where a database goes later: when scans
 *  are uploaded and processed, this lookup becomes a query and nothing else
 *  in the viewer moves.
 *
 *  HOSTED, NOT COMMITTED. The sample is 81MB. `.vercelignore` cannot honour
 *  `!` negation -- it says so at the top of the file -- so an asset in
 *  public/ ships on every deploy with no way to exclude it selectively; the
 *  precedent for something this size is /sources, which is excluded outright.
 *  A public URL costs nothing and exercises the real code path, which is
 *  ranged HTTP against a bucket that is not ours.
 */

export interface ScanDefinition {
  id: string
  /** Shown as the page title and in the viewer's corner. */
  label: string
  /** One line about what this is and where it came from. */
  credit: string
  /** A COPC file, served with CORS and HTTP range support. */
  url: string
  /** Roughly, for the readout before the header has been parsed. */
  approxPoints: number
  /** Metres per file unit. 1 for a survey in metres, 0.3048 for one in feet.
   *
   *  THE ONE PLACE THE FILE'S UNITS MATTER, and only at 1:1 — the tabletop
   *  scale self-normalises on the longest extent and needs no conversion.
   *  Getting it wrong does not look subtly off: at 0.3048 you would stand
   *  5.6 units tall in a world that believes it is metric.
   *
   *  Read from the file's WKT rather than guessed; see the note on autzen.
   *  Parsing it automatically is possible and fragile, and is its own job. */
  unitsToMetres: number
}

export const SCANS: Record<string, ScanDefinition> = {
  autzen: {
    id: "autzen",
    label: "Autzen Stadium",
    credit: "Aerial lidar, Eugene, Oregon · hobu, inc.",
    // VERIFIED, not assumed, because the one thing that would sink this on
    // day one is CORS. Measured against this URL:
    //
    //   OPTIONS -> 200
    //   Access-Control-Allow-Origin:  *
    //   Access-Control-Allow-Methods: GET, HEAD
    //   Access-Control-Allow-Headers: range     <- Range is NOT safelisted,
    //   Access-Control-Max-Age:       3000         so every ranged fetch is
    //                                              preflighted; without this
    //                                              line all of them fail.
    //
    // There is no Access-Control-Expose-Headers, so JS cannot read
    // Content-Range off the 206. That is harmless here: nothing in this
    // viewer reads it -- the body length is what matters.
    url: "https://hobu-lidar.s3.amazonaws.com/autzen-classified.copc.laz",
    // 10,653,336 exactly, from the file's own LAS 1.4 header. PDRF 7, so it
    // carries real RGB; 1cm scale; Oregon state plane.
    approxPoints: 10_653_336,
    // FEET. From the file's own OGC WKT VLR (user_id LASF_Projection,
    // record_id 2112): PROJCS["NAD83 / Oregon GIC Lambert (ft)"] with
    // UNIT["foot", 0.3048]. The 3426 x 4656 x 209 extent is therefore
    // 1044 x 1419 x 64 metres.
    unitsToMetres: 0.3048,
  },
}

export const DEFAULT_SCAN = "autzen"
