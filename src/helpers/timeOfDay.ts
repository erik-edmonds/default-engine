import type { TimeOfDay } from "@/components/canvas/environmentPresets"

/** Which phase the scene opens in, from the visitor's own clock.
 *
 *  There used to be two copies of this -- `getTimeOfDay()` in app/page.tsx for
 *  the scene and `time()` in helpers/StateProvider.tsx for the theme -- and
 *  both carried the same bug, written the same way:
 *
 *      if (hour > 4  && hour <= 6)  return "dawn"
 *      if (hour > 6  && hour <= 17) return "day"      // swallows 15, 16, 17
 *      if (hour > 14 && hour <= 18) return "evening"  // only 18 ever reaches here
 *
 *  The day branch overlapped the evening branch and ran first, so "evening" --
 *  the best-lit preset in the scene, fully authored everywhere else, right down
 *  to its own equalizer-bar colour in SoundToggle -- was reachable for exactly
 *  one hour out of twenty-four.
 *
 *  Written below as a lookup over disjoint ranges rather than as ordered
 *  early-returns, so the bug cannot come back: overlapping entries would be
 *  visible as overlapping numbers instead of hiding in the control flow. */
const PHASES: { from: number; to: number; phase: TimeOfDay }[] = [
  { from: 5, to: 6, phase: "dawn" },
  { from: 7, to: 14, phase: "day" },
  { from: 15, to: 18, phase: "evening" },
]

export function timeOfDay(now: Date = new Date()): TimeOfDay {
  const hour = now.getHours()
  return PHASES.find((p) => hour >= p.from && hour <= p.to)?.phase ?? "night"
}
