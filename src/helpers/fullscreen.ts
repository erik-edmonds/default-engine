"use client"

/** Safari's prefixed spelling, still the only one iPad understands. */
type PrefixedElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}
type PrefixedDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

/** Whether this browser can put an arbitrary element fullscreen at all.
 *
 *  Notably false on iPhone: Safari there exposes the Fullscreen API only for
 *  <video>, so nothing the page does can reclaim the browser chrome. That is
 *  the whole reason the scroll-to-collapse spacer exists alongside this. */
export function canGoFullscreen() {
  if (typeof document === "undefined") return false
  const el = document.documentElement as PrefixedElement
  return typeof el.requestFullscreen === "function" || typeof el.webkitRequestFullscreen === "function"
}

/** Ask for fullscreen, and never let the answer matter.
 *
 *  Must be called synchronously inside a user gesture -- browsers reject a
 *  request they judge to have come from anywhere else, and Firefox in
 *  particular rejects one made after an await. The caller (handleEnter) has a
 *  whole choreographed sequence behind it, so this swallows every failure:
 *  refusing fullscreen is a preference, not an error, and it must never be
 *  able to strand the loading screen. */
export function requestSceneFullscreen() {
  if (typeof document === "undefined") return
  const el = document.documentElement as PrefixedElement
  try {
    const result = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()
    // The promise form rejects rather than throwing; both are equally fine.
    if (result && typeof (result as Promise<void>).catch === "function") {
      ;(result as Promise<void>).catch(() => {})
    }
  } catch {
    /* unsupported, blocked, or already fullscreen -- all no-ops here */
  }
}

export function exitSceneFullscreen() {
  if (typeof document === "undefined") return
  const doc = document as PrefixedDocument
  if (!doc.fullscreenElement && !doc.webkitFullscreenElement) return
  try {
    const result = doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()
    if (result && typeof (result as Promise<void>).catch === "function") {
      ;(result as Promise<void>).catch(() => {})
    }
  } catch {
    /* nothing to exit */
  }
}
