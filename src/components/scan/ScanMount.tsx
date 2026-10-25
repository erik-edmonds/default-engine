"use client"

import dynamic from "next/dynamic"

import type { ScanDefinition } from "@/config/scans"

/** The viewer, behind a lazy import, for the same reasons IslandMount gives.
 *
 *  `ssr: false` is not supported in a Server Component, which is the whole
 *  reason this intermediate client file exists; and `dynamic()` must sit at
 *  module scope because it cannot be called during React rendering.
 *
 *  The payload here is heavy (three, drei, copc, and a WASM decoder) and the
 *  component touches `window` on mount -- it constructs a Worker from
 *  `import.meta.url`. Neither survives server rendering.
 *
 *  No `loading` fallback, matching IslandMount: the viewer draws its own
 *  "Opening…" state from real progress, and a second plate here would flash
 *  in front of it. */
const ScanExperience = dynamic(() => import("@/components/scan/ScanExperience"), { ssr: false })

export function ScanMount({ scan }: { scan: ScanDefinition }) {
  return <ScanExperience scan={scan} />
}
