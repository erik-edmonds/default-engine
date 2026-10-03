/** THE THINGS WORTH FINDING. THIS FILE IS YOURS TO EDIT.
 *
 *  Add one by adding a line. The menu's counter, the achievements panel and
 *  the unlock toast all read from here, so nothing else has to be touched --
 *  the same arrangement as config/places.ts.
 *
 *  `how` is shown in the panel for anything still locked. It is deliberately
 *  a nudge rather than an instruction: a list that reads "click the cloud"
 *  turns exploring into errands, and the island is worth poking at.
 */

export type AchievementId =
  | "rain"
  | "music"
  | "ascent"
  | "voyager"
  | "wanderer"
  | "driver"

export interface Achievement {
  id: AchievementId
  /** Shown in the toast and the panel. */
  title: string
  /** One line, past tense -- what you did. */
  detail: string
  /** A nudge shown while it is still locked. */
  how: string
  /** How many of a thing it takes.
   *
   *  Most are 1 -- you either clicked the cloud or you did not -- and show
   *  as a plain tick. Anything above 1 gets a count and a bar, so "visit
   *  all three portals" reads 2/3 while you are partway rather than looking
   *  identical to untouched. */
  target: number
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "rain",
    title: "Weather Maker",
    detail: "You poked a cloud and it rained on the whole island.",
    how: "The clouds are not just scenery.",
    target: 1,
  },
  {
    id: "music",
    title: "Strike a Chord",
    detail: "You found the guitar on the beach and started the music.",
    how: "Something on the sand plays.",
    target: 1,
  },
  {
    id: "ascent",
    title: "The Great Ascent",
    detail: "You opened the Poke Ball and left the island behind.",
    how: "There is a way up from the beach.",
    target: 1,
  },
  {
    id: "voyager",
    title: "Voyager",
    detail: "You read the whole sky journey, all the way to the end.",
    how: "Keep going once you are up there.",
    target: 1,
  },
  {
    id: "wanderer",
    title: "Wanderer",
    detail: "You stepped through all three portals.",
    how: "Three windows stand around the island.",
    // The one that genuinely counts: page.tsx already tallies which
    // portals have been entered, so this shows real progress.
    target: 3,
  },
  {
    id: "driver",
    title: "Hit the Track",
    detail: "You drove a lap of the mini-game.",
    how: "One of the portals is a game.",
    target: 1,
  },
]

export const achievementById = (id: AchievementId) =>
  ACHIEVEMENTS.find((a) => a.id === id) ?? null
