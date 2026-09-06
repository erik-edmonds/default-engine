"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, Suspense } from "react"
import type { Group } from "three"
import gsap from "gsap"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"
import { tweenDuration, prefersReducedMotion } from "@/helpers/motion"
import { Avatar } from "@/components/models/Avatar"
import { Dragonite, type DragoniteHandle } from "@/components/models/Dragonite"
import { Scuba } from "@/components/models/Scuba"

const BASE_POSITION: [number, number, number] = [-1.3, -0.65, 1]
const BASE_ROTATION: [number, number, number] = [0, 0, 0]

const KEYFRAMES: { at: number; x: number; rotY: number }[] = [
  { at: 0, x: BASE_POSITION[0], rotY: 0 },
  { at: 150, x: 1, rotY: Math.PI / 4 },
  { at: 375, x: -2.07, rotY: Math.PI / 2 }, // hold-start -- coincides with the "Certified Scuba Diver" caption's own threshold
  { at: 525, x: -2.07, rotY: Math.PI / 2 }, // hold-end -- coincides with "Let's Connect"'s threshold
  { at: 600, x: 4, rotY: Math.PI },
]

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function catmullRomTangents(values: number[], times: number[]) {
  return values.map((v, i) => {
    if (i === 0 || i === values.length - 1) return 0
    // A keyframe sharing its value with a neighbor marks a deliberate
    // hold -- zero its tangent instead of the usual wide-neighbor
    // Catmull-Rom slope, or the hold "leaks" motion from its OTHER
    // neighbor and produces a visible dip/wobble mid-hold.
    if (values[i - 1] === v || values[i + 1] === v) return 0
    return (values[i + 1] - values[i - 1]) / (times[i + 1] - times[i - 1])
  })
}

function hermite(p0: number, m0: number, p1: number, m1: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  const h00 = 2 * t3 - 3 * t2 + 1
  const h10 = t3 - 2 * t2 + t
  const h01 = -2 * t3 + 3 * t2
  const h11 = t3 - t2
  return h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1
}

const KEYFRAME_TIMES = KEYFRAMES.map((k) => k.at)
const X_TANGENTS = catmullRomTangents(
  KEYFRAMES.map((k) => k.x),
  KEYFRAME_TIMES,
)
const ROT_TANGENTS = catmullRomTangents(
  KEYFRAMES.map((k) => k.rotY),
  KEYFRAME_TIMES,
)

function getChoreographedPose(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), KEYFRAMES[KEYFRAMES.length - 1].at)
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i]
    const b = KEYFRAMES[i + 1]
    if (clamped <= b.at) {
      const dt = b.at - a.at
      const t = (clamped - a.at) / dt
      return {
        x: hermite(a.x, X_TANGENTS[i] * dt, b.x, X_TANGENTS[i + 1] * dt, t),
        rotY: hermite(a.rotY, ROT_TANGENTS[i] * dt, b.rotY, ROT_TANGENTS[i + 1] * dt, t),
      }
    }
  }
  const last = KEYFRAMES[KEYFRAMES.length - 1]
  return { x: last.x, rotY: last.rotY }
}

const Z_STOPS: { at: number; z: number }[] = [
  { at: 0, z: BASE_POSITION[2] },
  { at: 150, z: BASE_POSITION[2] - 1.5 },
  { at: 525, z: BASE_POSITION[2] - 1.5 },
  { at: 600, z: BASE_POSITION[2] + 1 },
]

function getSkyZ(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), Z_STOPS[Z_STOPS.length - 1].at)
  for (let i = 0; i < Z_STOPS.length - 1; i++) {
    const a = Z_STOPS[i]
    const b = Z_STOPS[i + 1]
    if (clamped <= b.at) {
      const t = (clamped - a.at) / (b.at - a.at)
      return a.z + (b.z - a.z) * smoothstep(t)
    }
  }
  return Z_STOPS[Z_STOPS.length - 1].z
}

const Y_STOPS: { at: number; yOffset: number }[] = [
  { at: 0, yOffset: 0 },
  { at: 525, yOffset: 0 },
  { at: 600, yOffset: 3 },
]

function getSkyY(offset: number) {
  const clamped = Math.min(Math.max(offset, 0), Y_STOPS[Y_STOPS.length - 1].at)
  for (let i = 0; i < Y_STOPS.length - 1; i++) {
    const a = Y_STOPS[i]
    const b = Y_STOPS[i + 1]
    if (clamped <= b.at) {
      const t = (clamped - a.at) / (b.at - a.at)
      const isFinalStretch = i === Y_STOPS.length - 2
      const eased = isFinalStretch ? t * t * t : smoothstep(t)
      return a.yOffset + (b.yOffset - a.yOffset) * eased
    }
  }
  return Y_STOPS[Y_STOPS.length - 1].yOffset
}

export interface AvatarControllerHandle {
  spinAndTransform: (target: ModelKind) => Promise<void>
  materializeDragonite: () => Promise<void>
  flyUp: () => Promise<void>
  beginSkyJourney: () => void
  setSkyOffset: (offsetZ: number) => void
  returnHome: () => Promise<void>
  moveToIslandEdge: () => Promise<void>
  diveUnderwater: () => Promise<void>
}

export type ModelKind = "base" | "dragonite" | "scuba"

// Island's sand/water boundary sits at x = -6. The walk stops well short of
// it; the dive covers the rest of the approach plus the leap out over the water.
const WALK_TARGET_X = -4.4
const DIVE_TARGET_X = -7.5
const DIVE_HOP_HEIGHT = 1
const DIVE_DEPTH = 6

// How long the displayed sky-journey offset takes to catch up to the
// scrolled-to target (same technique, and the same 0.25s, as
// CameraHelpers.tsx's Rig) -- this is what makes scrolling feel weighted
// instead of a raw 1:1 input mapping, and lets motion keep easing for a
// moment after the wheel stops instead of stopping dead.
const SKY_SCROLL_SMOOTH_TIME = 0.25
// A small ambient sway layered on top of the choreographed Y position so
// the avatar reads as alive (gently hovering) rather than frozen during the
// held pose, without being noticeable against the larger directed motion
// elsewhere in the journey.
const SKY_IDLE_BOB_AMPLITUDE = 0.06
const SKY_IDLE_BOB_SPEED = 0.7

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
        })
        gsap.to(group.current.rotation, {
          x: BASE_ROTATION[0],
          y: BASE_ROTATION[1],
          z: BASE_ROTATION[2],
          duration,
          ease: "power2.inOut",
        })
      }),
    moveToIslandEdge: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        gsap.to(group.current.position, {
          x: WALK_TARGET_X,
          duration: tweenDuration(0.9),
          ease: "power1.inOut",
          onComplete: () => resolve(),
        })
      }),
    diveUnderwater: () =>
      new Promise<void>((resolve) => {
        if (!group.current) {
          resolve()
          return
        }
        // The descent's timeline-position anchor (when it starts) must scale
        // in lockstep with the hop's duration (when it finishes) -- both
        // derive from tweenDuration(0.4) so the two stay synchronized under
        // reduced motion instead of leaving a dead gap between them.
        const hopDuration = tweenDuration(0.4)
        gsap
          .timeline({ onComplete: () => resolve() })
          .to(group.current.position, { x: DIVE_TARGET_X, duration: tweenDuration(1.7), ease: "power1.inOut" }, 0)
          .to(group.current.position, { y: "+=" + DIVE_HOP_HEIGHT, duration: hopDuration, ease: "power1.out" }, 0)
          .to(group.current.position, { y: "-=" + (DIVE_HOP_HEIGHT + DIVE_DEPTH), duration: tweenDuration(1.3), ease: "power2.in" }, hopDuration)
      }),
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
    const pose = getChoreographedPose(offset)
    const idleBob = reduced ? 0 : Math.sin(state.clock.elapsedTime * SKY_IDLE_BOB_SPEED + skyBobSeed) * SKY_IDLE_BOB_AMPLITUDE

    group.current.position.x = pose.x
    group.current.position.y = skyBaseY.current + getSkyY(offset) + idleBob
    group.current.position.z = getSkyZ(offset)
    group.current.rotation.y = pose.rotY
  })

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
  useEffect(() => {
    group.current?.traverse((child) => {
      child.raycast = () => {}
    })
  })

  return (
    <group ref={group} position={BASE_POSITION} rotation={BASE_ROTATION}>
      <Suspense fallback={null}>
        {modelKind === "base" && <Avatar scale={1.4} />}
        {modelKind === "dragonite" && <Dragonite ref={setDragoniteRef} scale={1.4} />}
        {modelKind === "scuba" && <Scuba scale={1.4} />}
      </Suspense>
    </group>
  )
})

AvatarController.displayName = "AvatarController"
