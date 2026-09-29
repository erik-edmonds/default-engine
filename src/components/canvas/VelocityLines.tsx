"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { skyScroll } from "@/helpers/skyScroll"
import {
  CAMERA_BEHIND,
  flightBasis,
  makeFlightBasis,
  placeInFlightFrame,
  VIEW_PITCH,
  viewAxisUp,
} from "@/config/flightFrame"
import { corridorOrigin } from "@/config/skyJourney"
import {
  CORRIDOR_TRAVEL_PER_OFFSET,
  STREAK_CLEAR,
  STREAK_COUNT,
  STREAK_DEPTH,
  STREAK_FULL_SPEED,
  STREAK_OPACITY,
  STREAK_MAX_LENGTH,
  STREAK_SPAN,
  STREAK_SPREAD,
} from "@/config/paperSky"

/** The speed streaks -- the white lines that make the sky read as travelled at
 *  pace rather than drifted through.
 *
 *  One InstancedMesh, so the whole field is a single draw call whatever
 *  STREAK_COUNT says. Each instance is a thin box scaled along Z into a
 *  streak, laid out over the frame's rectangle -- see below, it was a
 *  cylinder once and that was the bug.
 *
 *  Everything about them is driven by skyScroll.speed, which is why they sell
 *  motion: at rest they are not drawn at all, and their length and opacity both
 *  grow with how fast you are actually scrolling. A constant starfield of
 *  streaks reads as decoration; one that appears when you move and thins out
 *  when you stop reads as speed.
 *
 *  They travel with the scroll like the props do, and wrap on the same modulo,
 *  so a streak is never seen to appear or disappear -- it is always somewhere
 *  in the field.
 *
 *  A RECTANGLE IN THE FLIGHT FRAME. Both halves of that matter, and they come
 *  from two different reports that pull in opposite directions until you
 *  separate the field's SHAPE from what it is ANCHORED TO.
 *
 *  The first version laid them on a cylinder around the flight axis, and a
 *  cylinder seen end-on reads as a ring: "it appears to be a circle, and it
 *  changes direction based on the camera -- it should all be facing towards
 *  the front always". The fix for the ring was to place each streak by where
 *  it should land ON SCREEN and push it out to its depth, which fills the
 *  frame evenly at every distance. That part was right and is kept.
 *
 *  The fix for the second half was not. Hanging the whole field off the
 *  camera's matrix did stop it swinging relative to the frame -- by welding it
 *  to the frame, so the streaks yawed bodily with every lean and the sky's
 *  sense of direction went with them: "the velocity lines also move with the
 *  camera, it shouldn't. It should continue looking forward."
 *
 *  They are the wind down the corridor. The corridor does not turn when the
 *  camera glances at a paragraph, so neither do these: the rectangle is built
 *  on the FLIGHT basis and every streak is rotated to the heading, not to the
 *  camera. Lean, and they hold their line and slide across the frame like
 *  everything else in the scene -- which is the only reason the lean reads as
 *  a camera move at all. A field pinned to the lens cannot show you that the
 *  lens moved.
 *
 *  Two consequences worth naming:
 *
 *  - STREAK_SPREAD has to cover more than the square-on frame now, because a
 *    leaning camera sees a frustum the field no longer follows. Measured: the
 *    lean puts the look target 0.55 to the side over CAMERA_BEHIND 6.3, about
 *    6.8 degrees against a 29.5-degree half-angle, so the far edge needs
 *    coverage out to tan(29.5+6.8)/tan(29.5) = 1.29 of the square-on frame.
 *  - the clear patch in the middle is better off than it was. It is a hole in
 *    the FLIGHT frame, and the subject sits on the flight axis, so it tracks
 *    him exactly. Camera-locked, the hole stayed centred in the frame while
 *    the subject slid out of it under the lean.
 *
 *  What still comes from the journey is what always should have: how fast they
 *  move and how long they are. */
export function VelocityLines() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  // Created lazily in the frame loop, not by useMemo: these are written every
  // frame, and a value produced by useMemo arrives through render, which
  // react-hooks/immutability will not have mutated.
  const basisRef = useRef<ReturnType<typeof makeFlightBasis> | null>(null)
  const originRef = useRef<{ x: number; y: number; z: number } | null>(null)

  /** Fixed per-instance scatter, generated once, over the FRAME. */
  const seeds = useMemo(() => {
    const out: { u: number; v: number; phase: number; length: number }[] = []
    // A plastic (R2) sequence rather than random: at this count uniform random
    // leaves visible clumps and bald patches, and a grid reads as a grid.
    let ax = 0.5
    let ay = 0.5
    for (let i = 0; out.length < STREAK_COUNT && i < STREAK_COUNT * 6; i++) {
      ax = (ax + 0.7548776662466927) % 1
      ay = (ay + 0.5698402909980532) % 1
      const u = (ax * 2 - 1) * STREAK_SPREAD
      const v = (ay * 2 - 1) * STREAK_SPREAD
      // The subject keeps its own patch of sky clear.
      if (Math.abs(u) < STREAK_CLEAR[0] && Math.abs(v) < STREAK_CLEAR[1]) continue
      out.push({
        u,
        v,
        phase: (out.length + 0.5) / STREAK_COUNT * STREAK_SPAN,
        // Varied so the field has depth rather than reading as one comb.
        length: 0.45 + ((out.length * 7919) % 100) / 100 * 0.55,
      })
    }
    return out
  }, [])

  useFrame((state) => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!mesh || !material) return

    const speed = Math.abs(skyScroll.speed)
    const intensity = THREE.MathUtils.clamp(speed / STREAK_FULL_SPEED, 0, 1)

    // Below a tenth of full speed there is nothing to convey; drawing faint
    // streaks over a still sky just dirties it.
    if (intensity < 0.1) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    material.opacity = STREAK_OPACITY * intensity

    const camera = state.camera
    // THE CORRIDOR'S OWN AXES, not the camera's. See the note above: the
    // camera's matrix carries the lean, and the lean is the one thing these
    // must not inherit.
    const basis = (basisRef.current ??= makeFlightBasis())
    const origin = (originRef.current ??= { x: 0, y: 0, z: 0 })
    flightBasis(skyScroll.display, basis)
    corridorOrigin(skyScroll.display, origin)
    const heading = Math.atan2(basis.fx, basis.fz)

    const perspective = camera as THREE.PerspectiveCamera
    const tanV = Math.tan(((perspective.fov ?? 50) * Math.PI) / 360)
    const tanH = tanV * (perspective.aspect ?? 1.6)

    const travelled = skyScroll.display * CORRIDOR_TRAVEL_PER_OFFSET
    const direction = Math.sign(skyScroll.speed) || 1
    const span = STREAK_DEPTH[1] - STREAK_DEPTH[0]

    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i]
      // Same wrap as the props: a modulo, so scrolling backwards behaves.
      const depth = STREAK_DEPTH[0] + (((seed.phase - travelled) % span) + span) % span
      // Placed by where it should appear ON SCREEN, then pushed out to its
      // depth -- so the field covers the frame evenly at every distance
      // instead of bunching toward the middle as it recedes. The screen
      // offsets are scaled by the distance FROM THE CAMERA, which is what
      // sets the angle; the frame's own coordinate is measured from the
      // avatar, hence the CAMERA_BEHIND between them.
      const ahead = depth - CAMERA_BEHIND
      placeInFlightFrame(
        basis,
        origin,
        ahead,
        seed.u * depth * tanH,
        viewAxisUp(ahead) + seed.v * depth * tanV,
        dummy.position,
      )
      // Along the heading, AND down the view axis's pitch.
      //
      // The yaw is the whole point and is taken from the flight, not the
      // camera. The PITCH has to be taken as well, and leaving it out was a
      // real error rather than a rounding one: the corridor's contents are
      // placed on the view axis (see viewAxisUp), which descends 8.13
      // degrees, so in camera space a prop travels straight down +Z at
      // constant x and y. A streak is the smear of exactly that motion, so it
      // must lie along the same line -- laid out flat instead, every streak
      // sat at 8 degrees to the path it was supposed to be tracing, and the
      // field converged on a point 8 degrees off the one being flown at.
      // Measured at 0.9899 against the view axis with the camera square,
      // where it should read 1.0000; 0.9899 is cos(8.13) precisely.
      //
      // Order YXZ so the pitch is applied in the yawed frame rather than in
      // world axes -- with the default XYZ the two interact and the streak
      // skews as the heading turns.
      dummy.rotation.set(VIEW_PITCH, heading, 0, "YXZ")
      // Stretched along the view axis only. The streak is the smear of a point
      // passing the camera, so its length is the distance it covers in roughly
      // one frame of perceived motion -- hence scaling with speed. Scaled with
      // depth as well, or the far ones are specks and the near ones bars.
      const scale = depth / STREAK_DEPTH[1]
      dummy.scale.set(
        0.045 * scale,
        0.045 * scale,
        STREAK_MAX_LENGTH * seed.length * intensity * direction * scale,
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    // Named, like the paper world's other nodes: the scene holds several
    // instanced meshes and "the last visible one" found whichever happened to
    // be drawn, which is not a way to identify anything.
    <instancedMesh
      ref={meshRef}
      name="velocity-lines"
      args={[undefined, undefined, STREAK_COUNT]}
      frustumCulled={false}
    >
      {/* A unit box rather than a line: lines cannot be thickened reliably
          across platforms (WebGL ignores lineWidth almost everywhere), and a
          thin box instances just as cheaply. */}
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        ref={materialRef}
        color="#ffffff"
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  )
}
