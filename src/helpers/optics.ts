"use client"

import * as THREE from "three"
import { atom } from "jotai"

import {
  OPTICS_DONE_AT,
  OPTICS_SCAN_AT,
  OPTICS_WAKE_SECONDS,
} from "@/config/optics"

/** The optics run: one clock, read by five components that each own a
 *  different part of the sequence.
 *
 *  MODULE STATE, NOT AN ATOM, for the clock -- the same decision
 *  helpers/cameraBase.ts, helpers/sunTracker.ts, helpers/xr.ts and
 *  helpers/cursor.ts all record for themselves. `t` changes every frame and is
 *  read inside frame callbacks; routing it through React would re-render the
 *  whole canvas tree sixty times a second to move a sphere.
 *
 *  There IS one atom, below, and it carries only the phase -- five values over
 *  the life of a run, for chrome that genuinely has to re-render. */

export type OpticsPhase =
  /** Nothing has happened. The beacon sits on its base. */
  | "idle"
  /** The beacon has lifted off and is touring the island. The world is inert
   *  and THE CAMERA DOES NOT MOVE. */
  | "waking"
  /** The tour is over and the beacon is closing on its screen anchor. Still
   *  inert. The camera is already in motion by now -- it left halfway through
   *  the tour; see OPTICS_CAMERA_AT. */
  | "settling"
  /** The sweep. Hotspot rings stand down so their depthTest={false} rings do
   *  not sit on top of the brackets. */
  | "scanning"
  /** Anchored, bottom-centre, following the camera. Everything is live again.
   *  This is where the run ends and where it stays. */
  | "companion"

/** Published for chrome. Written only on a CHANGE, from OpticsCamera's frame
 *  callback -- five writes per run, not sixty a second. */
export const opticsPhase = atom<OpticsPhase>("idle")

/** True while the sequence owns the world: the beacon is between its base and
 *  its anchor, or the camera is on its way out.
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

  /** How far the clouds are currently out of the way, 0..1. Damped by
   *  OpticsCamera and read by Sky.tsx's group frame loop.
   *
   *  A SEPARATE VALUE FROM THE PHASE, because it has to outlive the run: the
   *  camera flies home at the instant the clock stops, and clouds popping back
   *  in around a lens that is still forty units out would be worse than never
   *  ducking at all. */
  duck: 0,

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

  /** Has the island already been surveyed this session?
   *
   *  ONCE ONLY. The sweep is a seven-second set piece with a camera move in
   *  front of it, and replaying it on every click turns a reveal into a
   *  loading bar. Set when a run reaches `companion`, never cleared.
   *
   *  THIS LEAVES THE BEACON A DEAD CONTROL, which layout/Icon.tsx documents at
   *  length as a thing to avoid -- a button that looks live and does nothing.
   *  It is deliberate for now and this is the seam: the beacon exists to house
   *  the AI, and a second click is what should open it. `start()` returns false
   *  here so the caller can tell the difference between "started a run" and
   *  "the user wants something else from this thing". */
  scanned: false,

  /** How dark the world currently is, 0..1, where 1 is fully dimmed.
   *
   *  Damped by OpticsPulse; read by Environment.tsx's light rig and by the
   *  ocean material. A module value rather than an atom for the usual reason
   *  (helpers/sunTracker.ts states it): it changes every frame and both
   *  readers are frame callbacks. */
  dim: 0,

  /** The beacon's live world position, published by BeaconCompanion and read
   *  by OpticsPulse as the wave's origin.
   *
   *  The same handoff shape helpers/sunTracker.ts uses -- Environment writes
   *  the sun, SunFlare reads it -- and for the same reason: the writer and the
   *  reader are different components in different parts of the tree, both
   *  running inside the frame loop, with nothing useful to say to React. */
  beacon: new THREE.Vector3(),

  /** Is the pointer on the beacon right now?
   *
   *  Written by Beacon.tsx, read by BeaconLure.tsx's frame callback so the
   *  ring on the pier tightens and quickens under the cursor. A module value
   *  rather than lifted React state for the usual reason this file and
   *  helpers/sunTracker.ts both give: the reader runs inside the frame loop
   *  and has nothing useful to say to React, and hovering a prop is not worth
   *  a re-render of the scene tree. */
  hovered: false,

  /** Fire a run. Allocates nothing.
   *
   *  THE SECOND CLICK SKIPS THE TOUR, and it does so by starting the clock
   *  late rather than by branching. Once airborne the beacon is already at its
   *  anchor, so replaying the circuit would mean teleporting it back to the
   *  pier to fly off again. Seeding `t` past the wake boundary puts the run
   *  straight into `settling`, and every consumer downstream reads the same
   *  clock it always does. */
  start() {
    if (opticsRun.t >= 0) return false
    // Already surveyed. The click is swallowed; see `scanned` above for where
    // the AI takes over from here.
    if (opticsRun.scanned) return false
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
 *  Pure, so it can be reasoned about without a renderer -- the same shape
 *  helpers/frameStats.ts takes for the same reason. */
export function opticsPhaseAt(t: number, airborne: boolean): OpticsPhase {
  if (t < 0) return airborne ? "companion" : "idle"
  if (t < OPTICS_WAKE_SECONDS) return "waking"
  if (t < OPTICS_SCAN_AT) return "settling"
  if (t < OPTICS_DONE_AT) return "scanning"
  return "companion"
}
