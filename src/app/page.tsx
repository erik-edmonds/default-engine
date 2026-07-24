"use client"

import {  useState, useRef, useCallback, useEffect, Suspense, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Canvas } from "@react-three/fiber"
import { ContactShadows, OrbitControls, Preload, useProgress } from "@react-three/drei"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import * as THREE from "three"
import gsap from "gsap"
import { useAppState } from "@/components/layout/StateProvider"

import { Scene } from "@/components/canvas/Scene"
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController"
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController"
import { ScrambleTitle } from "@/components/canvas/ScrambleTitle"
import { EarthIntro } from "@/components/canvas/EarthIntro"
import { Environment } from "@/components/canvas/Environment"
import { TimeOfDayOrb } from "@/components/canvas/TimeOfDayOrb"
import { NavTotems } from "@/components/canvas/NavTotems"
import { CameraHotspot } from "@/components/canvas/CameraHotspot"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"
import { INTRO_CAMERA_POSITION, ISLAND_CAMERA_ROTATION } from "@/components/canvas/earthIntroPath"
import { tweenDuration } from "@/helpers/motion"

const SKY_TEXT_CUES: { threshold: number; text: string; align: "left" | "right" | "center" }[] = [
  { threshold: 75, text: "Digital Nomad", align: "left" },
  { threshold: 225, text: "Pokémon Trainer at Heart", align: "right" },
  { threshold: 375, text: "Let's Connect — Contact Me", align: "center" },
];

// Earth-intro sequence: the real low-poly Earth model (public/models/earth.glb),
// held static and viewed face-on, sits *in* the 3D scene directly on the
// camera's flight path (see earthIntroPath.ts) -- its own shader (see
// EarthIntro.tsx) doubles as the loading-progress indicator, materializing
// bottom-to-top as real useProgress() tracking advances. The island scene
// mounts and loads behind it the whole time -- already visible (its own
// group's `visible` prop is tied to `entering`, true from the moment Enter
// is clicked), just naturally occluded by the opaque Earth sitting in front
// of it, exactly like a real object blocking the camera's view. Clicking
// Enter starts a single, uninterrupted camera dolly
// (CameraController.revealIsland) from wherever the intro left the camera
// to the homepage's resting shot; the Earth is *never* faded -- it stays
// fully opaque and grows in frame as the camera approaches, until the
// camera's live position actually reaches its surface (EARTH_CROSS_FRACTION
// of the way there), at which point `onEarthCrossed` fires: EarthIntro
// unmounts (stops occluding the already-visible island behind it) and a
// quick blue "dive" flash masks that one-frame swap. The camera never
// pauses or restarts -- one continuous zoom from a far view of the Earth to
// the island already sitting there, not a cut between two disjoint scenes.
const ISLAND_MOUNT_DELAY_MS = 0
// How long the masking flash takes to ramp up (fast -- a snap, not a fade)
// and fade back out (slightly slower) right as EarthIntro is swapped for
// the already-waiting island scene.
const DIVE_FLASH_IN_SECONDS = 0.09
const DIVE_FLASH_OUT_SECONDS = 0.3
// Progress tracks network loads only, not <Preload all/>'s separate
// shader-compile step -- this buffer keeps that compile hitch safely behind
// the loading screen instead of leaking into the Enter transition.
const ENTER_READY_BUFFER_MS = 400
// Must match .animate-stamp's animation-duration in globals.css -- this is
// how long "Erik Edmonds" takes to slam onto the screen before the
// ScrambleTitle beneath it is allowed to start.
const STAMP_DURATION_MS = 420

// Where each in-world hotspot marker (CameraHotspot.tsx) sits on a
// floating island, and the viewpoint the camera flies to when it's
// clicked -- separate from each other on purpose (the marker itself lives
// at a spot visible from the resting shot; the flight target is a
// different vantage point up near the island). Marker positions found by
// temporarily wiring an onClick probe onto <Merged> (see Scene.tsx history)
// that logs the raycast hit's world point, then clicking the landmark in a
// screenshot -- eyeballing world coordinates from a 2D screenshot isn't
// reliable enough to land a marker precisely on a specific tree.

// Top of the big left landmass, by the bushy tree to the left of the
// waterfall. Viewpoint target unchanged -- only the marker moved.
const UPPER_ISLAND_HOTSPOT_POSITION: [number, number, number] = [-9.11, 12.97, -13.08]
const UPPER_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(-9.272831294101561, 15.407324225909505, -5.428682003669432)
const UPPER_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-0.20748529928110077, -0.2502075137252594, -0.052077416270268545)

// By the tree on the small, separate lower-left island (just above the
// "Erik Edmonds" text in the resting shot) -- was mistakenly on the big
// landmass instead. Viewpoint target unchanged.
const LEFT_TREE_HOTSPOT_POSITION: [number, number, number] = [-14.69, 3.47, -12.94]
const LEFT_TREE_VIEWPOINT_POSITION = new THREE.Vector3(-4.973450838704888, 4.940798436814231, 1.0949348301915267)
const LEFT_TREE_VIEWPOINT_ROTATION = new THREE.Euler(-0.18086788683791294, 0.6833181088730893, 0.11494727400569638)

// The small rock spire closest to the moon -- nudged closer to its tree.
const MOON_ISLAND_HOTSPOT_POSITION: [number, number, number] = [11.0, 5.57, -19.72]
const MOON_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(10.345796563855915, 6.465825926661394, -13.445344768107525)
const MOON_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-0.3847797810371793, -0.04512399314851155, -0.018265435666310163)

export default function Page() {
  const router = useRouter()
  const { setTheme } = useAppState()
  const time = (): TimeOfDay => {
    const now = new Date().getHours();
    if (now <= 17 && now > 6) {
      return "day"
    }
    else if(now <= 18 && now > 14) {
      return "evening"
    }
    else {
      return "night"
    }
  }

  const [, startTransition] = useTransition();
  const [day, setDay] = useState<TimeOfDay>(time);
  const [motion, setMotion] = useState(false);
  const [skyText, setSkyText] = useState("");
  const [skyTextAlign, setSkyTextAlign] = useState<"left" | "right" | "center">("center");
  const cameraControllerRef = useRef<CameraControllerHandle>(null);
  const avatarControllerRef = useRef<AvatarControllerHandle>(null);
  const diveFlashRef = useRef<HTMLDivElement>(null);
  const nameTextRef = useRef<HTMLHeadingElement>(null);
  const isSequenceRunning = useRef(false);
  const isInSkyJourney = useRef(false);
  const skyOffset = useRef(0);
  const skyTextRef = useRef("");

  const [islandMounted, setIslandMounted] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [readyToEnter, setReadyToEnter] = useState(false);
  const [entering, setEntering] = useState(false);
  const [earthCrossed, setEarthCrossed] = useState(false);
  const [islandRevealed, setIslandRevealed] = useState(false);
  const [nameStamped, setNameStamped] = useState(false);
  const progress = useProgress((state) => state.progress);

  // A callback ref, not just useRef: progress (network-load bytes) reaching
  // 100 does not mean React has actually *committed* the island's Suspense
  // subtree yet -- that commit is real, heavy CPU work (reconciling the
  // merged scene's large node tree) independent of network speed, and can
  // still be in flight after progress hits 100. Gating readyToEnter purely
  // on a fixed post-100 buffer raced this: Enter could appear (and get
  // clicked) before cameraControllerRef.current was actually set, silently
  // no-opping the whole reveal via optional chaining. This flips
  // cameraReady the instant the ref is actually populated, whenever that
  // really happens.
  const setCameraControllerRef = useCallback((instance: CameraControllerHandle | null) => {
    cameraControllerRef.current = instance;
    if (instance) setCameraReady(true);
  }, []);

  const handleEnterClick = () => {
    if (entering) return;
    setEntering(true);
    cameraControllerRef.current?.revealIsland(() => {
      setEarthCrossed(true);
      const flash = diveFlashRef.current;
      if (!flash) return;
      gsap.timeline()
        .to(flash, { opacity: 1, duration: tweenDuration(DIVE_FLASH_IN_SECONDS), ease: "power1.in" })
        .to(flash, { opacity: 0, duration: tweenDuration(DIVE_FLASH_OUT_SECONDS), ease: "power1.out" });
    }).then(() => setIslandRevealed(true));
  };

  const handleTimeOfDayChange = (next: TimeOfDay) => {
    setDay(next)
    setTheme(next)
  }

  const handleUpperIslandHotspotClick = () => {
    cameraControllerRef.current?.flyTo(UPPER_ISLAND_VIEWPOINT_POSITION, UPPER_ISLAND_VIEWPOINT_ROTATION)
  }

  const handleLeftTreeHotspotClick = () => {
    cameraControllerRef.current?.flyTo(LEFT_TREE_VIEWPOINT_POSITION, LEFT_TREE_VIEWPOINT_ROTATION)
  }

  const handleMoonIslandHotspotClick = () => {
    cameraControllerRef.current?.flyTo(MOON_ISLAND_VIEWPOINT_POSITION, MOON_ISLAND_VIEWPOINT_ROTATION)
  }

  const handleUpClick = async () => {
    if (isSequenceRunning.current) return
    isSequenceRunning.current = true

    await cameraControllerRef.current?.zoomIn()
    await avatarControllerRef.current?.spinAndTransform("dragonite")
    await Promise.all([cameraControllerRef.current?.flyUp(), avatarControllerRef.current?.flyUp()])

    cameraControllerRef.current?.beginSkyJourney()
    avatarControllerRef.current?.beginSkyJourney()
    isInSkyJourney.current = true

    isSequenceRunning.current = false
  };

  const handleDownClick = async () => {
    if (isSequenceRunning.current) return
    isSequenceRunning.current = true

    await avatarControllerRef.current?.spinAndTransform("scuba")
    await avatarControllerRef.current?.moveToIslandEdge()
    await avatarControllerRef.current?.diveUnderwater()

    isSequenceRunning.current = false
    startTransition(() => {
      router.push('/portfolio')
    })
  };

  useEffect(() => {
    router.prefetch('/portfolio')
  }, [router]);

  useEffect(() => {
    const SKY_JOURNEY_DISTANCE = 450
    const SCROLL_SENSITIVITY = 0.4 / 6

    const handleWheel = (event: WheelEvent) => {
      if (!isInSkyJourney.current) return
      skyOffset.current = Math.min(Math.max(skyOffset.current + event.deltaY * SCROLL_SENSITIVITY, 0), SKY_JOURNEY_DISTANCE)
      cameraControllerRef.current?.setSkyOffset(skyOffset.current)
      avatarControllerRef.current?.setSkyOffset(skyOffset.current)

      const activeCue = [...SKY_TEXT_CUES].reverse().find((cue) => skyOffset.current >= cue.threshold)
      const nextText = activeCue?.text ?? ""
      if (nextText !== skyTextRef.current) {
        skyTextRef.current = nextText
        setSkyText(nextText)
        setSkyTextAlign(activeCue?.align ?? "center")
      }
    }

    window.addEventListener("wheel", handleWheel, { passive: true })
    return () => window.removeEventListener("wheel", handleWheel)
  }, []);

  useEffect(() => {
    // startTransition: mounting Scene/Environment is a large one-time
    // commit (8+ models, lights/shadows) that would
    // otherwise block the main thread in one uninterrupted burst. Marking
    // this update as a transition lets React interleave the browser's rAF
    // loop with the mount work instead of blocking it outright.
    const timeout = setTimeout(() => startTransition(() => setIslandMounted(true)), ISLAND_MOUNT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (progress < 100 || !cameraReady) return;
    const timeout = setTimeout(() => setReadyToEnter(true), ENTER_READY_BUFFER_MS);
    return () => clearTimeout(timeout);
  }, [progress, cameraReady]);

  useEffect(() => {
    if (!islandRevealed) return;
    const timeout = setTimeout(() => setNameStamped(true), STAMP_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [islandRevealed]);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div className={` ${motion ? "invisible" : "visible"} transition-all transition-discrete duration-300 pointer-events-none absolute top-3/5 left-40 z-10 font-sans`}>
        <div className="relative">
          {islandRevealed && (
            // Color/glow driven imperatively by Environment.tsx (via
            // nameTextRef, mutated every frame from the same tweened
            // time-of-day blend the lights/sky use) instead of a fixed
            // Tailwind class per discrete state -- ties this text visually
            // to the lighting system instead of sitting on top of it.
            <h1 ref={nameTextRef} className="animate-stamp text-7xl font-bold leading-[0.9] tracking-tight">
              Erik<br />Edmonds
            </h1>
          )}
          {nameStamped && (
            <div className="relative mt-0 grid justify-items-end">
              <ScrambleTitle text="Data Scientist" />
            </div>
          )}
        </div>
      </div>
      <div
        className={`pointer-events-none fixed inset-0 z-10 flex items-center px-20 text-5xl font-bold text-white transition-opacity duration-500 ${
          skyTextAlign === "left" ? "justify-start" : skyTextAlign === "right" ? "justify-end" : "justify-center"
        }`}
        style={{ opacity: skyText ? 1 : 0 }}
      >
        <span className="max-w-xl">{skyText}</span>
      </div>
      <Canvas shadows camera={
        {
          position: INTRO_CAMERA_POSITION,
          rotation: ISLAND_CAMERA_ROTATION,
          fov: 45}
        } style={{ width: "100vw", height: "100vh" }}>
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={1} levels={2} intensity={1} />
        </EffectComposer>
        {/* Without this the canvas has no backdrop at all (white/transparent).
            Harmless once the island scene mounts too -- Environment's own
            giant gradient sky sphere visually covers this. */}
        <color attach="background" args={["#0a0a0a"]} />
        {/* EarthIntro stays mounted, fully opaque, and growing in frame for
            the whole approach -- it only unmounts once the camera's live
            position actually reaches its surface (see revealIsland's
            onEarthCrossed callback in handleEnterClick), at which point the
            island scene behind it -- already visible this whole time, see
            below -- simply stops being occluded. No fade, no cut between
            two disjoint scenes: the camera dolly never pauses or restarts,
            so this reads as one continuous zoom into the Earth. */}
        {!earthCrossed && <EarthIntro />}
        {islandMounted && (
          <Suspense fallback={null}>
            {/* Environment replaces the old Day/Evening/Night hard-swap --
                a single persistent lighting rig (sky/lights/fog/rim light/
                sun+moon) that gsap-tweens smoothly between presets instead
                of unmounting/remounting the whole tree on toggle. Always
                mounted (not gated on `entering`) so its own state survives
                across the Earth-intro -> island transition. */}
            <Environment target={day} nameTextRef={nameTextRef} />
            <group visible={entering}>
              <Scene day={day} />
              <AvatarController ref={avatarControllerRef} />
              <ContactShadows opacity={0.25} color="black" position={[0, -10, 0]} scale={50} blur={2.5} far={40} resolution={256} />
              {islandRevealed && (
                <>
                  <TimeOfDayOrb current={day} onChange={handleTimeOfDayChange} />
                  <group visible={!motion}>
                    <NavTotems
                      onUp={() => { setMotion(true); handleUpClick() }}
                      onDown={() => { setMotion(true); handleDownClick() }}
                    />
                  </group>
                  <CameraHotspot position={UPPER_ISLAND_HOTSPOT_POSITION} onClick={handleUpperIslandHotspotClick} />
                  <CameraHotspot position={LEFT_TREE_HOTSPOT_POSITION} onClick={handleLeftTreeHotspotClick} />
                  <CameraHotspot position={MOON_ISLAND_HOTSPOT_POSITION} onClick={handleMoonIslandHotspotClick} />
                </>
              )}
            </group>
            <CameraController ref={setCameraControllerRef} />
            <Preload all />
          </Suspense>
        )}
      </Canvas>
      {/* Masks the one-frame pop of EarthIntro unmounting / the island
          scene stopping being occluded (see handleEnterClick) -- a quick
          flash to the Earth's own water color, snapping in fast and
          fading back out, timed to fire exactly when the camera reaches
          the Earth's surface. Driven imperatively via gsap (not React
          state) so it can fire precisely on that callback without a
          re-render in between. */}
      <div ref={diveFlashRef} className="pointer-events-none fixed inset-0 z-20 bg-[#006ce7] opacity-0" />
      {readyToEnter && !islandRevealed && (
        <div className="absolute inset-0 z-10 flex items-end justify-center pb-32">
          <button
            type="button"
            onClick={handleEnterClick}
            disabled={entering}
            className={`rounded-full border border-[#f4ead8] bg-[#d15c0f] px-10 py-3 font-mono text-lg font-bold uppercase tracking-widest text-white shadow-lg transition-opacity duration-500 hover:bg-[#e56b1a] disabled:opacity-50 ${
              entering ? "opacity-0" : "opacity-100"
            }`}
          >
            Enter
          </button>
        </div>
      )}
    </div>
  )
}
