"use client"

import { useEffect } from "react"
import { SceneFallback } from "@/components/layout/SceneFallback"

/**
 * The route-level boundary.
 *
 * SceneBoundary already catches anything thrown inside <Canvas>, but that is
 * deliberately tight around the canvas so the name stamp, the home button and
 * the sound toggle survive a dead scene. Everything OUTSIDE it -- the page's
 * own chrome, /portfolio, the four project pages -- had no boundary at all, so
 * a throw there replaced the whole site with Next's unbranded "Application
 * error: a client-side exception has occurred", with no retry and nothing to
 * say what happened.
 *
 * Renders the same panel every other failure path lands on, so a visitor sees
 * one consistent thing however it broke.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Left in production deliberately, same as SceneBoundary: a visitor who
    // reports "it went blank" is otherwise the only diagnostic available.
    console.error("[route-error]", error)
  }, [error])

  return (
    <SceneFallback
      title="Something broke"
      detail="This page hit an error it could not recover from on its own. Trying again usually clears it."
      action="Try again"
      // reset() re-renders the segment without a full reload, which keeps the
      // loaded assets warm -- a reload here would re-download the island.
      onAction={reset}
    />
  )
}
