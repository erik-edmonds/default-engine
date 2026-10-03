"use client"

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, Suspense } from "react"
import * as THREE from "three"
import type { Group, Mesh, Object3D } from "three"
import gsap from "gsap"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"
import {
  AVATAR_BASE_POSITION,
  SKY_SCROLL_SMOOTH_TIME,
  avatarSkyPose,
  setSkyOrigin,
  skyCardSubjectLift,
  skyExitLift,
} from "@/config/skyJourney"
import { skyFrame } from "@/helpers/skyFrame"
import { tweenDuration, prefersReducedMotion } from "@/helpers/motion"
import { pointerState } from "@/helpers/cursor"
import { useCoarsePointer } from "@/helpers/useCoarsePointer"
import { Avatar } from "@/components/models/Avatar"
import { FlyingDragonite } from "@/components/models/FlyingDragonite"
import { Rope } from "@/components/canvas/PaperSky"
import { ROPE_RADIUS_NEAR, STRING_TOP, SUBJECT_DROP_PORTRAIT, SUBJECT_ROPE_IN_PORTRAIT } from "@/config/paperSky"
import { flightHeading } from "@/config/flightFrame"
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
  /** Leave the ground. Runs BEFORE the camera climbs, so the ascent starts
   *  with the subject already in the air rather than pulling away from it. */
  liftOff: () => Promise<void>
  /** Rise into the sky AFTER the camera is already there -- as the cardboard
   *  cutout, up from below the bottom edge of the frame. */
  riseIntoSky: () => Promise<void>
  /** Anchor the sky sequence to the avatar's live position. Must be called
   *  before anything climbs, because the camera's target derives from it. */
  captureSkyOrigin: () => void
  beginSkyJourney: () => void
  setSkyOffset: (offsetZ: number) => void
  returnHome: () => Promise<void>
}

export type ModelKind = "base" | "dragonite" | "cardboard"


// A small ambient sway layered on top of the choreographed Y position so
// the avatar reads as alive (gently hovering) rather than frozen during the
// held pose, without being noticeable against the larger directed motion
// elsewhere in the journey.
/** The cardboard hand-off.
 *
 *  DROP is how far below its sky pose the cutout starts, in world units. At the
 *  camera's 6.3-unit standoff the frame is about 4.1 units tall at the subject
 *  and the subject is 2.7 of them, so seven units is comfortably out of sight
 *  underneath it at any of the lens settings this scene has had.
 *
 *  Going up, the cutout waits for the camera to settle and then rises. Coming
 *  home it goes FIRST and faster, so that by the time the camera has finished
 *  its own descent the cutout is long gone and the 3D Dragonite is already
 *  standing on the island in its place. */
/** ONE ASCENT, FROM THE SAND TO THE SKY POSE, THAT NEVER STOPS.
 *
 *  What this replaces was three moves pretending to be one: the Dragonite rose
 *  34 units over 5.5 seconds, HELD there while the camera carried on to 160,
 *  was teleported to just under the sky pose, and rose the last 7 units. The
 *  hold is the fault -- "the dragonite is stopping in the air while ascending,
 *  it should never be seen stopping". It is plainly visible: at t+9s in the
 *  recording the camera is still climbing and the Dragonite is hanging
 *  motionless off to one side of the frame, waiting.
 *
 *  Now it is a single tween onto avatarSkyPose(0), which is exactly where the
 *  old teleport was going anyway -- at offset 0 that pose is the captured
 *  origin plus SKY_RISE, so x and z do not move and only y does.
 *
 *  It is longer than the camera's CLIMB_SECONDS and shares its ease, so the
 *  camera is ahead at every instant of the climb and arrives about a second
 *  and a half first. The subject falls out of the bottom of the frame early,
 *  is out of sight for the middle of the climb, and rises back into the shot
 *  from under the bottom edge once the camera has settled -- still moving,
 *  never having stopped. */
const SKY_ASCENT_SECONDS = 8

/** How far past the bottom edge of the frame the subject must be before the
 *  model may be swapped for its cardboard cutout, as a multiple of the
 *  frame's own half-height at that distance. 1.15 is a fifteen-percent margin.
 *  Behind the camera counts too, and unconditionally -- see the swap. */
const MODEL_SWAP_CLEARANCE = 1.15

const SKY_EXIT_DROP = 9
const SKY_EXIT_SECONDS = 1.4

/** How far below his sky pose the SUBJECT is held, in world units.
 *
 *  Portrait only, and it exists so the block of words stacked above him has
 *  somewhere to go -- see SUBJECT_DROP_PORTRAIT for the measurement.
 *
 *  A FUNCTION, AND USED IN BOTH PLACES, because having it in only one of them
 *  is a visible bug. The ascent is a gsap tween onto `avatarSkyPose(0).y`;
 *  the journey's frame loop then holds `pose.y - drop`. With the drop applied
 *  only in the loop, the hand-off between the two subtracted it in a single
 *  frame: measured off a screen recording, his feet rose smoothly to y=413
 *  and then snapped down 68px between two frames at t=12.0 before settling --
 *  "the avatar comes up, then does some weird jump". 68px of that canvas is
 *  0.30 of ndc, which is 0.67 world units at his distance, which is exactly
 *  this constant.
 *
 *  Not gated on the model kind. The frame loop below runs only while the sky
 *  journey latch is on, by which point the subject is always the cutout, and
 *  the ascent's tween has to aim at the same height the loop will hold or the
 *  snap comes back. */
const subjectSkyDrop = () => (skyFrame.portrait ? SUBJECT_DROP_PORTRAIT : 0)

const SKY_IDLE_BOB_AMPLITUDE = 0.06
/** How long the idle bob takes to reach full amplitude once the journey
 *  starts. Without a ramp the motion switches on at full size on one frame. */
const SKY_IDLE_BOB_RAMP_SECONDS = 1.1
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

/** THE SKY SUBJECT, measured rather than eyeballed.
 *
 *  flying_dragonite.glb's geometry is not centred on its own origin: its box
 *  runs x -0.951..-0.283, y -0.356..0.575. The model is drawn with
 *  rotation [0, PI, 0], which mirrors x to the other side. So at scale S and
 *  position P the figure's centre lands at P.x - S * -0.617, and its top at
 *  P.y + S * 0.575 -- not at P.
 *
 *  These are constants rather than numbers inlined in the JSX because the rope
 *  has to be tied to the figure, and the figure has been resized twice. Both
 *  times the rope stayed where the old size put it: once a unit and a half off
 *  to the side of the thing it is meant to be holding, and once floating a
 *  tenth of a unit above its head. Derived, a resize moves the rope with it. */
const SUBJECT_SCALE = 2
const SUBJECT_POSITION: [number, number, number] = [-1.25, -0.5, 0]
const SUBJECT_NATIVE_CENTRE_X = -0.617
/** NOT the bounding box's top, which is 0.575 and is the tip of the two
 *  antennae -- two thin horns with empty air between them. A rope ended there
 *  hangs into that gap and touches nothing, which is the "it doesn't attach
 *  properly" in the photo. 0.46 is the crown of the head, so the cord runs
 *  down between the antennae and lands on the figure. */
const SUBJECT_NATIVE_TOP = 0.46
/** Where the rope is tied on, in the avatar group's own space. A shade below
 *  the top of the cutout, so the end of the cord is hidden behind the artwork
 *  rather than butting against its edge. */
const ROPE_ANCHOR_X = SUBJECT_POSITION[0] - SUBJECT_SCALE * SUBJECT_NATIVE_CENTRE_X
const ROPE_ANCHOR_Y = SUBJECT_POSITION[1] + SUBJECT_SCALE * (SUBJECT_NATIVE_TOP - 0.02)
/** The cord scales WITH the subject. Its radius was set against a figure drawn
 *  at 2.5; left alone through the resize it would read as a heavier rope on a
 *  smaller Dragonite. */
const SUBJECT_ROPE_RADIUS = ROPE_RADIUS_NEAR * (SUBJECT_SCALE / 2.5)
/** How near its final height the camera has to be before the cord is there at
 *  all, and how quickly it then arrives. */
const ROPE_ARRIVAL_MARGIN = 6
const ROPE_FADE_LAMBDA = 3.5

export const AvatarController = forwardRef<AvatarControllerHandle>((_props, ref) => {
  const group = useRef<Group>(null)
  // Constant: the cutout holds station at the corridor origin, and STRING_TOP
  // is measured from there, so its rope never changes length.
  const dragoniteRopeRef = useRef(STRING_TOP - ROPE_ANCHOR_Y)
  /** THE CORD DOES NOT EXIST UNTIL THE CAMERA IS THERE.
   *
   *  The cutout is swapped in early -- as soon as the subject drops below the
   *  frame, so the change is never seen -- and its rope runs from the cutout
   *  up to STRING_TOP, some eighty units above the corridor. That put a length
   *  of cord hanging in the open sky for the whole climb, with the camera
   *  rising past it: "the rope appears all the way while the camera is still
   *  going up". It fades up once the camera has actually arrived. */
  const ropeOpacity = useRef(0)
  /** The single ascent's state: whether it has landed, and whoever is waiting
   *  on it (riseIntoSky). See SKY_ASCENT_SECONDS. */
  const ascentDone = useRef(false)
  const ascentResolve = useRef<(() => void) | null>(null)
  /** Armed by liftOff, fired by the frame loop once the subject is below the
   *  frame, so the 3D Dragonite becomes its cardboard cutout unseen. */
  const swapToCardboard = useRef(false)
  const swapProbe = useRef<THREE.Vector3 | null>(null)
  const [modelKind, setModelKind] = useState<ModelKind>("base")
  /** The same value, readable from the imperative handle -- which is built
   *  once and would otherwise close over the first render's. */
  const modelKindRef = useRef<ModelKind>("base")
  modelKindRef.current = modelKind
  /** Work that must happen on the commit that swaps the model, not before it.
   *  See returnHome. */
  const reseatOnSwap = useRef<(() => void) | null>(null)
  const targetSkyOffset = useRef(0)
  const displaySkyOffset = useRef(0)
  const isSkyJourneyActive = useRef(false)
  /** Seconds since the journey began, which is what the idle bob's phase is
   *  measured from -- see the note where it is used. */
  const skyBobTime = useRef(0)
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

  // Layout, not passive: it runs before the browser paints the commit that
  // mounted the new model, so there is no frame in which the Dragonite is up
  // but still standing where the cutout was.
  useLayoutEffect(() => {
    const reseat = reseatOnSwap.current
    if (!reseat) return
    reseatOnSwap.current = null
    reseat()
  }, [modelKind])

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
    liftOff: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        // Absolute, not a delta: avatarSkyPose(0) is the captured origin plus
        // SKY_RISE, so this is the same destination the old teleport had, just
        // travelled to instead of jumped to.
        const pose = avatarSkyPose(0)
        ascentDone.current = false
        // Armed here and fired by the frame loop, once the subject is below
        // the frame -- see MODEL_SWAP_NDC_Y.
        swapToCardboard.current = true
        const finish = () => {
          ascentDone.current = true
          const waiting = ascentResolve.current
          ascentResolve.current = null
          waiting?.()
        }
        gsap.to(group.current.position, {
          // The height the JOURNEY will hold, not the raw pose -- see
          // subjectSkyDrop. Aiming at pose.y and letting the frame loop
          // subtract the drop on its first frame is the snap at the top of
          // the climb.
          y: pose.y - subjectSkyDrop(),
          duration: tweenDuration(SKY_ASCENT_SECONDS),
          // The camera's own ease, over a longer span. Matching the SHAPE is
          // what guarantees the camera is ahead at every instant rather than
          // only at the end -- two different curves can cross.
          ease: "power2.inOut",
          onComplete: finish,
          onInterrupt: finish,
        })
        // Resolves at once, while the tween runs on: the caller wants to know
        // the subject is off the ground so it can start the camera, not that
        // the ascent is over. Waiting for the end is riseIntoSky's job.
        resolve()
      }),
    riseIntoSky: () =>
      new Promise<void>((resolve) => {
        // NOTHING TO START -- the rise has been running since liftOff.
        //
        // This used to be the second half of a two-stage entry: teleport the
        // subject to just under the sky pose and tween the last seven units.
        // The teleport is what the hold existed to hide. Now there is one
        // ascent and this simply waits for its end, which lands about a second
        // and a half after the camera because the ascent is that much longer
        // than the climb.
        if (ascentDone.current || !group.current) {
          resolve()
          return
        }
        ascentResolve.current = resolve
      }),
    /** Anchor the whole sky sequence to where the avatar actually is, BEFORE
     *  anything climbs. The camera's flyUp target is derived from this, so it
     *  has to be set first -- page.tsx calls it between zoomIn and the climb. */
    captureSkyOrigin: () => {
      if (!group.current) return
      setSkyOrigin(group.current.position.x, group.current.position.y, group.current.position.z)
    },
    beginSkyJourney: () => {
      skyBobTime.current = 0
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
        // THE CUTOUT LEAVES BEFORE THE CAMERA DOES.
        //
        // It drops out of the bottom of the frame in 1.4s -- well inside the
        // camera's own descent -- and only once it is out of sight does it
        // become the 3D Dragonite again and take the island pose. So the
        // camera never sees the swap: it arrives to find the real model
        // already standing there, which is the point of doing it this way
        // round rather than cross-fading two models in view.
        //
        // The Dragonite -> human change is still the separate spinAndTransform
        // that page.tsx runs after the flight; this only undoes the cardboard.
        gsap.to(group.current.position, {
          y: group.current.position.y - SKY_EXIT_DROP,
          duration: tweenDuration(SKY_EXIT_SECONDS),
          ease: "power2.in",
          onComplete: () => {
            // THE POSE WAITS FOR THE MODEL, not the other way round.
            //
            // This used to set the island pose and ask for the swap in the same
            // tick. setModelKind is a state update, so the cardboard cutout is
            // still what is mounted when that line returns -- and the line
            // after it had already teleported the group to the island. For
            // however many frames React took to commit, the cutout stood on the
            // island in full view. Measured at four frames coming home.
            //
            // The reseat is handed to a layout effect keyed on modelKind, so it
            // runs on the commit that actually mounts the Dragonite. The group
            // is hidden across the gap: if anything delays that commit, the
            // reader sees nothing rather than the wrong model.
            if (group.current) group.current.visible = false
            const reseat = () => {
              group.current?.position.set(BASE_POSITION[0], BASE_POSITION[1], BASE_POSITION[2])
              group.current?.rotation.set(BASE_ROTATION[0], BASE_ROTATION[1], BASE_ROTATION[2])
              if (group.current) group.current.visible = true
              resolve()
            }
            // NOTHING TO WAIT FOR IF IT IS ALREADY THE 3D MODEL.
            //
            // The reseat is normally handed to a layout effect that runs on
            // the commit which mounts the Dragonite. But setModelKind to the
            // value it already holds is a no-op: no render, no commit, no
            // effect -- and returnHome's promise never settles. handleGoHome
            // awaits it, so the whole trip home stops there, with the Poke
            // Ball never told to close and its beam left parked out by the
            // avatar. That happens whenever the cutout swap did not fire on
            // the way up, which is a case this sequence must survive rather
            // than assume away.
            if (modelKindRef.current === "dragonite") reseat()
            else {
              reseatOnSwap.current = reseat
              setModelKind("dragonite")
            }
          },
          onInterrupt: () => {
            if (group.current) group.current.visible = true
            resolve()
          },
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
      // THE RAW DELTA, and the camera passes the raw delta too.
      //
      // Two damps of the same offset with different deltas diverge on any
      // frame longer than the clamp -- and the camera then frames a COMPUTED
      // avatar position that is not where the avatar actually is. Both were
      // clamped for that reason; both are unclamped now, for the reason given
      // where the camera does it: an exponential damp cannot go unstable over
      // a long step, and clamping only makes it follow the frame rate instead
      // of the clock. What matters here is that they still MATCH. Unclamping
      // one alone put the subject 0.54 off the midline on a slow renderer,
      // where the pair of them holds it at 0.15.
      easing.damp(displaySkyOffset, "current", targetSkyOffset.current, SKY_SCROLL_SMOOTH_TIME, delta)
    }

    const offset = displaySkyOffset.current
    const pose = avatarSkyPose(offset)

    // The bob starts AT ZERO and grows in, rather than cutting in at whatever
    // phase the clock happens to be at.
    //
    // It used to sample sin(elapsedTime * speed + randomSeed) from the first
    // sky frame, so the avatar's y stepped by up to the full amplitude between
    // the last frame of the climb and the first frame of the journey -- a
    // visible twitch, landing on exactly the frame that already had a rotation
    // snap on it. Phase is now measured from when the journey starts, so the
    // first sample is sin(0) = 0, and the amplitude eases in over a second so
    // the motion appears rather than switches on.
    skyBobTime.current += delta
    const bobRamp = Math.min(1, skyBobTime.current / SKY_IDLE_BOB_RAMP_SECONDS)
    const idleBob = reduced
      ? 0
      : Math.sin(skyBobTime.current * SKY_IDLE_BOB_SPEED) * SKY_IDLE_BOB_AMPLITUDE * bobRamp

    // All three absolute, and all three from the SAME pose -- which is now
    // anchored to where the avatar actually was (see setSkyOrigin). x and z
    // used to be written straight from the table while only y was relative,
    // and that asymmetry teleported the avatar away from the camera on the
    // first sky frame.
    group.current.position.x = pose.x
    // HAULED UP AND OUT AS THE CONTACT CARD ARRIVES -- see skyExitLift. Added
    // here and not in avatarSkyPose on purpose: the camera's height is
    // derived from that pose, so a lift inside it would carry the camera up
    // too and he would never actually leave the frame. The cord below is
    // measured against the unlifted pose, so it shortens as he rises, which
    // is the string doing the pulling.
    // ...and LOWER IN A PORTRAIT FRAME, so the words stacked above him have
    // somewhere to go. See SUBJECT_DROP_PORTRAIT for the measurement and for
    // why this moves the subject rather than the camera.
    // AND UP OUT OF THE WAY WHILE A CARD IS OPEN -- see skyCardSubjectLift.
    // He hangs 6.3 units from the lens and a card stands sixty units further
    // out, so at full expansion he would float over the middle of a scene
    // that is supposed to be the whole screen. Same string, same gesture,
    // and it plays in reverse when the card closes.
    group.current.position.y =
      pose.y + idleBob + skyExitLift(offset) + skyCardSubjectLift(offset) - subjectSkyDrop()
    group.current.position.z = pose.z
    // THE CAMERA TURNS; THE SUBJECT DOES NOT.
    //
    // "On the scroll, the camera should turn to look at the text, but the
    // dragonite shouldn't." avatarSkyPose's rotY carries an authored lean of
    // up to seventeen degrees, and the sky's subject is a flat cutout -- so
    // that lean is the difference between looking at him and looking at his
    // edge. Squared to the corridor he stays face-on however far the camera
    // leans off it, which is what the corridor's own props do (see the note
    // on hang.rotation.y in PaperSky). The 3D model on the island keeps the
    // authored lean: it has sides worth seeing.
    group.current.rotation.y =
      modelKindRef.current === "cardboard" ? flightHeading(offset) + Math.PI : pose.rotY
  })

  // The rope's top stays on the STRING_TOP line while the cutout moves.
  //
  // The rope is a child of the avatar group, so left at a fixed length it
  // travels with the cutout -- and while the cutout is still below the frame
  // that puts the rope's upper end in the middle of an empty sky, attached to
  // nothing. Measuring from the corridor origin each frame keeps the anchor
  // where the puppeteer's hand is and lets the rope pay out as the cutout
  // comes up, which is the whole idea.
  useFrame((state, delta) => {
    if (swapToCardboard.current && group.current) {
      // IN CAMERA SPACE, not in projected NDC.
      //
      // "Out of frame" has to account for the standoff and the lens, both of
      // which change during the climb -- so it cannot be a height difference.
      // It cannot be the PROJECTED height either, which is what this was: the
      // perspective divide flips sign for anything behind the camera, so a
      // point below and behind reads as high above. On a slow frame the
      // subject crosses from below-and-in-front to behind between two
      // samples and the test never sees it low at all -- the swap then never
      // fires and the 3D model rides all the way into the paper sky, T-pose
      // and all. Seen three times in a row on a software renderer, and it is
      // the same hazard on any machine that drops a frame at the wrong
      // moment.
      //
      // Camera space has no such discontinuity: -z is the distance in front,
      // y the height, and behind the camera is simply z >= 0.
      const probe = (swapProbe.current ??= new THREE.Vector3())
      probe.copy(group.current.position)
      state.camera.worldToLocal(probe)
      const behind = probe.z > -0.1
      const ahead = Math.max(0.001, -probe.z)
      const perspective = state.camera as THREE.PerspectiveCamera
      const halfHeight = Math.tan(((perspective.fov ?? 50) * Math.PI) / 360) * ahead
      const below = probe.y < -halfHeight * MODEL_SWAP_CLEARANCE
      if (behind || below) {
        swapToCardboard.current = false
        // Where it happened, kept on the group. The swap is a single frame in
        // a sequence this renderer samples once or twice a second, so a probe
        // trying to catch the transition between two readings misses it as
        // often as not. Recorded, the claim -- that the model never changes in
        // view -- is checkable at any frame rate.
        // Recorded as the projected height, which is what the checks read --
        // meaningful whenever the subject is still in front of the camera,
        // and simply a large number once it is behind.
        group.current.userData.cardboardSwapNdcY = behind
          ? -99
          : probe.y / Math.max(0.001, halfHeight)
        setModelKind("cardboard")
        group.current.rotation.y = avatarSkyPose(0).rotY
      }
    }
    if (!group.current) return
    const originY = avatarSkyPose(displaySkyOffset.current).y
    dragoniteRopeRef.current = Math.max(0, STRING_TOP - ROPE_ANCHOR_Y - (group.current.position.y - originY))
    // Arrived, for the cord's purposes, means the camera is at the height the
    // sky pose is framed from -- not the altitude that dresses the backdrop,
    // which is passed less than halfway up.
    const arrived = state.camera.position.y >= avatarSkyPose(0).y - ROPE_ARRIVAL_MARGIN
    // THE RAW DELTA, not a clamped one. Clamping is for integrators that can
    // go unstable over a long step; an exponential damp cannot, and clamping
    // it only makes the fade run at the frame rate instead of the clock --
    // measured on a software renderer at half a second per frame, where the
    // cord was still at 0.57 a full fourteen seconds after the camera landed.
    // AND IT IS NOT DRAWN AT ALL IN PORTRAIT -- see SUBJECT_ROPE_IN_PORTRAIT.
    // The words are stacked on his axis there and his cord crosses them at
    // any length worth drawing. Faded rather than switched, on the same damp
    // the arrival already uses, so rotating a device is a dissolve.
    const wantRope = arrived && (SUBJECT_ROPE_IN_PORTRAIT || !skyFrame.portrait)
    ropeOpacity.current = THREE.MathUtils.damp(ropeOpacity.current, wantRope ? 1 : 0, ROPE_FADE_LAMBDA, delta)
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
    // Not in the sky. Up there the avatar is choreographed by the journey and
    // the visitor's pointer is for scrolling -- a head that keeps turning to
    // follow it reads as the model being distracted mid-flight.
    if (isSkyJourneyActive.current) return

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
  // when you click it, so it shouldn't answer the pointer at all.
  //
  // IT WAS BRIEFLY CLICKABLE. A suggestion queue hung off him -- clicking him
  // said the next thing -- and that was granted through one named proxy
  // capsule exempted from this walk. The whole feature is gone, so the
  // exemption is too and the rule below is unconditional again.
  //
  // Done by walking the subtree rather than by props because these are
  // gltfjsx components whose meshes aren't reachable from here -- and re-run
  // on `modelKind` because the base/dragonite/cardboard swap mounts a whole
  // new model that would otherwise come back raycastable.
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
  // catching nothing.
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
    // Named so the scene graph says which subtree is the subject.
    //
    // It used to be findable only by its skeleton -- "the skinned mesh with 23
    // bones" -- which stopped working the moment the sky's subject became a
    // flat cutout with no skeleton at all. A name survives whichever model is
    // mounted inside it, which is the whole point of the swap.
    <group ref={group} name="avatar-root" position={BASE_POSITION} rotation={BASE_ROTATION}>
      <Suspense fallback={null}>
        {modelKind === "base" && <Avatar scale={1.4} />}
        {modelKind === "dragonite" && <Dragonite ref={setDragoniteRef} scale={1.4} />}
        {/* Same 1.4 as the Dragonite, and not a coincidence: the cutout is
            1.899 units tall in its own file against the Dragonite's 1.9, and
            both have their bounding box centred on the group origin, so the
            two occupy the same space on screen. */}
        {modelKind === "cardboard" && (
          <>
            {/* THE ROPE GOES WHERE THE MODEL ACTUALLY IS.
                
                flying_dragonite's geometry is not centred on its own origin --
                its box runs x -0.951..-0.283 -- and the model is drawn with
                rotation [0, PI, 0], which mirrors that offset to the other
                side. Net: at scale 2.5 and position x -1.5 the figure's centre
                lands at about x 0, not at -1.5. Anchoring the rope at -1.5 put
                it a unit and a half off to the side of the thing it is meant to
                be holding, which is the rope seen hanging on its own.
                
                Its length is maintained every frame (below) so the TOP stays
                pinned to STRING_TOP while the cutout rises -- otherwise the
                rope travels with the cutout and its upper end dangles in
                mid-air instead of running off the top of the frame. */}
            <group position={[ROPE_ANCHOR_X, ROPE_ANCHOR_Y, 0]}>
              <Rope
                lengthRef={dragoniteRopeRef}
                radius={SUBJECT_ROPE_RADIUS}
                opacityRef={ropeOpacity}
                // No renderOrder. It carried -1 for a moment, to paint the
                // cord behind the block of words so it could be shown in
                // portrait; the cord is off in portrait again
                // (SUBJECT_ROPE_IN_PORTRAIT), and in landscape the words sit
                // beside him rather than above, so there is nothing to sort
                // against and the default is right.
              />
            </group>
            <FlyingDragonite
              scale={SUBJECT_SCALE}
              position={SUBJECT_POSITION}
              rotation={[0, Math.PI, 0]}
            />
          </>
        )}
      </Suspense>
    </group>
  )
})

AvatarController.displayName = "AvatarController"
