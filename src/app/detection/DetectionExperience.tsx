"use client"

import { useState } from "react"

import { LiveCamera } from "@/app/detection/LiveCamera"
import { RenderedDemo } from "@/app/detection/RenderedDemo"

/** Two inputs, one pipeline.
 *
 *  The rendered sequence is the default and stays the default. It is
 *  deterministic, it works on every device with no permission to grant, and it
 *  is the only one whose camera poses are known -- so it is the one that can
 *  be SCORED, and the trajectory error it reports is the evidence that the
 *  geometry is right. A visitor who has no camera, or declines, still sees the
 *  whole thing work.
 *
 *  The live mode is the same pipeline pointed at a real camera. Nothing about
 *  the maths changes; what changes is that the scene is yours.
 *
 *  SEPARATE COMPONENTS, NOT A FLAG, so switching genuinely tears the other one
 *  down -- its worker terminated, its camera track stopped, its frame loop
 *  stopped. A mode flag inside one component would leave whichever pipeline
 *  was running still running, which on the live side means the camera light
 *  staying on after you have left.
 */
export default function DetectionExperience() {
  const [mode, setMode] = useState<"rendered" | "live">("rendered")

  return mode === "live" ? (
    <LiveCamera onExit={() => setMode("rendered")} />
  ) : (
    <RenderedDemo onUseCamera={() => setMode("live")} />
  )
}
