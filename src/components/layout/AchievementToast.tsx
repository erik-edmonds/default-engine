"use client"

import { useEffect, useState } from "react"
import { useAtomValue } from "jotai"

import { achievementById, type AchievementId } from "@/config/achievements"
import { lastUnlocked } from "@/helpers/achievements"

/** How long an unlock stays on screen. Long enough to read two short lines
 *  without being a thing you have to wait out. */
const VISIBLE_MS = 3600

/** "Achievement unlocked", top-right.
 *
 *  Modelled on the sound nudge (SoundToggle.tsx), which is the only
 *  transient message this app had: same black-glass treatment, same
 *  pointer-events-none, same "a message you cannot click is better than one
 *  that eats a click" reasoning. The difference is that this one is anchored
 *  to the viewport rather than to a button, because the thing it is
 *  reporting happened out in the scene.
 *
 *  Driven by `lastUnlocked.seq` rather than by the id: the same achievement
 *  can never fire twice, but the toast still has to re-show for the NEXT
 *  one, and a counter is what makes two consecutive events distinct. That is
 *  the convention StateProvider.tsx states three times over.
 *
 *  aria-live rather than a role=alert: finding something is pleasant news,
 *  not an interruption, and assertive politeness would cut across whatever a
 *  screen reader was already saying. */
export function AchievementToast() {
  const last = useAtomValue(lastUnlocked)
  // ADJUSTED DURING RENDER, NOT IN AN EFFECT.
  //
  // The obvious version mirrored `last.id` into state from a useEffect, and
  // that is a synchronous setState inside an effect -- the cascading-render
  // pattern react-hooks/set-state-in-effect exists to catch. React's own
  // answer to "a component needs to change state when a prop changes" is to
  // do it during render, which is what this is; the render that sets it is
  // discarded and re-run before anything is committed.
  const [shownSeq, setShownSeq] = useState(last.seq)
  const [shown, setShown] = useState<AchievementId | null>(null)
  if (last.seq !== shownSeq) {
    setShownSeq(last.seq)
    setShown(last.id)
  }

  // The hide, which IS an effect -- but the setState happens inside a
  // timeout rather than synchronously, so it is a scheduled update and not
  // a cascading one.
  useEffect(() => {
    if (!shown) return
    const timer = setTimeout(() => setShown(null), VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [shown, shownSeq])

  const found = shown ? achievementById(shown) : null

  return (
    <div className="achievement-toast" data-shown={found ? "true" : "false"} aria-live="polite">
      {found && (
        <>
          <p className="achievement-toast-eyebrow">Achievement unlocked</p>
          <p className="achievement-toast-title">{found.title}</p>
          <p className="achievement-toast-detail">{found.detail}</p>
        </>
      )}
    </div>
  )
}
