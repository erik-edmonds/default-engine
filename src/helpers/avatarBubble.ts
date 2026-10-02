"use client"

import { atom } from "jotai"

import type { Suggestion, SuggestionSubject } from "@/config/suggestions"

/** The avatar's speech bubble: what he has to say, and whether it is showing.
 *
 *  This is the mechanism; config/suggestions.ts is the copy, and that file's
 *  header says why the two are apart.
 *
 *  WHAT IS REUSED AND WHAT IS NEW. helpers/useHintDirector still owns the two
 *  portal beats -- arrive at a portal, learn how to get back out -- because
 *  those fire where the avatar is not on screen to say them. What it no longer
 *  owns is discovery: "play the guitar", "make it rain", "open the Poké Ball"
 *  were three captions competing for one slot behind an idle timer, and two of
 *  them realistically never appeared. They are entries in this queue now, which
 *  the visitor steps through at their own pace instead of waiting out a clock.
 */

/** The queue, in the order he offers it. Written once by the director. */
export const suggestions = atom<Suggestion[]>([])

/** Ids he has already said.
 *
 *  A set of ids rather than an index into the queue, because entries also leave
 *  the queue by being satisfied, and an index would then point at the wrong
 *  line. */
export const suggestionsSeen = atom<ReadonlySet<string>>(new Set<string>())

/** Subjects the visitor found on their own.
 *
 *  Written by the director from state that already existed -- musicEnabled says
 *  the guitar has been found, rainRequest says a cloud has, openPortalId says
 *  which portal has been entered. A suggestion whose subject is in here is
 *  never offered, so he does not recommend something you are looking at. */
export const suggestionsSatisfied = atom<ReadonlySet<SuggestionSubject>>(
  new Set<SuggestionSubject>(),
)

/** What is in the bubble right now, or null when he is quiet. */
export const activeSuggestion = atom<Suggestion | null>(null)

/** What he still has to say: unseen, and not about something already found. */
export const remainingSuggestions = atom((get) => {
  const seen = get(suggestionsSeen)
  const satisfied = get(suggestionsSatisfied)
  return get(suggestions).filter(
    (s) => !seen.has(s.id) && !(s.satisfiedBy && satisfied.has(s.satisfiedBy)),
  )
})

/** Step to the next thing he has to say.
 *
 *  A write-only atom rather than a function in the component, because three
 *  separate things advance the queue -- the bubble's own button, the unread
 *  marker, and clicking the avatar inside the canvas -- and the third of those
 *  is on the far side of the <Canvas> boundary from the other two. One atom is
 *  one implementation; three copies of "read the queue, mark it seen" would be
 *  three states drifting apart. */
export const advanceSuggestion = atom(null, (get, set) => {
  const next = get(remainingSuggestions)[0]
  if (!next) {
    // Nothing left: close the bubble rather than re-offering the last line.
    set(activeSuggestion, null)
    return
  }
  set(activeSuggestion, next)
  set(suggestionsSeen, new Set(get(suggestionsSeen)).add(next.id))
})

/** Close the bubble without consuming anything. */
export const dismissSuggestion = atom(null, (_get, set) => {
  set(activeSuggestion, null)
})

/** The visitor has asked him to stop offering. Nothing shows for the rest of
 *  the visit -- no panel, no unread marker.
 *
 *  "There's no way to get rid of them, they just stay on the screen." Closing
 *  one bubble was not an answer to that, because the badge stayed up and the
 *  next click brought another; this is the off switch that was missing. Per
 *  visit, like everything else here: there is no persistence anywhere in this
 *  app, so a reload starts him talking again. */
export const suggestionsMuted = atom(false)

export const muteSuggestions = atom(null, (_get, set) => {
  set(suggestionsMuted, true)
  set(activeSuggestion, null)
})

/** The bubble's DOM node, published so the in-canvas projector can write
 *  transforms straight onto it.
 *
 *  Exactly the trick hints.ts uses for SceneHint and cursor.ts for
 *  SceneCursor: the two halves live on opposite sides of the canvas boundary
 *  and cannot share a React ref, so the node is handed over through module
 *  state and the position update never touches React's render path. */
export const bubbleNode: { current: HTMLElement | null } = { current: null }

/** ...and the unread marker's node, which tracks the avatar too but stays up
 *  when the bubble is closed. */
export const unreadNode: { current: HTMLElement | null } = { current: null }

/** Whether the bubble is actually placed on screen yet.
 *
 *  False between a suggestion being chosen and the projector's first frame.
 *  SceneHint's own note explains why this matters and it applies unchanged:
 *  a projected element that is shown before it has been positioned flashes at
 *  the top-left corner of the viewport for one frame. */
export const bubbleOnScreen = atom(false)

/** How far above the avatar's origin the bubble is anchored, in world units.
 *
 *  Measured against the island pose rather than guessed: the avatar stands at
 *  AVATAR_BASE_POSITION with a scale that puts the top of his head a little
 *  over two units up, so this clears him without floating free of him. */
export const BUBBLE_ANCHOR_UP = 2.35

/** How long he waits, idle, before opening the first one himself.
 *
 *  Only the first. A numbered badge over a character in a 3D scene is not
 *  self-evidently a thing you click, so he says the opening line unprompted and
 *  the mechanic explains itself; everything after that is pulled, not pushed.
 *  Same length as the old DISCOVER_IDLE_MS, for the same reason it had: the
 *  visitor who is already busy is the one worth not interrupting. */
export const FIRST_SUGGESTION_IDLE_MS = 10000

/** How long a bubble stays up on its own before closing.
 *
 *  "There's no way to get rid of them, they just stay on the screen. It's bad
 *  user experience, and it doesn't disappear on its own."
 *
 *  Both halves of that are fixed, and they are different fixes: there is a
 *  close control on the panel now, and this is the clock. Long enough to read
 *  thirty-odd words without hurrying -- about 12s at a slow 150wpm, rounded up
 *  -- and short enough that a visitor who has moved on is not reading last
 *  minute's sentence. Interacting with the panel at all restarts it.
 *
 *  The unread marker is NOT on a clock: it is a small badge rather than a
 *  panel over the scene, it is the only affordance that says there is more,
 *  and it goes when the queue is exhausted or the visitor dismisses it. */
export const SUGGESTION_VISIBLE_MS = 14000

/** The avatar's hit proxy, by name.
 *
 *  Shared because two files need to agree on it: AvatarController mounts it and
 *  must exempt it from the walk that strips raycasting off the subject's whole
 *  subtree, and that walk runs after every commit -- so a mismatch here does
 *  not fail loudly, it just silently makes the avatar unclickable again. */
export const AVATAR_HIT_PROXY = "avatar-hit-proxy"
