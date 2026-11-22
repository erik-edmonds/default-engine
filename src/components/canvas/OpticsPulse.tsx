"use client"

import { useLayoutEffect, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import {
  OPTICS_DONE_AT,
  OPTICS_FADE_AT,
  OPTICS_FADE_SECONDS,
  OPTICS_SCAN_AT,
  OPTICS_SCAN_REACH,
  OPTICS_SWEEP_SECONDS,
} from "@/config/optics"
import { opticsRun } from "@/helpers/optics"
import {
  TRAIL_ADD_BASE,
  TRAIL_MIX_BASE,
  patchScanMaterials,
  scanUniforms,
} from "@/lib/optics/scanMaterial"

/** How fast the world goes dark, and comes back. A MathUtils.damp lambda; 3
 *  reaches 95% in about a second, so the darkness is established within the
 *  first fifth of the sweep and the front crosses an already-dark island. */
const DIM_LAMBDA = 3

/** Drives the survey wave and the darkness it needs to read against.
 *
 *  Three jobs. Arm the island's materials once at mount; write the wave's
 *  uniforms while a sweep runs; and publish `opticsRun.dim`, which
 *  Environment.tsx's light rig and the ocean material both read.
 *
 *  Everything about HOW the wave looks is in lib/optics/scanMaterial.ts; this
 *  file is the clock, the radius and the dimmer. */
export function OpticsPulse({ island }: { island: React.RefObject<THREE.Group | null> }) {
  const patched = useRef(0)

  // useLayoutEffect, not useEffect, and not at click time.
  //
  // A material that gains an onBeforeCompile needs its program rebuilt, and
  // doing thirty-one of those on the frame the beacon is clicked is a visible
  // hitch in the middle of the one animation this feature exists for. Doing it
  // at mount costs nothing extra instead: the island already pays a full
  // compile on its first composed frame, and that frame is behind the loading
  // plate. uScanAmp is a uniform rather than a define, so the program compiled
  // at amplitude 0 is the same program used at amplitude 1 -- there is no
  // second compile waiting to happen when the sweep starts.
  useLayoutEffect(() => {
    const root = island.current
    if (!root) return
    patched.current = patchScanMaterials(root)
  }, [island])

  useFrame((_state, delta) => {
    const t = opticsRun.t
    const scanning = t >= OPTICS_SCAN_AT

    // THE DARKNESS, damped unconditionally so it unwinds on its own if a run
    // is aborted mid-sweep -- a portal opening while the world is black would
    // otherwise leave it black for the session.
    const wantDim = scanning && t < OPTICS_FADE_AT ? 1 : 0
    opticsRun.dim = THREE.MathUtils.damp(opticsRun.dim, wantDim, DIM_LAMBDA, delta)

    // The two trail terms trade places with the darkness, and never overlap at
    // full strength. The wash needs a lit world to reproject (it preserves
    // luminance, so a black island washes to black); the additive term needs a
    // dark one to not blow the bloom threshold. Each is strongest exactly
    // where the other is useless.
    scanUniforms.uScanTrailMix.value = TRAIL_MIX_BASE * (1 - opticsRun.dim)
    scanUniforms.uScanTrailAdd.value = TRAIL_ADD_BASE * opticsRun.dim

    if (!scanning) {
      // Writing the zero once and then leaving it alone keeps the uniform
      // upload out of every other frame of the session.
      if (scanUniforms.uScanAmp.value !== 0) scanUniforms.uScanAmp.value = 0
      return
    }

    // The origin follows the beacon rather than standing where it took off.
    // By now the beacon is anchored a few units in front of the camera, so 3D
    // distance is close to depth and the shell reads as a wall sweeping away
    // from the viewer -- which is the look the whole thing is after. Using the
    // beacon's LAUNCH point instead would put the origin behind you on the
    // pier and the wave would arrive from off-screen.
    scanUniforms.uScanOrigin.value.copy(opticsRun.beacon)

    const since = t - OPTICS_SCAN_AT
    const p = Math.min(1, since / OPTICS_SWEEP_SECONDS)
    // Smoothstep on the RADIUS, not linear and not ease-out.
    //
    // Ease-out was the first instinct and it is wrong here: it covers more
    // than half the reach in the first quarter of the sweep, so the front
    // crosses the whole island before you have registered it and then crawls
    // across empty water. Smoothstep emerges gently from the beacon, holds a
    // near-constant speed through the island, and settles at the far edge.
    scanUniforms.uScanRadius.value = OPTICS_SCAN_REACH * (p * p * (3 - 2 * p))

    // Full strength through the sweep AND the hold -- the hold is the beat
    // where the island is darkest and the boxes are up, and the wash is part
    // of that picture. Only then does everything clear together.
    scanUniforms.uScanAmp.value =
      t < OPTICS_FADE_AT
        ? 1
        : Math.max(0, 1 - (t - OPTICS_FADE_AT) / OPTICS_FADE_SECONDS)

    // Belt and braces: the phase machine stops the clock at DONE_AT, but if a
    // frame ever lands past it the amplitude must already be zero rather than
    // going negative.
    if (t >= OPTICS_DONE_AT) scanUniforms.uScanAmp.value = 0
  })

  return null
}
