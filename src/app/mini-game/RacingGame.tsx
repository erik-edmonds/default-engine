"use client"

import { useEffect } from "react"

import { Canvas } from "@react-three/fiber"
import { Physics } from "@react-three/cannon"

import { RacingScene } from "@/components/racing/RacingScene"
import { useUnlock } from "@/helpers/achievements"

/** The racing game, as a page of this site.
 *
 *  Ported from a standalone Vite app (DanieloM83/R3F-Car-Racing, see
 *  CREDITS.md). What changed in the move is recorded where it happened --
 *  useControls.ts for the input model, Car.tsx for the loader, paths.ts for
 *  the asset URLs. The physics itself is untouched: every handling number in
 *  useWheels.ts is the original's.
 *
 *  Gravity is -2.1 rather than -9.82 on purpose; that is the original's own
 *  tune and the car's mass and engine forces are balanced against it. */
export function RacingGame() {
  // Unlocked on arrival rather than on a completed lap: there is no lap
  // timing in this port, and "got here at all" is the thing worth marking.
  //
  // The achievement survives coming back to the island because jotai's
  // default store lives as long as the document, and the Home button is a
  // client-side navigation rather than a reload -- so the island's counter
  // has it when you return. A hard refresh clears it, which is what
  // per-visit means.
  const unlock = useUnlock()
  useEffect(() => {
    unlock("driver")
  }, [unlock])

  return (
    <div className="racing-stage">
      <Canvas>
        <Physics broadphase="SAP" gravity={[0, -2.1, 0]}>
          <RacingScene />
        </Physics>
      </Canvas>

      {/* Keyboard only, and said so plainly rather than left to be
          discovered: there is no on-screen control anywhere in the scene,
          so a visitor who is not told has nothing to try. */}
      <div className="racing-keys">
        <p className="racing-keys-title">Drive</p>
        <ul>
          <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> steer</li>
          <li><kbd>Shift</kbd> boost</li>
          <li><kbd>Space</kbd> brake</li>
          <li><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> air control</li>
          <li><kbd>C</kbd> camera</li>
          <li><kbd>R</kbd> reset</li>
        </ul>
      </div>

      {/* NO BACK LINK HERE ON PURPOSE.
          The root layout already pins a Home button at the top-left of every
          route -- the same control /portfolio and the project pages rely on
          to get back. A second one in this corner sat underneath it and the
          two overlapped into an unreadable smear. */}
    </div>
  )
}
