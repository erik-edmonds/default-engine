"use client"

import {  useState, useRef, useEffect, Suspense, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Canvas } from "@react-three/fiber"
import { ContactShadows, OrbitControls, Preload, useProgress } from "@react-three/drei"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import * as THREE from "three"
import { useAppState } from "@/components/layout/StateProvider"

import { Scene } from "@/components/canvas/Scene"
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController"
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController"
import { ScrambleTitle } from "@/components/canvas/ScrambleTitle"
import { Environment } from "@/components/canvas/Environment"
import { TimeOfDayOrb } from "@/components/canvas/TimeOfDayOrb"
import { NavTotems } from "@/components/canvas/NavTotems"
import { CameraHotspot } from "@/components/canvas/CameraHotspot"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"
import { ISLAND_CAMERA_POSITION, ISLAND_CAMERA_ROTATION } from "@/components/canvas/earthIntroPath"

const SKY_TEXT_CUES: { threshold: number; text: string; align: "left" | "right" | "center" }[] = [
  { threshold: 75, text: "Digital Nomad", align: "left" },
  { threshold: 225, text: "Pokémon Trainer at Heart", align: "right" },
  { threshold: 375, text: "Let's Connect — Contact Me", align: "center" },
];

// No Earth-intro dolly -- the Canvas's camera starts directly at
// ISLAND_CAMERA_POSITION/ROTATION (the resting shot), and the island scene
// mounts as soon as its assets are ready.
const ISLAND_MOUNT_DELAY_MS = 0
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

// Dot 2 -- top of the big left landmass, by the bushy tree to the left of
// the waterfall. Viewpoint reframed (was a dead-end close-up) so the other
// dots are reachable from here too.
const UPPER_ISLAND_HOTSPOT_POSITION: [number, number, number] = [-9.11, 12.97, -13.08]
const UPPER_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(-12.138549003045972, 15.973606020841718, -28.466165069815958)
const UPPER_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.836699146874793, -0.5418705211428874, -2.980689379532905)

// Dot 1 -- by the tree on the small, separate lower-left island (just above
// the "Erik Edmonds" text in the resting shot).
const LEFT_TREE_HOTSPOT_POSITION: [number, number, number] = [-14.69, 3.47, -12.94]
const LEFT_TREE_VIEWPOINT_POSITION = new THREE.Vector3(-30.122744508150035, 3.1939029441428497, -17.846728003905334)
const LEFT_TREE_VIEWPOINT_ROTATION = new THREE.Euler(2.9832870595298493, -1.210737021708071, 2.9932851097059734)

// Dot 3 -- the small rock spire closest to the moon.
const MOON_ISLAND_HOTSPOT_POSITION: [number, number, number] = [11.0, 5.57, -19.72]
const MOON_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(15.098318983889161, 6.795693566831701, -23.697681471253638)
const MOON_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.9175429419626573, 0.625576950652443, 3.0089403059512394)

// "Return to start" -- its viewpoint target is exactly the resting camera
// position/rotation, so this marker sits near the avatar's own setup
// (visible right at the resting shot) rather than on a distant island.
const HOME_HOTSPOT_POSITION: [number, number, number] = [-4.14, -1.8, 2.82]
const HOME_VIEWPOINT_POSITION = ISLAND_CAMERA_POSITION
const HOME_VIEWPOINT_ROTATION = ISLAND_CAMERA_ROTATION

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
  const nameTextRef = useRef<HTMLHeadingElement>(null);
  const isSequenceRunning = useRef(false);
  const isInSkyJourney = useRef(false);
  const skyOffset = useRef(0);
  const skyTextRef = useRef("");

  const [islandMounted, setIslandMounted] = useState(false);
  const [nameStamped, setNameStamped] = useState(false);
  const progress = useProgress((state) => state.progress);
  // Gates the name text and in-world hotspots/orb/totems -- progress
  // (network-load bytes) reaching 100 doesn't mean React has actually
  // *committed* the island's Suspense subtree yet (that commit is real,
  // heavy CPU work reconciling the merged scene's large node tree), so this
  // just tracks asset-load completion as a reasonable proxy for "the
  // resting shot is actually up," without an Enter click to hang it on.
  const sceneReady = progress >= 100
  // Which hotspot the camera is currently resting at -- that one marker
  // hides (you're right there, no need for a ring floating in frame), and
  // every other one shows, so each spot doubles as a jumping-off point to
  // the rest. Starts at "home" since the camera begins at the resting
  // position, which is exactly the home hotspot's own target.
  const [activeHotspot, setActiveHotspot] = useState("home")

  const handleTimeOfDayChange = (next: TimeOfDay) => {
    setDay(next)
    setTheme(next)
  }

  const flyToHotspot = (id: string, position: THREE.Vector3, rotation: THREE.Euler) => {
    setActiveHotspot(id)
    cameraControllerRef.current?.flyTo(position, rotation)
  }

  const handleUpperIslandHotspotClick = () => flyToHotspot("upper", UPPER_ISLAND_VIEWPOINT_POSITION, UPPER_ISLAND_VIEWPOINT_ROTATION)
  const handleLeftTreeHotspotClick = () => flyToHotspot("left-tree", LEFT_TREE_VIEWPOINT_POSITION, LEFT_TREE_VIEWPOINT_ROTATION)
  const handleMoonIslandHotspotClick = () => flyToHotspot("moon-island", MOON_ISLAND_VIEWPOINT_POSITION, MOON_ISLAND_VIEWPOINT_ROTATION)
  const handleHomeHotspotClick = () => flyToHotspot("home", HOME_VIEWPOINT_POSITION, HOME_VIEWPOINT_ROTATION)

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
    if (!sceneReady) return;
    const timeout = setTimeout(() => setNameStamped(true), STAMP_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [sceneReady]);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div className={` ${motion ? "invisible" : "visible"} transition-all transition-discrete duration-300 pointer-events-none absolute top-3/5 left-40 z-10 font-sans`}>
        <div className="relative">
          {sceneReady && (
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
          position: ISLAND_CAMERA_POSITION,
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
        {islandMounted && (
          <Suspense fallback={null}>
            <Environment target={day} nameTextRef={nameTextRef} />
            <group>
              <Scene day={day} />
              <AvatarController ref={avatarControllerRef} />
              <ContactShadows opacity={0.25} color="black" position={[0, -10, 0]} scale={50} blur={2.5} far={40} resolution={256} />
              {sceneReady && (
                <>
                  <TimeOfDayOrb current={day} onChange={handleTimeOfDayChange} />
                  <group visible={!motion}>
                    <NavTotems
                      onUp={() => { setMotion(true); handleUpClick() }}
                      onDown={() => { setMotion(true); handleDownClick() }}
                    />
                  </group>
                  {activeHotspot !== "upper" && (
                    <CameraHotspot position={UPPER_ISLAND_HOTSPOT_POSITION} onClick={handleUpperIslandHotspotClick} />
                  )}
                  {activeHotspot !== "left-tree" && (
                    <CameraHotspot position={LEFT_TREE_HOTSPOT_POSITION} onClick={handleLeftTreeHotspotClick} />
                  )}
                  {activeHotspot !== "moon-island" && (
                    <CameraHotspot position={MOON_ISLAND_HOTSPOT_POSITION} onClick={handleMoonIslandHotspotClick} />
                  )}
                  {activeHotspot !== "home" && (
                    <CameraHotspot position={HOME_HOTSPOT_POSITION} onClick={handleHomeHotspotClick} />
                  )}
                </>
              )}
            </group>
            <CameraController ref={cameraControllerRef} />
            <Preload all />
          </Suspense>
        )}
      </Canvas>
    </div>
  )
}
