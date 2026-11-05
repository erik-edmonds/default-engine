"use client"

import { useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { xrHands } from "@/helpers/xrHands"
import { setMenuOpen, xrGrab } from "@/helpers/xrMenu"
import { scanStats } from "@/helpers/scanStats"
import { GATE_CLOSED, nextGateState, wristRoll, type GateState } from "@/lib/xr/wristGate"
import {
  WRIST_FOREARM_AXIS,
  WRIST_MENU_OFF_DEG,
  WRIST_MENU_OFF_DWELL_MS,
  WRIST_MENU_ON_DEG,
  WRIST_MENU_ON_DWELL_MS,
  WRIST_PALM_AXIS,
} from "@/config/xrScan"

/** Watches the left wrist and raises the menu when it turns.
 *
 *  THIS FILE PUBLISHES ONE BOOLEAN and nothing else. It used to compute where
 *  the panel should stand as well, and that was the source of the bug where
 *  the menu ended up marooned out in the survey -- see ScanMenuHost, which
 *  now head-locks the panel by portalling it into the camera. Position is a
 *  parenting relationship there rather than a computation here, so there is
 *  no pose left to get wrong.
 *
 *  Renders nothing, and TAKES NO FRAME PRIORITY -- fiber only auto-renders
 *  while `internal.priority` is 0, so a prioritised subscriber anywhere in
 *  this Canvas would open the headset on black. Everything on this route is
 *  careful about that and this is no exception.
 *
 *  Runs at the DEFAULT priority deliberately rather than earlier: the
 *  library's `useApplyXRSpaceMatrix` writes tracked-space matrices at
 *  priority -100, so by the time this runs the grip pose is this frame's and
 *  not last frame's.
 *
 *  All the arithmetic is in lib/xr/wristGate.ts, where it is tested.
 */
export function WristGate() {
  const gl = useThree((s) => s.gl)
  /** `?menu=1` forces the gate open, in the style of `?budget=` and
   *  `?loading=`. The uikit layout has to be checkable on a monitor, since a
   *  real XR session cannot be driven headless in this project. Now that the
   *  panel is head-locked there is nothing for the preview to place -- it is
   *  simply in front of whichever camera is rendering, on a monitor as in a
   *  headset. */
  const forced = useRef(
    typeof window === "undefined" ? false : new URLSearchParams(window.location.search).get("menu") === "1",
  )
  const gate = useRef<GateState>(GATE_CLOSED)
  const quat = useRef(new THREE.Quaternion())

  useFrame(() => {
    if (forced.current) {
      setMenuOpen(true)
      return
    }

    const hand = xrHands.left
    if (!hand || !gl.xr.isPresenting) {
      // Leaving a session with the menu up would strand it in the desktop
      // scene, where it has no business being.
      if (gate.current.open) {
        gate.current = GATE_CLOSED
        setMenuOpen(false)
      }
      return
    }

    // Brought up to date by hand, for the same documented reason XrNavigate
    // does it: three refreshes world matrices inside gl.render, at the END of
    // the frame, so without this the gate reads the pose one frame late.
    hand.updateWorldMatrix(true, false)
    hand.getWorldQuaternion(quat.current)

    const roll = wristRoll(quat.current, WRIST_FOREARM_AXIS, WRIST_PALM_AXIS)
    // Published so the menu can show the live angle while the thresholds are
    // being tuned -- the axis convention is the one thing that cannot be
    // settled off-hardware, and a number on screen beats guessing.
    scanStats.wristRoll = roll

    gate.current = nextGateState(gate.current, {
      roll,
      held: xrGrab.held,
      now: performance.now(),
      onDeg: WRIST_MENU_ON_DEG,
      offDeg: WRIST_MENU_OFF_DEG,
      onDwellMs: WRIST_MENU_ON_DWELL_MS,
      offDwellMs: WRIST_MENU_OFF_DWELL_MS,
    })

    // `setMenuOpen` returns early when the value has not changed, so this is
    // one comparison per frame rather than a notification per frame.
    setMenuOpen(gate.current.open)
  })

  return null
}
