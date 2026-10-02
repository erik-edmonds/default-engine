"use client"

import { useEffect, useRef } from "react"
import { useAtomValue, useSetAtom } from "jotai"

import {
  SUGGESTION_VISIBLE_MS,
  activeSuggestion,
  advanceSuggestion,
  bubbleNode,
  bubbleOnScreen,
  dismissSuggestion,
  muteSuggestions,
  remainingSuggestions,
  suggestionsMuted,
  unreadNode,
} from "@/helpers/avatarBubble"
import type { PortalHotspotId } from "@/config/portals"

export interface AvatarBubbleProps {
  /** Fly the camera to one of the island's waypoints. page.tsx owns the
   *  flights; this only ever asks. Absent while a flight is already running or
   *  a portal is open, which is also what disables the offer. */
  onGoTo?: (hotspot: PortalHotspotId) => void
}

/** What the avatar is saying, and the marker that says he has more.
 *
 *  The DOM half of the pair. AvatarAnchor, inside the canvas, writes the
 *  position of both of these elements every frame; this half owns the markup,
 *  the copy, the fade and the accessibility. Neither knows about the other
 *  beyond the two node handles in helpers/avatarBubble.
 *
 *  BOTH ELEMENTS ARE MOUNTED FOR THE LIFE OF THE PAGE and hidden with
 *  visibility, never unmounted. SceneHint's own note explains why and it
 *  applies here unchanged: an element that mounts and then waits a frame for
 *  its transform flashes at the viewport's top-left corner, and keying the
 *  opacity off a state flag set one frame later races with any re-render in
 *  between. Sitting at opacity 0 and letting the transition run is the thing
 *  that actually works.
 */
export function AvatarBubble({ onGoTo }: AvatarBubbleProps) {
  const active = useAtomValue(activeSuggestion)
  const remaining = useAtomValue(remainingSuggestions)
  const onScreen = useAtomValue(bubbleOnScreen)
  const advance = useSetAtom(advanceSuggestion)
  const dismiss = useSetAtom(dismissSuggestion)
  const mute = useSetAtom(muteSuggestions)
  const muted = useAtomValue(suggestionsMuted)

  const bubble = useRef<HTMLDivElement>(null)
  const unread = useRef<HTMLButtonElement>(null)

  // Publish both nodes to the projector. Same handshake as hints.ts.
  useEffect(() => {
    bubbleNode.current = bubble.current
    unreadNode.current = unread.current
    return () => {
      bubbleNode.current = null
      unreadNode.current = null
    }
  }, [])

  /** IT CLOSES ITSELF. Keyed on the suggestion's id, so stepping to the next
   *  one restarts the clock rather than inheriting the previous one's
   *  remaining time. Cleared on unmount and whenever `active` changes, so no
   *  stale timer can close a bubble the visitor has only just opened. */
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => dismiss(), SUGGESTION_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [active, dismiss])

  const count = remaining.length
  const shown = Boolean(active) && onScreen && !muted
  // The offer only appears where it can be honoured. page.tsx withholds the
  // callback while the camera is already in flight or a portal is open, so a
  // button that cannot fly anywhere is not drawn rather than drawn inert.
  const goTo = active?.goTo
  const canGo = Boolean(goTo && onGoTo)

  return (
    <>
      {/* THE BUBBLE. Zero-sized outer element at the avatar's head; the
          visible panel hangs off it, so the projector writes one transform
          and CSS decides which way it opens. */}
      <div
        ref={bubble}
        className="avatar-bubble"
        data-shown={shown ? "true" : "false"}
        style={{ visibility: "hidden" }}
      >
        <div className="avatar-bubble-panel" role="status" aria-live="polite">
          <p>{active?.text ?? ""}</p>
          <div className="avatar-bubble-actions">
            {canGo && (
              <button
                type="button"
                className="avatar-bubble-go"
                onClick={() => {
                  if (goTo) onGoTo?.(goTo)
                  dismiss()
                }}
                tabIndex={shown ? 0 : -1}
                aria-hidden={!shown}
              >
                {active?.action ?? "Take me there"}
              </button>
            )}
            <button
              type="button"
              className="avatar-bubble-next"
              onClick={() => advance()}
              tabIndex={shown ? 0 : -1}
              aria-hidden={!shown}
            >
              {count > 0 ? "Tell me more" : "Got it"}
            </button>
            {/* THE OFF SWITCH. Not "close this one" -- closing one and
                leaving the badge up was the thing being complained about.
                This stops him offering for the rest of the visit. */}
            <button
              type="button"
              className="avatar-bubble-mute"
              onClick={() => mute()}
              tabIndex={shown ? 0 : -1}
              aria-hidden={!shown}
              title="Stop showing these"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      {/* THE UNREAD MARKER. Stays up while he has anything left to say, and
          is itself the way in -- on a touch device it is a far easier target
          than a character in a 3D scene, and it is the only part of this that
          a keyboard can reach. */}
      <button
        ref={unread}
        type="button"
        className="avatar-unread"
        data-shown={count > 0 && onScreen && !shown && !muted ? "true" : "false"}
        style={{ visibility: "hidden" }}
        onClick={() => advance()}
        aria-label={
          count === 1
            ? "Erik has one more thing to show you"
            : `Erik has ${count} things to show you`
        }
      >
        <span aria-hidden="true">{count}</span>
      </button>
    </>
  )
}
