"use client"

import { useLayoutEffect, useRef } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"
import { Text } from "@react-three/drei"
import { suspend } from "suspend-react"

import {
  OPTICS_DONE_AT,
  OPTICS_FADE_AT,
  OPTICS_FADE_SECONDS,
  OPTICS_SCAN_AT,
} from "@/config/optics"
import {
  OPTICS_CLASS_COLOR,
  OPTICS_MAX_TARGETS,
  OPTICS_TARGETS,
  type OpticsTarget,
} from "@/config/opticsTargets"
import { opticsRun } from "@/helpers/optics"
import { makeOrientedBox, measureOriented, type OrientedBox } from "@/helpers/orientedBounds"
import { scanUniforms } from "@/lib/optics/scanMaterial"

/** Same font the portal captions and the hotspot labels load, so nothing new
 *  crosses the wire -- Card.tsx and CameraHotspot.tsx already resolve this
 *  module-level promise, and troika keeps one process-wide SDF atlas, so the
 *  thirteen labels below share one font, one atlas and one shader. */
const labelFont = import("@pmndrs/assets/fonts/inter_medium.woff")

/** A closed box: four edges along each axis. */
const EDGES_PER_BOX = 12
const CAP = OPTICS_MAX_TARGETS * EDGES_PER_BOX

/** Stroke weight in CSS PIXELS, not world units. A fixed world thickness reads
 *  as a hairline on the near beach ball and a girder on a far island; these
 *  are overlay graphics and have to weigh the same everywhere. */
const LINE_PX = 1.0

/** How far the box starts outside its target, as a share of its own size. It
 *  contracts on as it locks, which is the one bit of the cursor's bracket
 *  idiom worth keeping now the corners are gone. */
const LOCK_OVERSHOOT = 0.06

/** How long a box takes to lock on. */
const POP_SECONDS = 0.22

/** Below this a cloud has been ducked out of the way by the survey (see
 *  OPTICS_CLOUD_DUCK_RADIUS) and must not be boxed -- a wireframe hanging in
 *  empty air is worse than no wireframe.
 *
 *  A threshold rather than a zero test, because Sky.tsx's 0.1-per-frame lerp
 *  decays as 0.9^n and asymptotes: it reaches ~0.04 after thirty frames and
 *  never actually arrives. */
const DUCKED_BELOW = 0.12

const CLASS_COLOR = /*@__PURE__*/ (() =>
  Object.fromEntries(
    Object.entries(OPTICS_CLASS_COLOR).map(([k, v]) => [k, new THREE.Color(v)]),
  ) as Record<string, THREE.Color>)()

/** Frame-loop scratch, at MODULE scope.
 *
 *  Nothing may allocate inside useFrame -- the rule is stated at
 *  Environment.tsx:412 and OceanWater.ts:367 -- and a useMemo'd object would
 *  satisfy that but not react-hooks/immutability, which treats a value
 *  returned from a hook as read-only. Sky.tsx records the same finding and
 *  reaches for a ref; module scope is the form the rest of this codebase uses
 *  (cameraBase.ts, sunTracker.ts, Sky.tsx's HOVER_COLOR).
 *
 *  Safe because exactly one DetectionBrackets is ever mounted: Scene.tsx
 *  renders it once, outside the island group. */
const scratch = {
  centre: new THREE.Vector3(),
  size: new THREE.Vector3(),
  at: new THREE.Vector3(),
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  edgeScale: new THREE.Vector3(),
  m: new THREE.Matrix4(),
  tint: new THREE.Color(),
  boxes: Array.from({ length: OPTICS_MAX_TARGETS }, () => makeOrientedBox()),
}

type Slot = {
  /** Index into OPTICS_TARGETS -- which class, colour and label it belongs to. */
  spec: number
  /** The nodes that make it up. The first gives the oriented frame. */
  nodes: THREE.Object3D[]
  bounds: OrientedBox
  /** World distance from the wave origin to the near face. */
  trigger: number
  pop: number
  hit: boolean
  /** Clouds only: skip while the survey has shrunk this one away. */
  duckable: boolean
}

/** Closed wireframe boxes around whatever the survey finds.
 *
 *  COMPLETE BOXES, NOT CORNER BRACKETS. An earlier version drew eight corners
 *  of three arms each, reasoning from SceneCursor.tsx:159-161 that a closed
 *  ring already means "camera hotspot" in this scene. That reasoning was about
 *  the CURSOR; a detection overlay has its own, older idiom, and twelve edges
 *  instead of twenty-four arms halves the instance count too.
 *
 *  ONE InstancedMesh, ONE DRAW CALL, up to 59 targets. VelocityLines.tsx
 *  settled the underlying question: WebGL ignores lineWidth almost everywhere,
 *  so thin boxes are the only reliable way to draw a line with thickness.
 *  drei's <Line> does honour it but costs a draw call per polyline -- fine for
 *  JourneyPath behind a ?path flag, not for seven hundred edges. */
export function DetectionBrackets() {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const font = suspend(() => labelFont, [labelFont]) as { default: string }

  /** Built at scan time, cleared after. Length varies with how much of the
   *  scene is mounted -- the seagull flock is absent at night. */
  const slots = useRef<Slot[]>([])
  /** Which slot currently owns each spec's label, or -1. One label per config
   *  entry, so the two GROUP entries contribute one each rather than 48. */
  const labelOwner = useRef<number[]>(OPTICS_TARGETS.map(() => -1))
  const labels = useRef<(THREE.Object3D | null)[]>(OPTICS_TARGETS.map(() => null))

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    // Seeded for the WHOLE capacity rather than lazily. instanceColor going
    // null -> non-null forces a program change, and that recompile belongs
    // behind the loading plate, not on the first frame a box appears.
    for (let i = 0; i < CAP; i++) m.setColorAt(i, CLASS_COLOR.object)
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.count = 0
  }, [])

  useFrame((_state, delta) => {
    const m = mesh.current
    if (!m) return

    const t = opticsRun.t
    const scanning = t >= OPTICS_SCAN_AT && t < OPTICS_DONE_AT

    if (!scanning) {
      if (m.count !== 0 || slots.current.length > 0) {
        m.count = 0
        slots.current = []
        for (let i = 0; i < OPTICS_TARGETS.length; i++) {
          labelOwner.current[i] = -1
          const label = labels.current[i]
          if (label) label.visible = false
        }
      }
      return
    }

    // Resolve and measure once, on the first frame of the scan.
    //
    // AT SCAN TIME, NOT AT MOUNT, and config/terrain.ts records at length why:
    // "the models sit behind <Suspense> and the scene animates in, so a mount
    // effect measured an island that was half-arrived and still moving". By
    // now the scene has been settled for seconds -- and the clouds, whose
    // placement is rolled per visit, are long since in place.
    if (slots.current.length === 0) resolve(scene, slots.current)

    // Boxes hold at full strength through the sweep AND the hold, then clear
    // over the same window the wash does, so the overlay and the wave leave
    // together rather than one outliving the other.
    const fade = Math.min(1, Math.max(0, (t - OPTICS_FADE_AT) / OPTICS_FADE_SECONDS))
    const radiusNow = scanUniforms.uScanRadius.value

    // World units per CSS pixel at unit distance, for this frame's lens.
    const lens = camera as THREE.PerspectiveCamera
    const pxToWorld = (2 * Math.tan((lens.fov * Math.PI) / 360)) / size.height

    const array = m.instanceMatrix.array as Float32Array
    let n = 0

    for (let s = 0; s < slots.current.length; s++) {
      const slot = slots.current[s]
      const spec = OPTICS_TARGETS[slot.spec]
      const head = slot.nodes[0]

      // A ducked cloud is invisible; its box would be the only thing left.
      const ducked = slot.duckable && head.scale.x < DUCKED_BELOW

      if (!slot.hit && !ducked && radiusNow >= slot.trigger) slot.hit = true
      const want = slot.hit && !ducked ? 1 - fade : 0
      slot.pop += Math.sign(want - slot.pop) * Math.min(Math.abs(want - slot.pop), delta / POP_SECONDS)

      if (slot.pop <= 0.001) {
        if (labelOwner.current[slot.spec] === s) labelOwner.current[slot.spec] = -1
        continue
      }
      // First eligible instance of this spec claims its label, once. Chosen at
      // reveal rather than per frame so it cannot flicker between the
      // forty-two clouds.
      if (labelOwner.current[slot.spec] === -1) labelOwner.current[slot.spec] = s

      // Refreshed every frame because the targets move: the birds fly, the
      // portals breathe, the clouds bob. The BOX is a shape and is measured
      // once; the matrix is where that shape currently is.
      head.updateWorldMatrix(true, false)
      slot.bounds.matrix.copy(head.matrixWorld)
      slot.bounds.matrix.decompose(scratch.pos, scratch.quat, scratch.edgeScale)

      const box = slot.bounds.box
      const worldScale = slot.bounds.scale
      box.getCenter(scratch.centre)
      box.getSize(scratch.size)

      const shrink = 1 + LOCK_OVERSHOOT * (1 - slot.pop)

      // Screen-constant stroke: a world length w at distance z subtends
      // w / (2 z tan(fov/2)) * H pixels, so invert for w.
      scratch.at.copy(scratch.centre).applyMatrix4(slot.bounds.matrix)
      const thickness = LINE_PX * pxToWorld * scratch.at.distanceTo(camera.position)

      // Brightness carries the reveal, because a closed box cannot grow out of
      // its own corner the way the old arms did. instanceColor multiplies the
      // material's white, so this IS the final colour.
      scratch.tint.copy(CLASS_COLOR[spec.cls]).multiplyScalar(slot.pop)

      // Twelve edges: four along each axis, at the four combinations of the
      // other two axes' faces.
      for (let axis = 0; axis < 3; axis++) {
        const u = (axis + 1) % 3
        const v = (axis + 2) % 3
        const lengthWorld = scratch.size.getComponent(axis) * shrink * worldScale

        for (let k = 0; k < 4; k++) {
          if (n >= CAP) break
          scratch.at.copy(scratch.centre)
          scratch.at.setComponent(
            u,
            scratch.centre.getComponent(u) +
              (k & 1 ? 1 : -1) * scratch.size.getComponent(u) * 0.5 * shrink,
          )
          scratch.at.setComponent(
            v,
            scratch.centre.getComponent(v) +
              (k & 2 ? 1 : -1) * scratch.size.getComponent(v) * 0.5 * shrink,
          )
          // Into the world through the frame's matrix -- which is what makes
          // these oriented boxes rather than axis-aligned ones, and why the
          // surfboard's cage leans with the board.
          scratch.at.applyMatrix4(slot.bounds.matrix)

          scratch.edgeScale.set(thickness, thickness, thickness)
          scratch.edgeScale.setComponent(axis, lengthWorld)

          scratch.m.compose(scratch.at, scratch.quat, scratch.edgeScale)
          scratch.m.toArray(array, n * 16)
          m.setColorAt(n, scratch.tint)
          n++
        }
      }

      // Only the slot holding this spec's label places it.
      const label = labels.current[slot.spec]
      if (label && labelOwner.current[slot.spec] === s) {
        scratch.at
          .set(scratch.centre.x, box.max.y, scratch.centre.z)
          .applyMatrix4(slot.bounds.matrix)
        label.position.copy(scratch.at)
        label.position.y += thickness * 22
        label.quaternion.copy(camera.quaternion)
        // Scaled so the type holds a constant screen size, the same trick the
        // stroke uses. A fully faded label still costs a draw call, so it is
        // switched off rather than left at zero opacity.
        const d = label.position.distanceTo(camera.position)
        label.scale.setScalar(d * pxToWorld * 13)
        label.visible = slot.pop > 0.35
      }
    }

    // Labels whose owner vanished this frame.
    for (let i = 0; i < OPTICS_TARGETS.length; i++) {
      const label = labels.current[i]
      if (label && labelOwner.current[i] === -1) label.visible = false
    }

    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return (
    <>
      {/* NO PARENT TRANSFORM, and that is load-bearing: every matrix written
          above is already world-space. Parenting this under the island group
          would apply its scale-3 / rotate-100deg chain a second time. */}
      <instancedMesh
        ref={mesh}
        name="optics-brackets"
        args={[undefined, undefined, CAP]}
        frustumCulled={false}
        renderOrder={990}
      >
        <boxGeometry args={[1, 1, 1]} />
        {/* depthTest off and a high renderOrder, the same treatment
            CameraHotspot gives its markers: a box is a readout about an
            object, not a thing standing next to it, so a palm frond must not
            cut it in half.

            color white because instanceColor MULTIPLIES it, so the per-class
            tint above is the whole colour. */}
        <meshBasicMaterial
          color="#ffffff"
          transparent
          depthWrite={false}
          depthTest={false}
        />
      </instancedMesh>
      {/* One per CONFIG entry, not per target: thirteen, against fifty-nine
          boxes. The two group entries contribute one label each. */}
      {OPTICS_TARGETS.map((spec, i) => !spec.label ? null : (
        <object3D
          key={spec.id}
          visible={false}
          ref={(node) => {
            labels.current[i] = node
          }}
        >
          <Text
            font={font.default}
            fontSize={1}
            anchorX="center"
            anchorY="bottom"
            letterSpacing={0.08}
            color={OPTICS_CLASS_COLOR[spec.cls]}
            outlineWidth={0.08}
            outlineColor="#0b1b25"
            material-transparent
            material-depthTest={false}
            material-depthWrite={false}
            renderOrder={991}
          >
            {spec.label.toUpperCase()}
          </Text>
        </object3D>
      ))}
    </>
  )
}

/** Turn the config table into live slots.
 *
 *  Anything that cannot be found is skipped rather than erroring: the seagull
 *  flock unmounts at night and leaves its named group childless, and a GLB
 *  that changes a node name should cost one box rather than the overlay. */
function resolve(scene: THREE.Scene, out: Slot[]) {
  let boxIndex = 0
  const take = (spec: OpticsTarget, si: number, nodes: THREE.Object3D[], duckable: boolean) => {
    if (boxIndex >= OPTICS_MAX_TARGETS || nodes.length === 0) return
    const bounds = scratch.boxes[boxIndex]
    if (spec.box) {
      // Authored. Still needs the node, for its world matrix and scale -- the
      // box says what shape the thing is, the node says where it currently is.
      nodes[0].updateWorldMatrix(true, false)
      bounds.box.min.fromArray(spec.box.min)
      bounds.box.max.fromArray(spec.box.max)
      bounds.matrix.copy(nodes[0].matrixWorld)
      bounds.scale = Math.max(1e-6, nodes[0].matrixWorld.getMaxScaleOnAxis())
    } else if (!measureOriented(nodes, bounds)) {
      return
    }
    if (spec.pad) bounds.box.expandByScalar(spec.pad / bounds.scale)

    bounds.box.getCenter(scratch.centre).applyMatrix4(bounds.matrix)
    const radius = bounds.box.getSize(scratch.size).length() * 0.5 * bounds.scale
    out.push({
      spec: si,
      nodes,
      bounds,
      trigger: Math.max(0, scanUniforms.uScanOrigin.value.distanceTo(scratch.centre) - radius),
      pop: 0,
      hit: false,
      duckable,
    })
    boxIndex++
  }

  for (let si = 0; si < OPTICS_TARGETS.length; si++) {
    const spec = OPTICS_TARGETS[si]

    if (spec.group === "clouds") {
      // clouds-low / clouds-high -> the <Instances> InstancedMesh -> one
      // wrapper group per cloud -> the <Instance> itself. The matrix has to
      // come from the Instance: the wrapper holds world position and yaw, the
      // Instance holds the bob and the survey's duck scale, and only its
      // matrixWorld composes both.
      for (const ringName of ["clouds-low", "clouds-high"]) {
        const ring = scene.getObjectByName(ringName)
        if (!ring) continue
        for (const instanced of ring.children) {
          for (const wrapper of instanced.children) {
            const instance = wrapper.children[0]
            if (instance) take(spec, si, [instance], true)
          }
        }
      }
    } else if (spec.group === "birds") {
      // The flock's five are unnamed, so they are reached positionally. At
      // night the group is childless and this contributes nothing.
      const flock = scene.getObjectByName("birds-flock")
      if (flock) for (const bird of flock.children) take(spec, si, [bird], false)
      const gull = scene.getObjectByName("birds-gull")
      if (gull) take(spec, si, [gull], false)
    } else {
      const names = spec.nodes ?? (spec.node ? [spec.node] : [])
      const nodes: THREE.Object3D[] = []
      for (const name of names) {
        const node = scene.getObjectByName(name)
        if (node) nodes.push(node)
      }
      take(spec, si, nodes, false)
    }
  }
}
