"use client"

import * as THREE from "three"
import { atom } from "jotai"

import {
  OPTICS_DONE_AT,
  OPTICS_SCAN_AT,
  OPTICS_WAKE_SECONDS,
} from "@/config/optics"

/** The optics run: one clock, read by four components that each own a
 *  different part of the sequence.
 *
 *  MODULE STATE, NOT AN ATOM, for the clock -- the same decision
 *  helpers/cameraBase.ts, helpers/sunTracker.ts, helpers/xr.ts and
 *  helpers/cursor.ts all record for themselves. `t` changes every frame and is
 *  read inside frame callbacks; routing it through React would re-render the
 *  whole canvas tree sixty times a second to move a sphere.
 *
 *  There IS one atom, below, and it carries only the phase -- four values over
 *  the life of a run, for chrome that genuinely has to re-render. */

export type OpticsPhase =
  /** Nothing has happened. The beacon sits on its base. */
  | "idle"
  /** The beacon has lifted off and is flying free. The world is inert. */
  | "waking"
  /** The beacon is closing on its screen anchor and the camera is pulling
   *  back. Still inert -- a click landing mid-flight would fight the camera. */
  | "settling"
  /** The sweep. Hotspot rings stand down so their depthTest={false} rings do
   *  not sit on top of the brackets. */
  | "scanning"
  /** Anchored, bottom-centre, following the camera. Everything is live again.
   *  This is where the run ends and where it stays. */
  | "companion"

/** Published for chrome. Written only on a CHANGE, from OpticsCamera's frame
 *  callback -- four writes per run, not sixty a second. */
export const opticsPhase = atom<OpticsPhase>("idle")

/** True while the sequence owns the world: the beacon is between its base and
 *  its anchor, and a click would land on a camera that is already moving.
 *
 *  Joins the `||` in IslandExperience's setSceneInputSuppressed call, next to
 *  the open portal, the map and the menu. Deliberately NOT true during
 *  `scanning`: by then the camera has arrived and the sweep is something you
 *  watch, not something that holds you still. */
export function opticsHoldsInput(phase: OpticsPhase) {
  return phase === "waking" || phase === "settling"
}

export const opticsRun = {
  /** Seconds since the click. -1 means idle, and is the only value that does. */
  t: -1,

  /** Where the camera stood when the run began, so it can be put back.
   *
   *  Captured rather than assumed, because the beacon is clickable from
   *  anywhere once it is a companion -- a second sweep started from the
   *  moon-island viewpoint has to come home to the moon-island viewpoint, not
   *  to ISLAND_CAMERA_POSITION. */
  home: {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    captured: false,
  },

  /** Has the beacon already left its base this session? */
  airborne: false,

  /** Fire a run. Allocates nothing.
   *
   *  THE SECOND CLICK SKIPS THE FLOURISH, and it does so by starting the clock
   *  late rather than by branching. Once airborne the beacon is already at its
   *  anchor, so replaying the wake arc would mean teleporting it back to the
   *  pier to fly off again. Seeding `t` past the wake boundary puts the run
   *  straight into `settling`, where the camera flight lives, and every
   *  consumer downstream reads the same clock it always does. */
  start() {
    if (opticsRun.t >= 0) return false
    opticsRun.t = opticsRun.airborne ? OPTICS_WAKE_SECONDS : 0
    opticsRun.home.captured = false
    return true
  },

  /** Hard stop, with no flight home. For a portal opening or the sky journey
   *  beginning underneath a run -- both take the camera, and two owners is one
   *  too many. The beacon keeps its anchor; only the sequence ends. */
  abort() {
    opticsRun.t = -1
  },
}

/** The phase a clock reading lands in.
 *
 *  Pure, so it can be reasoned about and tested without a renderer -- the same
 *  shape helpers/frameStats.ts takes for the same reason. */
export function opticsPhaseAt(t: number, airborne: boolean): OpticsPhase {
  if (t < 0) return airborne ? "companion" : "idle"
  if (t < OPTICS_WAKE_SECONDS) return "waking"
  if (t < OPTICS_SCAN_AT) return "settling"
  if (t < OPTICS_DONE_AT) return "scanning"
  return "companion"
}

/** 0 before the sweep starts, 1 when the front has run out of island.
 *  Clamped at both ends, so a caller can multiply by it without guarding. */
export function sweepProgress(t: number) {
  if (t < OPTICS_SCAN_AT) return 0
  return Math.min(1, (t - OPTICS_SCAN_AT) / (OPTICS_DONE_AT - OPTICS_SCAN_AT))
}
