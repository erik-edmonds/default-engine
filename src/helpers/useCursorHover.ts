"use client"

import { useEffect, useRef } from "react"

import { setCursorHover, type CursorTargetType } from "@/helpers/cursor"

// Drop-in replacement for drei's useCursor, for a scene that draws its own
// cursor.
//
// drei's version does `document.body.style.cursor = "pointer"`, which is both
// invisible now (the custom cursor hides the native one) and actively harmful:
// an inline style on <body> beats the stylesheet rule that hides it. What those
// call sites were really expressing -- "the pointer is over something
// interactive" -- is still wanted, so this reports it to the cursor system
// instead, and carries the kind of thing along with it so the lens can respond
// differently to a portal than to a prop.
//
// Same call shape as the hook it replaces, so the migration is one import line
// per file.
export function useCursorHover(hovered: boolean, type: CursorTargetType = "interactive") {
  // A stable identity for this call site. Several objects can be hovered at
  // once (nested groups, overlapping props), so the registry is keyed rather
  // than a single flag -- one object un-hovering must not clear another's.
  const token = useRef({})

  useEffect(() => {
    const key = token.current
    setCursorHover(key, hovered ? type : null)
    // Always clear on unmount, not only when un-hovering. A prop can be
    // unmounted mid-hover and never receive its pointerout -- the exact stale
    // state CameraHotspot documents having to clean up by hand.
    return () => setCursorHover(key, null)
  }, [hovered, type])
}
