"use client"

import dynamic from "next/dynamic"

import { SceneBoundary } from "@/components/layout/SceneBoundary"

/** `ssr: false` is not supported in a Server Component, which is the whole
 *  reason this intermediate client file exists; and `dynamic()` must sit at
 *  module scope because it cannot be called during React rendering. Next 16's
 *  lazy-loading guide is explicit about both. ScanMount.tsx and IslandMount.tsx
 *  are the same three-file shape for the same reason.
 *
 *  The payload here is the heaviest on the site -- three, and a worker that
 *  pulls eleven megabytes of OpenCV -- and the component touches `window` on
 *  mount to construct that worker. Neither survives server rendering.
 *
 *  No `loading` fallback: the demo draws its own progress from the real state
 *  of the runtime, and a second plate here would flash in front of it. */
const DetectionExperience = dynamic(() => import("@/app/detection/DetectionExperience"), {
  ssr: false,
})

export function DetectionMount() {
  // THE BOUNDARY GOES AROUND THE LAZY IMPORT, not inside the experience, and
  // that placement is the whole point of it being here.
  //
  // `next/dynamic` is React.lazy underneath, so a chunk that fails to load
  // rejects and THROWS DURING RENDER OF THIS COMPONENT -- above anything the
  // experience could wrap around itself. Without a boundary here that throw
  // goes all the way up and the visitor gets Next's error overlay in
  // development and a blank page in production.
  //
  // Not hypothetical: a dev server left running for thirty-four hours across
  // a route that moved out of app/(work)/ served a loader chunk whose
  // dependency list named a stale artifact, and the dynamic import died with
  // `ChunkLoadError`. The code was fine -- a reload fixed it -- but there was
  // nothing on screen that said so. SceneBoundary's fallback offers exactly
  // the right action for this failure, which is Reload.
  return (
    <SceneBoundary label="detection">
      <DetectionExperience />
    </SceneBoundary>
  )
}
