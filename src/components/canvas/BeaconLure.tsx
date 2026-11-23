"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { OPTICS_WAVE_COLOR } from "@/config/optics"
import { opticsPhaseAt, opticsRun } from "@/helpers/optics"
import { prefersReducedMotion } from "@/helpers/motion"

/** How far the ring travels, as a multiple of the hologram's own scale.
 *
 *  IT HAS TO CLEAR THE PEDESTAL BY A LONG WAY. The first version stopped at
 *  2.1, which put the whole cycle inside the Base model's own glowing spiral
 *  -- and rendered, it was invisible: a faint blue ring expanding through a
 *  bright blue vortex reads as part of the vortex. What makes a ping legible
 *  is that it LEAVES. Reaching past 7 carries it off the pedestal, across the
 *  boards and out over the water, where nothing else is moving. */
const RING_MAX = 7.2
const RING_MIN = 0.8
/** Seconds per cycle. Slow enough to read as breathing rather than as a
 *  loading spinner, which is the whole difference between an invitation and
 *  an alarm. */
const PERIOD = 3.4
/** Under the cursor the ring pulls in and speeds up -- the scene's own way of
 *  saying "yes, this one". Same idea as CameraHotspot's rings tightening on
 *  hover, which is the gesture this scene already uses for "interactive". */
const HOVER_PERIOD = 1.6
const HOVER_MAX = 4.4
/** How fast the ring's two behaviours cross over when the cursor arrives or
 *  leaves. A damp, so neither state has an edge. */
const HOVER_LAMBDA = 7

/** Where the ring sits above the deck. Flat on the pier reads as resting ON
 *  it, which is the point -- but exactly coplanar z-fights with the boards, so
 *  it floats by a hair. Kept even though depthTest is off below, so the ring
 *  sorts above the deck rather than fighting it if that ever changes. */
const RING_LIFT = 0.04

/** The beacon says "click me" WITHOUT SAYING ANYTHING.
 *
 *  THIS REPLACED A CAPTION. There was a DOM hint that projected onto the
 *  beacon and read "Click the beacon to scan" -- a black glass pill, a
 *  breathing white dot, hard chrome laid over the one view this whole page
 *  exists to show. It worked and it looked like a tooltip bolted onto a
 *  diorama. helpers/hints.ts records what went with it.
 *
 *  A ring widening on the pier is the same information in the scene's own
 *  language, and it costs the scene nothing it was not already spending: one
 *  ring, one material, two numbers written per frame.
 *
 *  ALIVE ONLY BEFORE THE FIRST CLICK. `airborne` is set the instant the beacon
 *  leaves its base and is never cleared, so this cannot come back to nag
 *  someone who has already used it -- the invitation is spent. The early
 *  return also means that for the whole of a run, and for the whole session
 *  after it, this component costs one comparison a frame.
 */
export function BeaconLure({ position, scale }: { position: [number, number, number]; scale: number }) {
  const ring = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  /** 0 idle, 1 hovered. Damped, so the two sizes cross over rather than cut. */
  const hover = useRef(0)
  const clock = useRef(0)
  const still = useMemo(() => prefersReducedMotion(), [])

  useFrame((_state, delta) => {
    const mesh = ring.current
    const mat = material.current
    if (!mesh || !mat) return

    // Spent the moment the beacon lifts. Not `phase === "idle"` alone: the
    // phase is also idle on /Blob, where no run can ever start and the ring
    // should keep offering.
    if (opticsRun.airborne || opticsPhaseAt(opticsRun.t, opticsRun.airborne) !== "idle") {
      if (mesh.visible) mesh.visible = false
      return
    }
    if (!mesh.visible) mesh.visible = true

    // Held at one steady radius for anyone who has asked the OS not to
    // animate things. Still visible, still says "this is a thing" -- it just
    // stops moving, which is what the preference actually asks for.
    if (still) {
      mesh.scale.setScalar(scale * (RING_MIN + (RING_MAX - RING_MIN) * 0.45))
      mat.opacity = 0.22
      return
    }

    hover.current = THREE.MathUtils.damp(hover.current, opticsRun.hovered ? 1 : 0, HOVER_LAMBDA, delta)

    const period = THREE.MathUtils.lerp(PERIOD, HOVER_PERIOD, hover.current)
    const max = THREE.MathUtils.lerp(RING_MAX, HOVER_MAX, hover.current)
    // Advanced by delta rather than read off state.clock, so changing `period`
    // mid-cycle stretches what is left of the ring rather than teleporting it:
    // a phase computed as `elapsed / period` jumps the instant the denominator
    // moves, which on hover is a visible snap.
    clock.current = (clock.current + delta / period) % 1

    // Out from the beacon, easing as it goes, so it slows as it dissipates.
    const p = clock.current
    const eased = 1 - (1 - p) * (1 - p)
    // SCALED BY THE PROP, not set in world units. Writing the radius straight
    // onto the mesh overrode the `scale` the JSX gives it, so the ring was the
    // same size wherever the hologram was mounted and at whatever size -- the
    // one thing this component promises not to do.
    mesh.scale.setScalar(scale * THREE.MathUtils.lerp(RING_MIN, max, eased))
    // Up quickly, out slowly. Never near opaque -- it is a suggestion, and it
    // draws over the deck rather than being lit by it.
    mat.opacity = Math.min(p / 0.12, 1) * (1 - eased) * 0.5
  })

  return (
    <mesh
      ref={ring}
      // Flat on the deck. Scale is applied per frame above, so the group's own
      // scale carries only the hologram's, keeping the ring the same size
      // relative to the pedestal wherever this is mounted.
      rotation={[-Math.PI / 2, 0, 0]}
      position={[position[0], position[1] + RING_LIFT, position[2]]}
      // Nothing to click. The beacon above it is the target, and a ring that
      // swallowed the pointer would steal the very click it is asking for.
      raycast={() => null}
    >
      {/* The house ring, matching CameraHotspot's markers: a thin annulus
          rather than a stroked circle, so it scales without the line weight
          scaling with it. */}
      {/* Thin, and thinner as it grows: the annulus is a fixed FRACTION of
          the radius, so scaling the mesh scales the line weight with it. That
          is wrong for a stroke and right for a ripple -- a wavefront spreads
          as it travels. */}
      <ringGeometry args={[0.9, 1, 72]} />
      <meshBasicMaterial
        ref={material}
        color={OPTICS_WAVE_COLOR}
        transparent
        opacity={0}
        // depthTest OFF, matching CameraHotspot's rings exactly.
        //
        // It was on at first, on the theory that a ring lying on the boards
        // should be occluded by what stands in front of it. Rendered, that
        // theory was simply wrong: the pedestal's own mesh and the deck swallow
        // it completely and the ring never appears at all. At this opacity it
        // reads as light thrown across the surface rather than as a decal
        // floating over it, which is what the hotspot markers already do a few
        // metres away.
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
