"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame, useLoader } from "@react-three/fiber"
import { GLTFLoader } from "three-stdlib"

/** What is behind the Mini-Game portal: the racing game's own track and car,
 *  turning slowly.
 *
 *  THE SAME MODELS THE GAME LOADS, AND DELIBERATELY NOT THE GAME.
 *
 *  The portal used to hold the island's avatar, which said nothing about a
 *  racing game -- a window should show what is through it. Running the
 *  actual game in here was the other option and is the wrong one twice
 *  over: it would stand up a second cannon physics world, stepping every
 *  frame inside another scene's render target, behind a window nobody has
 *  driven in; and the game owns the camera in three of its four views, which
 *  this scene cannot give it. A slow turntable reads as "a racing game is
 *  through here" at a fraction of the cost.
 *
 *  Loaded lazily by the portal's own `roomAwake` gate, so the 4.5MB track
 *  only arrives once you have travelled to this hotspot -- it is not part of
 *  the island's initial payload.
 */

/** The track is modelled at racing scale -- tens of units across -- and the
 *  portal's camera sits about three away.
 *
 *  Both numbers set against a screenshot. At 0.055 and y -0.55 the circuit
 *  sat low and left with its bottom third behind the panel's caption and
 *  running off the frame; 0.044 fits it inside the window and y 0.2 lifts
 *  the whole thing clear of the caption band. */
const TRACK_SCALE = 0.044
const TURN_RATE = 0.085

export function MiniGameInterior() {
  const group = useRef<THREE.Group>(null)
  const track = useLoader(GLTFLoader, "/racing/models/track.glb")
  const car = useLoader(GLTFLoader, "/racing/models/car.glb")

  // Cloned, because useLoader hands back one cached scene per URL and
  // /mini-game loads these same two files. Without this, entering the portal
  // would reparent the track out of the game's own scene graph.
  const trackModel = useMemo(() => track.scene.clone(), [track])
  const carModel = useMemo(() => car.scene.clone(), [car])

  useFrame((state) => {
    if (!group.current) return
    group.current.rotation.y = state.clock.elapsedTime * TURN_RATE
  })

  return (
    <group position={[0, 0.2, -3.1]} scale={TRACK_SCALE}>
      {/* Tipped forward so the window looks down ONTO the circuit. Flat on,
          a track is a dark line; from above it reads as a course. */}
      <group rotation={[0.62, 0, 0]}>
        <group ref={group}>
          <primitive object={trackModel} />
          {/* Parked on the start line rather than driving: nothing here is
              simulated, and a car sliding along a path without physics
              reads worse than one standing still. */}
          <primitive object={carModel} position={[-10, 0.4, -3]} rotation={[0, Math.PI / 2, 0]} />
        </group>
      </group>
    </group>
  )
}
