"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, Suspense } from "react"
import * as THREE from "three"
import type { Group, Mesh, Object3D } from "three"
import gsap from "gsap"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"
import { AVATAR_BASE_POSITION, SKY_SCROLL_SMOOTH_TIME, avatarSkyPose } from "@/config/skyJourney"
import { tweenDuration, prefersReducedMotion } from "@/helpers/motion"
import { pointerState } from "@/helpers/cursor"
import { useCoarsePointer } from "@/helpers/useCoarsePointer"
import { Avatar } from "@/components/models/Avatar"
import { Dragonite, type DragoniteHandle } from "@/components/models/Dragonite"

/** The choreography lives in config/skyJourney.ts now, shared with the camera.
 *  It used to be defined here and nowhere else, which meant CameraController
 *  had no way to read the path it was supposed to be framing -- and the caption
 *  thresholds in app/page.tsx were a second, unchecked statement of the same
 *  axis. One table, so they cannot drift. */
const BASE_POSITION = AVATAR_BASE_POSITION
const BASE_ROTATION: [number, number, number] = [0, 0, 0]

export interface AvatarControllerHandle {
  spinAndTransform: (target: ModelKind) => Promise<void>
  materializeDragonite: () => Promise<void>
  flyUp: () => Promise<void>
  beginSkyJourney: () => void
  setSkyOffset: (offsetZ: number) => void
  returnHome: () => Promise<void>
}

export type ModelKind = "base" | "dragonite"


// A small ambient sway layered on top of the choreographed Y position so
// the avatar reads as alive (gently hovering) rather than frozen during the
// held pose, without being noticeable against the larger directed motion
// elsewhere in the journey.
const SKY_IDLE_BOB_AMPLITUDE = 0.06
const SKY_IDLE_BOB_SPEED = 0.7

// How far the gaze swings at the very edge of the screen. Generous compared
// with the camera's own 4/3 degrees, because this is a person noticing you
// rather than a parallax hint -- but still short of the ~35 degrees a real neck
// manages before the shoulders come with it.
const GAZE_MAX_YAW = THREE.MathUtils.degToRad(25)
const GAZE_MAX_PITCH = THREE.MathUtils.degToRad(15)
// Slower than the camera's 0.25s. A head that tracks the cursor exactly reads
// as a turret; the lag is most of what makes it read as attention.
const GAZE_SMOOTH_TIME = 0.35
const MAX_DELTA = 1 / 30
// Split across the two bones so the turn travels up the neck instead of the
// skull pivoting on a fixed neck. Sums to 1.
const NECK_SHARE = 0.34
const HEAD_SHARE = 0.66

const WORLD_UP = new THREE.Vector3(0, 1, 0)
// The head bone's gaze axis is its local +Z, and at rest that maps to world
// +Z -- i.e. the avatar looks out of the screen, straight back at the island
// camera sitting at z = +14.6. The avatar group's own +Z is the same
// direction, which is why `facing` below can be read off the group instead of
// the bone. (Composed from the GLB's rest rotations down the chain
// root > pelvis > spine_01..03 > neck_01 > head; local +Z lands on
// (-0.18, -0.13, 0.98).)
const AVATAR_FORWARD = new THREE.Vector3(0, 0, 1)

/** What we last wrote into a bone, and the pose we found before writing it. */
type GazeStore = { base: THREE.Quaternion; written: THREE.Quaternion; active: boolean }

const makeGazeStore = (): GazeStore => ({
  base: new THREE.Quaternion(),
  written: new THREE.Quaternion(),
  active: false,
})

/** Rotate a bone by `worldDelta`, expressed in WORLD space, on top of whatever
 *  pose it is already holding.
 *
 *  Two things this has to survive, both of which quietly break the obvious
 *  implementations:
 *
 *  1. The idle clip animates `head`'s rotation. Assigning a rotation (copy, or
 *     lookAt) therefore fights the mixer and kills the idle; and lookAt is
 *     wrong anyway, because the head's rest rotation is about -23 degrees on
 *     local X, so aiming its +Z at anything points the face at the floor.
 *     Composing a delta on top of the animated pose keeps the idle intact and
 *     needs no knowledge of the rig's rest orientation.
 *
 *  2. `neck_01` may have NO animation channel, in which case nothing resets it
 *     between frames and a naive per-frame compose accumulates -- a head that
 *     slowly spins all the way round. So we remember exactly what we wrote; if
 *     the bone still holds it, nothing else has touched it and we restore the
 *     pose we found first. If it does not, the mixer rewrote it and that fresh
 *     value is the pose to build on. Exact float comparison is safe here
 *     precisely because it is our own value, copied out unmodified.
 *
 *  World -> local conversion is the standard conjugation: for world W = P * L,
 *  wanting W' = D * W gives L' = (P^-1 * D * P) * L. Doing it this way rather
 *  than assuming which local axis is "up" is what makes it independent of the
 *  rig's bone-axis convention. */
function applyGaze(bone: Object3D, store: GazeStore, worldDelta: THREE.Quaternion, parentWorld: THREE.Quaternion, localDelta: THREE.Quaternion) {
  if (store.active && bone.quaternion.equals(store.written)) bone.quaternion.copy(store.base)
  store.base.copy(bone.quaternion)

  if (bone.parent) {
    // Recomputes the ancestor chain, so applying this to the neck first and
    // the head second means the head sees the neck's already-turned frame.
    bone.parent.getWorldQuaternion(parentWorld)
    localDelta.copy(parentWorld).invert().multiply(worldDelta).multiply(parentWorld)
  } else {
    localDelta.copy(worldDelta)
  }

  bone.quaternion.premultiply(localDelta)
  store.written.copy(bone.quaternion)
  store.active = true
}

export const AvatarController = forwardRef<AvatarControllerHandle>((_props, ref) => {
  const group = useRef<Group>(null)
  const [modelKind, setModelKind] = useState<ModelKind>("base")
  const skyBaseY = useRef(0)
  const targetSkyOffset = useRef(0)
  const displaySkyOffset = useRef(0)
  const isSkyJourneyActive = useRef(false)
  const skyBobSeed = useMemo(() => Math.random() * Math.PI * 2, [])
  const dragoniteInstanceRef = useRef<DragoniteHandle | null>(null)
  const materializeResolveRef = useRef<(() => void) | null>(null)
  const isCoarsePointer = useCoarsePointer()
  const headBone = useRef<Object3D | null>(null)
  const neckBone = useRef<Object3D | null>(null)
  const gaze = useRef({ yaw: 0, pitch: 0 })
  const gazeScratch = useMemo(
    () => ({
      neck: makeGazeStore(),
      head: makeGazeStore(),
      worldDelta: new THREE.Quaternion(),
      yawQuat: new THREE.Quaternion(),
      pitchQuat: new THREE.Quaternion(),
      parentWorld: new THREE.Quaternion(),
      localDelta: new THREE.Quaternion(),
      right: new THREE.Vector3(),
      facing: new THREE.Vector3(),
      camForward: new THREE.Vector3(),
    }),
    [],
  )

  // Starts materialize() the moment BOTH a pending request and a mounted
  // Dragonite instance exist, whichever arrives second. This used to be a
  // useEffect keyed on [modelKind], which only gets one chance to run right
  // after modelKind flips -- if Dragonite was still Suspense-suspended
  // (glb not finished loading/parsing yet) at that exact moment, the ref
  // was null, the effect silently gave up and resolved immediately, and
  // materialize() never ran at all -- confirmed live: the avatar skipped
  // straight to its real texture with no white phase, and the "hold"
  // duration below never had any effect because it was never reached. A
  // ref *callback* (passed to Dragonite below) fires the instant the real
  // instance actually attaches, however late Suspense makes that -- no
  // missed window.
  const tryStartMaterialize = () => {
    if (dragoniteInstanceRef.current && materializeResolveRef.current) {
      const resolve = materializeResolveRef.current
      materializeResolveRef.current = null
      dragoniteInstanceRef.current.materialize().then(resolve)
    }
  }
  const setDragoniteRef = (instance: DragoniteHandle | null) => {
    dragoniteInstanceRef.current = instance
    tryStartMaterialize()
  }

  // None of the tweens below were ever killed, so unmounting mid-flight left
  // gsap writing into a disposed group's transform on its global ticker.
  useEffect(() => () => {
    if (!group.current) return
    gsap.killTweensOf(group.current.position)
    gsap.killTweensOf(group.current.rotation)
    gsap.killTweensOf(group.current.scale)
  }, [])

  useImperativeHandle(ref, () => ({
    spinAndTransform: (target: ModelKind) =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap
          .timeline({ onComplete: () => resolve() })
          .to(group.current.rotation, { y: "+=" + Math.PI, duration: tweenDuration(0.5), ease: "power1.in" })
          .call(() => setModelKind(target))
          .to(group.current.rotation, { y: "+=" + Math.PI, duration: tweenDuration(0.5), ease: "power1.out" })
      }),
    // Instant swap, no spin: the avatar becomes Dragonite immediately
    // (rendering fully white -- see Dragonite.tsx's uProgress default),
    // then its real material wipes in. Resolves once that wipe finishes.
    materializeDragonite: () =>
      new Promise<void>((resolve) => {
        materializeResolveRef.current = resolve
        setModelKind("dragonite")
        // Covers Dragonite already being mounted (e.g. materializing again
        // without an intervening unmount) -- the ref callback only fires on
        // attach/detach, not on every re-render, so it wouldn't fire again
        // here on its own.
        tryStartMaterialize()
      }),
    flyUp: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap.to(group.current.position, {
          y: "+=100",
          duration: tweenDuration(5),
          ease: "power2.inOut",
          onComplete: () => resolve(),
          // Resolved on interrupt too: the unmount cleanup below kills these,
          // and a killed tween never fires onComplete -- which would leave
          // page.tsx awaiting a promise that can no longer settle.
          onInterrupt: () => resolve(),
        })
      }),
    beginSkyJourney: () => {
      if (group.current) skyBaseY.current = group.current.position.y
      isSkyJourneyActive.current = true
    },
    setSkyOffset: (offset: number) => {
      targetSkyOffset.current = offset
    },
    // Reverses beginSkyJourney: stops the per-frame sky-journey latch first
    // so it can't fight this tween, then glides position and rotation back
    // to the resting pose together (safe to run concurrently -- unlike
    // spinAndTransform, this never touches rotation.y independently of this
    // same tween). Deliberately does NOT also revert the model to "base"
    // here: spinAndTransform drives rotation.y itself via relative +=
    // tweens, so it needs rotation.y to already be at a known baseline
    // before it runs -- the caller runs it sequentially, after this
    // resolves, not concurrently with it.
    returnHome: () =>
      new Promise<void>((resolve) => {
        isSkyJourneyActive.current = false
        targetSkyOffset.current = 0
        displaySkyOffset.current = 0
        if (!group.current) {
          resolve()
          return
        }
        const duration = tweenDuration(2.5)
        gsap.to(group.current.position, {
          x: BASE_POSITION[0],
          y: BASE_POSITION[1],
          z: BASE_POSITION[2],
          duration,
          ease: "power2.inOut",
          onComplete: () => resolve(),
          // Resolved on interrupt too: the unmount cleanup below kills these,
          // and a killed tween never fires onComplete -- which would leave
          // page.tsx awaiting a promise that can no longer settle.
          onInterrupt: () => resolve(),
        })
        gsap.to(group.current.rotation, {
          x: BASE_ROTATION[0],
          y: BASE_ROTATION[1],
          z: BASE_ROTATION[2],
          duration,
          ease: "power2.inOut",
        })
      }),
    // moveToIslandEdge and diveUnderwater lived here -- the walk to the
    // shoreline and the hop-and-descend that took the avatar under. Removed
    // with the dive itself; /portfolio is entered through the Models portal
    // now, so nothing choreographs a departure from the island any more.
  }))

  // Drives the sky-journey pose every frame instead of setSkyOffset applying
  // it instantly -- damping the offset itself (same technique, and the same
  // smooth time, as CameraHelpers.tsx's Rig) is what makes scrolling feel
  // weighted rather than a raw 1:1 input mapping. Gated on
  // isSkyJourneyActive so this doesn't fight the GSAP tweens above
  // (spinAndTransform/flyUp/etc.) before the journey has even started, or
  // returnHome's tween once the journey ends -- returnHome flips this back
  // to false as its first step, specifically so it can safely take over
  // position/rotation without this loop overwriting them.
  useFrame((state, delta) => {
    if (!isSkyJourneyActive.current || !group.current) return

    const reduced = prefersReducedMotion()
    if (reduced) {
      displaySkyOffset.current = targetSkyOffset.current
    } else {
      easing.damp(displaySkyOffset, "current", targetSkyOffset.current, SKY_SCROLL_SMOOTH_TIME, delta)
    }

    const offset = displaySkyOffset.current
    const pose = avatarSkyPose(offset)
    const idleBob = reduced ? 0 : Math.sin(state.clock.elapsedTime * SKY_IDLE_BOB_SPEED + skyBobSeed) * SKY_IDLE_BOB_AMPLITUDE

    group.current.position.x = pose.x
    group.current.position.y = skyBaseY.current + pose.yOffset + idleBob
    group.current.position.z = pose.z
    group.current.rotation.y = pose.rotY
  })

  // The avatar notices you: the head (and a third of the turn, the neck) tracks
  // the cursor, on top of whatever the idle clip is already doing.
  //
  // Priority 0.5 rather than the default 0, and this is the difference between
  // working and silently doing nothing. useAnimations' mixer runs at 0, and
  // <Avatar> mounts inside the <Suspense> below -- so its subscription lands
  // AFTER this component's, and at equal priority r3f runs them in subscription
  // order. Every write here would be overwritten by the mixer in the same
  // frame. A fractional priority is the only slot that lands after every
  // priority-0 writer and still before the EffectComposer renders at 1.
  //
  // Desktop only. There is no hovering pointer to follow on touch (the
  // gyroscope is the equivalent there, and a separate pass), and pointerState
  // is only ever populated by SceneCursor, which mounts under the same
  // condition -- so this is belt and braces, not the only gate.
  useFrame((state, delta) => {
    const head = headBone.current
    if (!head || isCoarsePointer || prefersReducedMotion()) return

    const engaged = pointerState.seen && pointerState.inWindow
    const ndcX = engaged ? (pointerState.x / state.size.width) * 2 - 1 : 0
    const ndcY = engaged ? 1 - (pointerState.y / state.size.height) * 2 : 0

    // Which way a world-space turn moves the gaze ON SCREEN depends on whether
    // the head is facing the camera or facing with it. The avatar faces the
    // viewer, so its gaze runs anti-parallel to the camera's -- and the very
    // same delta that pans the camera right swings the head left. That is not a
    // sign typo to flip once; it reverses again if the camera flies round to
    // the far side. So take it from the geometry: `facing` is the avatar's own
    // forward, `gain` is -1 when it looks with the camera and +1 when it looks
    // into it, easing continuously through the side-on case where "screen left"
    // is not a rotation the head can express at all.
    //
    // Read off the avatar GROUP, not the head bone: the bone already carries
    // last frame's delta, which would feed back into the term that produced it.
    gazeScratch.camForward.set(0, 0, -1).applyQuaternion(state.camera.quaternion)
    gazeScratch.facing.copy(AVATAR_FORWARD)
    if (group.current) gazeScratch.facing.applyQuaternion(group.current.getWorldQuaternion(gazeScratch.parentWorld))
    const gain = -Math.max(-1, Math.min(1, gazeScratch.facing.dot(gazeScratch.camForward)))

    const dt = Math.min(delta, MAX_DELTA)
    easing.damp(gaze.current, "yaw", gain * ndcX * GAZE_MAX_YAW, GAZE_SMOOTH_TIME, dt)
    easing.damp(gaze.current, "pitch", -gain * ndcY * GAZE_MAX_PITCH, GAZE_SMOOTH_TIME, dt)

    // Yaw about world up so the head can never roll; pitch about the camera's
    // own right axis, which is a screen-space direction, so "cursor higher"
    // means "look higher" wherever the camera has been flown to.
    gazeScratch.right.set(1, 0, 0).applyQuaternion(state.camera.quaternion)

    const neck = neckBone.current
    if (neck) {
      gazeScratch.yawQuat.setFromAxisAngle(WORLD_UP, gaze.current.yaw * NECK_SHARE)
      gazeScratch.pitchQuat.setFromAxisAngle(gazeScratch.right, gaze.current.pitch * NECK_SHARE)
      gazeScratch.worldDelta.copy(gazeScratch.yawQuat).multiply(gazeScratch.pitchQuat)
      applyGaze(neck, gazeScratch.neck, gazeScratch.worldDelta, gazeScratch.parentWorld, gazeScratch.localDelta)
    }

    const headShare = neck ? HEAD_SHARE : 1
    gazeScratch.yawQuat.setFromAxisAngle(WORLD_UP, gaze.current.yaw * headShare)
    gazeScratch.pitchQuat.setFromAxisAngle(gazeScratch.right, gaze.current.pitch * headShare)
    gazeScratch.worldDelta.copy(gazeScratch.yawQuat).multiply(gazeScratch.pitchQuat)
    applyGaze(head, gazeScratch.head, gazeScratch.worldDelta, gazeScratch.parentWorld, gazeScratch.localDelta)
  }, 0.5)

  // The avatar is the subject of the scene, not a control: nothing happens
  // when you click it, so it shouldn't answer the pointer at all. Done by
  // walking the subtree rather than by props because these are gltfjsx
  // components whose meshes aren't reachable from here -- and re-run on
  // `modelKind` because the base/dragonite/scuba swap mounts a whole new
  // model that would otherwise come back raycastable.
  //
  // Deliberately no dependency array. The models load through useGLTF inside
  // the <Suspense> below, so on a fresh mount (and on every form swap) their
  // meshes don't exist yet when an effect keyed on `modelKind` would run --
  // they arrive in a later commit, already raycastable. Re-applying after
  // every commit costs one walk of a small subtree and can't miss that.
  //
  // The same walk turns shadows on. Every other model in the scene sets
  // castShadow per-mesh in its own gltfjsx file (Gear, Campfire, Desk...), but
  // the avatar's three variants didn't, so the subject of the whole scene was
  // the one thing the key light passed straight through -- casting nothing and
  // catching nothing. Flipping it here rather than in three model files keeps
  // it true across the base/dragonite/scuba swap.
  useEffect(() => {
    let head: Object3D | null = null
    let neck: Object3D | null = null

    group.current?.traverse((child) => {
      child.raycast = () => {}

      // Picked up on the same walk rather than in a second effect: the bones
      // arrive in exactly the same late commit the meshes do, so anything
      // keyed on `modelKind` would look for them one commit too early. Both
      // stay null for dragonite and scuba, which have no such bones -- which
      // is also how the look below gates itself off for those forms.
      if (child.name === "head") head = child
      else if (child.name === "neck_01") neck = child

      const mesh = child as Mesh
      if (!mesh.isMesh) return
      if (mesh.castShadow && mesh.receiveShadow) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      // receiveShadow is part of the program cache key, so a material that
      // already compiled without it needs recompiling -- otherwise the flag is
      // set and nothing changes on screen. Only on the commit that flips it.
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) if (material) material.needsUpdate = true
    })

    headBone.current = head
    neckBone.current = neck
  })

  return (
    <group ref={group} position={BASE_POSITION} rotation={BASE_ROTATION}>
      <Suspense fallback={null}>
        {modelKind === "base" && <Avatar scale={1.4} />}
        {modelKind === "dragonite" && <Dragonite ref={setDragoniteRef} scale={1.4} />}
      </Suspense>
    </group>
  )
})

AvatarController.displayName = "AvatarController"
