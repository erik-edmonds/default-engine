"use client"

/** The lens panel's state, and the node its in-canvas projector writes to.
 *
 *  AN EXTERNAL STORE RATHER THAN A JOTAI ATOM, which is the odd choice in a
 *  file like this, so: the panel is opened from MODULE SCOPE. Scene.tsx holds
 *  `startOptics` as a module-level constant on purpose -- the beacon
 *  re-registers its magnetic target whenever that identity changes, so an
 *  inline arrow would churn it every render -- and that function is where the
 *  second click lands. A module-level function cannot call a jotai setter
 *  without reaching for the default store and quietly assuming no Provider
 *  will ever wrap the tree.
 *
 *  A listener set plus `useSyncExternalStore` has neither problem, is what
 *  helpers/minimap.ts already does for the same kind of seam, and avoids the
 *  `set-state-in-effect` lint that helpers/usePortraitFrame.ts documents this
 *  project trying to bring down.
 */

import { useSyncExternalStore } from "react"

export type LensStatus = "ready" | "thinking" | "offline"

export interface LensState {
  open: boolean
  /** The last thing asked, or null before anything has been. */
  question: string | null
  /** What has arrived of the answer so far. Grows chunk by chunk. */
  answer: string
  status: LensStatus
}

const EMPTY: LensState = { open: false, question: null, answer: "", status: "ready" }

/** Replaced wholesale on every change, never mutated.
 *
 *  `useSyncExternalStore` compares snapshots by identity and will loop
 *  forever if `getSnapshot` returns a fresh object each call, so the rule is
 *  the inverse of everywhere else in this codebase: build the new object
 *  once, at the moment something actually changes, and hand out the same
 *  reference until the next one. */
let state: LensState = EMPTY

const listeners = new Set<() => void>()

function commit(next: Partial<LensState>) {
  const merged = { ...state, ...next }
  // Bail on a no-op write. The stream calls `appendLensAnswer` per chunk and
  // the status setters are called from a few places that cannot easily know
  // whether they are changing anything.
  if (
    merged.open === state.open &&
    merged.question === state.question &&
    merged.answer === state.answer &&
    merged.status === state.status
  ) {
    return
  }
  state = merged
  for (const fn of listeners) fn()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function getSnapshot() {
  return state
}

/** The server has no panel. Same shape usePortraitFrame uses for its own
 *  server value, and for the same reason: a closed panel is what the first
 *  client render produces too, so there is no hydration mismatch. */
function getServerSnapshot() {
  return EMPTY
}

export function useLensPanel(): LensState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Opened by the beacon's SECOND click.
 *
 *  `opticsRun.start()` returns false once the island has already been
 *  surveyed, and helpers/optics.ts has said for a while that this is the seam
 *  where the AI takes over from the scan. This is that handover, and it needs
 *  no new click plumbing: the one callback the beacon already has either
 *  fires a run or opens her. */
export function openLensPanel() {
  commit({ open: true })
}

export function closeLensPanel() {
  commit({ open: false })
}

/** A question goes in: her previous answer is cleared, not appended to.
 *
 *  Only the latest exchange is kept. The panel floats over the one view this
 *  page exists to show, and a transcript that grows without limit becomes a
 *  wall in front of it -- the left/right split is what makes a single
 *  exchange read as a conversation. */
export function startLensQuestion(question: string) {
  commit({ question, answer: "", status: "thinking" })
}

export function appendLensAnswer(chunk: string) {
  commit({ answer: state.answer + chunk })
}

export function finishLensAnswer() {
  commit({ status: "ready" })
}

export function failLensAnswer(line: string) {
  commit({ answer: line, status: "offline" })
}

/** SceneHint's `hintNode` in miniature, and for the reason stated there: the
 *  thing that knows WHERE the panel goes runs inside the canvas and needs the
 *  camera, while the thing being positioned is a DOM node that is a sibling of
 *  the canvas and outside that React tree entirely. */
export const lensNode: { current: HTMLDivElement | null } = { current: null }
