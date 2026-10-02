/** What the avatar has to say, in the order he says it.
 *
 *  This replaced the black-glass captions that used to hang over whatever was
 *  clickable. Those worked, but they were anonymous chrome -- a box appears
 *  next to a prop and tells you to click it, and the one character standing on
 *  the island has nothing to do with it. Coming FROM him, the same information
 *  has an author, and each line can carry something about the person whose
 *  portfolio this is instead of only naming a gesture.
 *
 *  Copy belongs here rather than in helpers/avatarBubble.ts for the reason
 *  config/portals.ts states in its own header: one table, so a thing cannot
 *  drift out of step with itself. The helper owns the queue; this owns what is
 *  in it.
 *
 *  THE CEILING IS ABOUT 34 WORDS. The panel is capped at 17rem
 *  (`.avatar-bubble-panel`, globals.css) and the type is 14px/1.45, so much
 *  past that and the bubble becomes a paragraph hanging off someone's head.
 *  More suggestions, not longer ones -- the queue is the format.
 */

import type { PortalHotspotId } from "@/config/portals"

/** The thing a suggestion is about.
 *
 *  Named subjects rather than free strings so the director can retire a
 *  suggestion the visitor has already acted on without this table and that one
 *  agreeing by coincidence. Finding the guitar on your own should stop him
 *  recommending the guitar.
 */
export type SuggestionSubject =
  | "guitar"
  | "clouds"
  | "pokeball"
  | "models"
  | "about"
  | "contact"

export interface Suggestion {
  id: string
  /** What he says. */
  text: string
  /** Where the camera goes if the visitor takes him up on it. One of the
   *  island's existing waypoints -- this does not invent a destination, it
   *  reuses the hotspot the portal already stands in front of. */
  goTo?: PortalHotspotId
  /** The label on that offer. Says what happens, in his voice. */
  action?: string
  /** Drops out of the queue unasked once the visitor finds this themselves. */
  satisfiedBy?: SuggestionSubject
}

export const SUGGESTIONS: Suggestion[] = [
  {
    id: "hello",
    text: "Hey — I'm Erik. I'm a data scientist, and I built this. I'm taking freelance and contract work at the moment. Want the tour?",
  },
  {
    id: "work",
    text: "My work is through the portal across the water: gaussian splatting, autonomous driving in CARLA, object detection, and an election map in D3.",
    goTo: "left-tree",
    action: "Show me",
    satisfiedBy: "models",
  },
  {
    id: "gaussian",
    text: "Splatting is the one I'd lead with. Photographs go in; a scene you can fly a camera through comes out, rendering in real time.",
  },
  {
    id: "pokeball",
    // "under it" until the ball moved out from behind the sign's board -- see
    // the note on <Pokeball> in Scene.tsx. It sits by my feet now.
    text: "See the About Me sign? Click the Poké Ball by my feet and I'll take you up above the clouds. There's more about me up there.",
    satisfiedBy: "pokeball",
  },
  {
    id: "about",
    text: "The point-cloud portal has the longer version of me — background, what I work on, and how I got to doing this.",
    goTo: "moon-island",
    action: "Take me there",
    satisfiedBy: "about",
  },
  {
    id: "guitar",
    text: "Put the guitar on if you want something playing while you look. Everything here is hand-built — React Three Fiber, no template.",
    satisfiedBy: "guitar",
  },
  {
    id: "clouds",
    text: "Click a cloud and it rains on the island. Not useful. It's the kind of thing I put in when nobody asked me to.",
    satisfiedBy: "clouds",
  },
  {
    id: "contact",
    text: "If you have something that needs building or analysing, the Contact portal has my email, GitHub and LinkedIn. I'm free now.",
    goTo: "upper",
    action: "Let's talk",
    satisfiedBy: "contact",
  },
]
