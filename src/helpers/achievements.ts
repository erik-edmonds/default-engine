"use client"

import { atom, useAtomValue, useSetAtom } from "jotai"

import { ACHIEVEMENTS, achievementById, type AchievementId } from "@/config/achievements"

/** How far along each achievement is, this visit.
 *
 *  A COUNT PER ACHIEVEMENT, not a set of finished ones. Most are 1-of-1 and
 *  a set would have done, but "visit all three portals" has to be able to
 *  say 2/3 -- a half-finished achievement that looks identical to an
 *  untouched one is the thing progress bars exist to fix.
 *
 *  PER VISIT, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT. There is no
 *  localStorage anywhere in this app -- no cookies, no IndexedDB, nothing --
 *  and the hint director says the same of itself: "a hint appears at most
 *  once per load". Achievements follow that rule, which has a real cost
 *  worth stating plainly: a returning visitor starts at zero every time, so
 *  the counter measures this session's curiosity rather than a collection.
 *  Switching it on later is one helper and a `useEffect`; nothing about the
 *  shape below would have to change. */
export const achievementProgress = atom<ReadonlyMap<AchievementId, number>>(
  new Map<AchievementId, number>(),
)

/** The most recent completion, for the toast to announce.
 *
 *  Carries a `seq` for the reason StateProvider.tsx gives three separate
 *  times: setting an already-equal value is a no-op React bails out of, so a
 *  bare id could not re-announce anything and a counter is what makes each
 *  event distinct. */
export const lastUnlocked = atom<{ seq: number; id: AchievementId | null }>({ seq: 0, id: null })

/** Record progress toward one achievement.
 *
 *  A WRITE-ONLY ATOM, not a setter that calls another setter. An earlier
 *  version announced the unlock from inside the Map updater, which is a
 *  side effect in a reducer -- React is free to run those twice, and under
 *  StrictMode it does, so the toast fired twice for one discovery. A
 *  write-only atom reads the current value and writes both atoms in one go,
 *  which is what they are for.
 *
 *  `count` is the new total, not an increment, so a caller that recomputes
 *  from its own tally (the portal set, say) can report it idempotently. It
 *  never goes backwards and the toast fires only on the frame the target is
 *  first met. */
export const reportProgress = atom(
  null,
  (get, set, id: AchievementId, count: number) => {
    const target = achievementById(id)?.target ?? 1
    const held = get(achievementProgress)
    const had = held.get(id) ?? 0
    const next = Math.min(target, Math.max(had, count))
    if (next === had) return
    const map = new Map(held)
    map.set(id, next)
    set(achievementProgress, map)
    if (had < target && next >= target) {
      set(lastUnlocked, (prev) => ({ seq: prev.seq + 1, id }))
    }
  },
)

/** Finish a one-shot achievement. Idempotent -- most of these fire from
 *  handlers that can run again, and the cloud can be clicked all day. */
export function useUnlock() {
  const report = useSetAtom(reportProgress)
  return (id: AchievementId) => report(id, achievementById(id)?.target ?? 1)
}

/** Report a running count toward a multi-step achievement. */
export function useProgress() {
  return useSetAtom(reportProgress)
}

/** How many are finished, of how many, for the menu's badge. */
export function useAchievementCount() {
  const progress = useAtomValue(achievementProgress)
  let found = 0
  for (const a of ACHIEVEMENTS) if ((progress.get(a.id) ?? 0) >= a.target) found++
  return { found, total: ACHIEVEMENTS.length }
}
