/** THE PLACES ON THE GLOBE. THIS FILE IS YOURS TO EDIT.
 *
 *  Add a country by adding one line. The pin, its label, its position on the
 *  globe and the link that appears when you hover it all come from the entry
 *  -- nothing else has to be touched.
 *
 *      Thailand: { link: "https://...", lat: 15.12, lon: 101.0 },
 *
 *  `link` is the only field you should ever need to fill in by hand; the
 *  coordinates are just where the pin lands. A country's lat/lon is its
 *  rough centre -- look it up, or copy a neighbour's and nudge it. Latitude
 *  is north-positive, longitude east-positive, both in degrees.
 *
 *  An empty link is fine and is the honest default: the pin still appears
 *  and still says where you were, it simply offers nothing to click. That is
 *  better than a pin wired to a page that does not exist yet.
 */

/** Rotation from the model's own zero meridian to real longitude, in degrees.
 *
 *  MEASURED AGAINST THE MESH, NOT GUESSED, AND THE GUESS WAS 0.
 *
 *  earth.glb carries no texture at all -- the continents are geometry, split
 *  across four materials (Water, Grass, Ice, Sand) over about eleven thousand
 *  triangles -- so the land itself is the only thing that can say which way
 *  the globe is wound. Every candidate rotation was scored by taking the
 *  Grass and Sand vertices as "land" and asking whether eighteen real places
 *  land on it and ten open-ocean points do not:
 *
 *      offset    0   8/13   a sea point 1.6 deg from land
 *      offset  178  13/13   worst land 2.3 deg, nearest sea 12.5
 *
 *  Sharp enough to be certain -- the median score across all rotations was
 *  16/28 on the wider sweep, against 27/28 here. It also settles a question
 *  worth recording: this model IS a geographic Earth, so a pin on it means
 *  something. Greenland is the one real miss, at 13 degrees; a low-poly coast
 *  simplifies small land, which is also why Vietnam resolves to 2.3 rather
 *  than 0. */
export const GLOBE_LON_OFFSET = 178

export interface Place {
  /** Where hovering the pin takes you. "" until you have something to point
   *  at -- see the note above. */
  link: string
  /** Degrees north. */
  lat: number
  /** Degrees east. */
  lon: number
}

/** Country -> where it is and what it links to.
 *
 *  Order does not matter. The two names below decide which pins are drawn in
 *  which colour; everything else here is drawn as a place you have been. */
export const PLACES: Record<string, Place> = {
  Vietnam: { link: "https://maps.app.goo.gl/5tRN5iQaEzpynV9FA", lat: 14.06, lon: 108.28 },
  Thailand: { link: "https://maps.app.goo.gl/kjGdXVFgSgnmiw2E8", lat: 15.12, lon: 101.0 },
}

/** Where Erik is now. Drawn red. Must be a key of PLACES. */
export const CURRENT_PLACE = "Vietnam"

/** Where he is going next. Drawn orange. Must be a key of PLACES, or null
 *  when there is no next destination to announce. */
export const NEXT_PLACE: string | null = "Thailand"

/** What each kind of pin looks like.
 *
 *  Three states rather than two, because a gallery of places you have been
 *  should not shout as loudly as the one you are standing in. */
export type PlaceKind = "current" | "next" | "visited"

export const PIN_COLOUR: Record<PlaceKind, string> = {
  current: "#e0383a",
  next: "#f08a24",
  visited: "#9aa7b4",
}

export function placeKind(country: string): PlaceKind {
  if (country === CURRENT_PLACE) return "current"
  if (country === NEXT_PLACE) return "next"
  return "visited"
}

/** The pins, in a stable order: the current one last so it is the one drawn
 *  on top where two labels overlap. */
export const PLACE_LIST: { country: string; place: Place; kind: PlaceKind }[] =
  Object.entries(PLACES)
    .map(([country, place]) => ({ country, place, kind: placeKind(country) }))
    .sort((a, b) => {
      const rank = { visited: 0, next: 1, current: 2 } as const
      return rank[a.kind] - rank[b.kind]
    })
