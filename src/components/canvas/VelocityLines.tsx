"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { skyScroll } from "@/helpers/skyScroll"
import {
  CORRIDOR_TRAVEL_PER_OFFSET,
  STREAK_CLEAR,
  STREAK_COUNT,
  STREAK_DEPTH,
  STREAK_FULL_SPEED,
  STREAK_MAX_LENGTH,
  STREAK_SPAN,
  STREAK_SPREAD,
} from "@/config/paperSky"

/** The speed streaks -- the white lines that make the sky read as travelled at
 *  pace rather than drifted through.
 *
 *  One InstancedMesh, so the whole field is a single draw call whatever
 *  STREAK_COUNT says. Each instance is a unit quad scaled along Z into a
 *  streak, laid out in a cylinder around the corridor axis.
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
 *  DRAWN IN THE CAMERA'S OWN SPACE, and that is the difference from the first
 *  version. They were placed in the flight frame, on a cylinder around its
 *  axis, which gave two faults at once: a cylinder seen end-on reads as a ring
 *  rather than a field, and the frame turns, so the whole ring appeared to
 *  swing whenever the camera leaned. The note was "it appears to be a circle,
 *  and it changes direction based on the camera -- it should all be facing
 *  towards the front always". Hung off the camera, every streak points down
 *  the view axis by construction and nothing the camera does can tilt them.
 *
 *  What still comes from the journey is the only thing that should: how fast
 *  they move and how long they are. */
export function VelocityLines() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const materialRef = useRef<THREE.MeshBasicMaterial>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  // Created lazily in the frame loop, not by useMemo: these are written every
  // frame, and a value produced by useMemo arrives through render, which
  // react-hooks/immutability will not have mutated.
  const axesRef = useRef<{ right: THREE.Vector3; up: THREE.Vector3; forward: THREE.Vector3 } | null>(null)

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
    material.opacity = 0.5 * intensity

    const camera = state.camera
    const axes = (axesRef.current ??= {
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      forward: new THREE.Vector3(),
    })
    // Straight off the camera's matrix, so they follow it exactly -- including
    // the lean, which is the point: the streaks stay put on screen while the
    // world behind them turns.
    axes.right.setFromMatrixColumn(camera.matrixWorld, 0)
    axes.up.setFromMatrixColumn(camera.matrixWorld, 1)
    axes.forward.setFromMatrixColumn(camera.matrixWorld, 2).negate()

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
      // instead of bunching toward the middle as it recedes.
      dummy.position
        .copy(camera.position)
        .addScaledVector(axes.forward, depth)
        .addScaledVector(axes.right, seed.u * depth * tanH)
        .addScaledVector(axes.up, seed.v * depth * tanV)
      dummy.quaternion.copy(camera.quaternion)
      // Stretched along the view axis only. The streak is the smear of a point
      // passing the camera, so its length is the distance it covers in roughly
      // one frame of perceived motion -- hence scaling with speed. Scaled with
      // depth as well, or the far ones are specks and the near ones bars.
      const scale = depth / STREAK_DEPTH[1]
      dummy.scale.set(
        0.06 * scale,
        0.06 * scale,
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
