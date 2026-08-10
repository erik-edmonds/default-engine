"use client";

import * as THREE from "three";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Preload, useProgress } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, Noise } from "@react-three/postprocessing";
import { useAppState, raining, clicked, pointer, inSkyJourney, goHomeRequest } from "@/helpers/StateProvider";
import { Scene } from "@/components/canvas/Scene";
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController";
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController";
import { Environment } from "@/components/canvas/Environment";
import { NavTotems } from "@/components/canvas/NavTotems";
import { type TimeOfDay } from "@/components/canvas/environmentPresets";
import { useTimeOfDayCycle } from "@/helpers/useTimeOfDayCycle";
import { ISLAND_CAMERA_POSITION, ISLAND_CAMERA_ROTATION } from "@/config/positions";
import { CameraHotspot } from "@/components/canvas/CameraHotspot";
import RainScene from "@/components/canvas/RainScene";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import PhaseCube from "@/components/canvas/PhaseCube";
import { NavigationProjector, NavigationProvider } from "@/components/layout/Navigation";
import Rail from "@/components/layout/Rail";
import { Mouse } from "@/helpers/CameraHelpers";
import { Anchor } from "@/helpers/Interfaces";

// Debug
import { CameraTracker } from "@/helpers/CameraHelpers"
import { OrbitControls } from "@react-three/drei";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const OrbitCube = dynamic(() => import("@/components/layout/HUD").then((mod) => mod.ViewCube), {
  ssr: false,
});
const STAMP_DURATION_MS = 420;

const SKY_TEXT_CUES: { threshold: number; text: string; align: "left" | "right" | "center" }[] = [
  { threshold: 75, text: "Digital Nomad", align: "left" },
  { threshold: 225, text: "Pokémon Trainer at Heart", align: "right" },
  { threshold: 375, text: "Certified Scuba Diver", align: "left" },
  { threshold: 525, text: "Let's Connect — Contact Me", align: "center" },
];

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour > 4 && hour <= 6) return "dawn";
  if (hour > 6 && hour <= 17) return "day";
  if (hour > 14 && hour <= 18) return "evening";
  return "night";
}

const UPPER_ISLAND_HOTSPOT_POSITION: [number, number, number] = [-9.11, 12.97, -13.08];
const UPPER_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(-12.138549003045972, 15.973606020841718, -28.466165069815958);
const UPPER_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.836699146874793, -0.5418705211428874, -2.980689379532905);

const LEFT_TREE_HOTSPOT_POSITION: [number, number, number] = [-14.69, 3.47, -12.94];
const LEFT_TREE_VIEWPOINT_POSITION = new THREE.Vector3(-30.122744508150035, 3.1939029441428497, -17.846728003905334);
const LEFT_TREE_VIEWPOINT_ROTATION = new THREE.Euler(2.9832870595298493, -1.210737021708071, 2.9932851097059734);

const MOON_ISLAND_HOTSPOT_POSITION: [number, number, number] = [11.0, 5.57, -19.72];
const MOON_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(15.098318983889161, 6.795693566831701, -23.697681471253638);
const MOON_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.9175429419626573, 0.625576950652443, 3.0089403059512394);

const SECTIONS = [
  { id: "home", scroll: 0.00 },
  { id: "work", scroll: 0.33 },
  { id: "about", scroll: 0.66 },
  { id: "contact", scroll: 1.00 },
];

const ANCHORS: Anchor[] = [
  { id: "home", label: "Home", position: [-1.3, -0.65, 1],   scroll: 0.00 },
  { id: "models",   label: "Models", position: [-14.69, 3.47, -12.94], scroll: 0.33 },
  { id: "donate",  label: "Donate", position: [11.0, 5.57, -19.72],  scroll: 0.66 },
  { id: "contact", label: "Contact", position: [-9.11, 12.97, -13.08], scroll: 1.00 }
  ];

const HOME_HOTSPOT_POSITION: [number, number, number] = [-4.14, -1.8, 2.82];
const HOME_VIEWPOINT_POSITION = ISLAND_CAMERA_POSITION;
const HOME_VIEWPOINT_ROTATION = ISLAND_CAMERA_ROTATION;

export default function Page() {
  const router = useRouter();
  const { setTheme } = useAppState();
  const [, startTransition] = useTransition();
  // Fixed initial value, corrected to the real time-of-day in an effect
  // below -- calling getTimeOfDay() directly in useState() runs it once on
  // the server and again at hydration, and a real-clock hour boundary
  // crossed in between (4/6/14/17/18) desyncs server vs. client (same class
  // of bug fixed for the theme atom in StateProvider.tsx). `day` also
  // auto-progresses through phases every couple minutes on its own -- see
  // useTimeOfDayCycle. `from` is the phase Environment/Scene/PhaseCube
  // should animate FROM if they're mounting mid-transition (the norm, since
  // they're Suspense-gated behind 3D asset loading and mount later than
  // this component does).
  const { from: dayFrom, phase: day, transitionSeconds, skipAhead, resetTo } = useTimeOfDayCycle("day");
  const progress = useProgress((state) => state.progress);
  const sceneReady = progress >= 100;
  const [motion, setMotion] = useState(false);
  const [islandMounted, setIslandMounted] = useState(false);
  const [nameStamped, setNameStamped] = useState(false);
  const [skyText, setSkyText] = useState("");
  const [skyTextAlign, setSkyTextAlign] = useState<"left" | "right" | "center">("center");
  const [active, setActive] = useState(0);
  const [activeHotspot, setActiveHotspot] = useState("home");
  const [rainTriggered, setRainTriggered] = useState(false);
  const isRaining = useAtomValue(raining);
  const rotate = useAtomValue(clicked);
  const [dragged, setDragged] = useAtom(pointer);
  const setInSkyJourneyAtom = useSetAtom(inSkyJourney);
  const goHomeRequestValue = useAtomValue(goHomeRequest);
  const cameraControllerRef = useRef<CameraControllerHandle>(null);
  const avatarControllerRef = useRef<AvatarControllerHandle>(null);
  const isSequenceRunning = useRef(false);
  const isInSkyJourney = useRef(false);
  const skyOffset = useRef(0);
  const skyTextRef = useRef("");

  useEffect(() => {
    router.prefetch("/portfolio");
    const mountTimer = setTimeout(() => startTransition(() => setIslandMounted(true)), 0);
    return () => clearTimeout(mountTimer);
  }, [router, startTransition]);

  useEffect(() => { resetTo(getTimeOfDay()); }, [resetTo]);

  useEffect(() => {
    if (!sceneReady) return;
    const timer = setTimeout(() => setNameStamped(true), STAMP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [sceneReady]);

  useEffect(() => {
    if (isRaining) setRainTriggered(true);
  }, [isRaining]);

  useEffect(() => {
    const SKY_JOURNEY_DISTANCE = 600; 
    const SCROLL_SENSITIVITY = 0.4 / 6; 

    const handleWheel = (event: WheelEvent) => {
      // This page has no scrollable content anywhere -- scrolling only ever
      // drives the sky journey. Without this, the browser's native page
      // scroll fires right alongside our own handling of the same wheel
      // event: nothing here visibly moves (nothing on the page overflows),
      // but trackpads still report a elastic "rubber-band" overscroll for a
      // scroll the page never actually performs, which reads as the whole
      // page bouncing. Requires the listener below to be non-passive, or
      // preventDefault is a silent no-op.
      event.preventDefault();
      if (!isInSkyJourney.current) return;
      skyOffset.current = Math.min(Math.max(skyOffset.current + event.deltaY * SCROLL_SENSITIVITY, 0), SKY_JOURNEY_DISTANCE);
      cameraControllerRef.current?.setSkyOffset(skyOffset.current);
      avatarControllerRef.current?.setSkyOffset(skyOffset.current);

      const activeCue = [...SKY_TEXT_CUES].reverse().find((cue) => skyOffset.current >= cue.threshold);
      const nextText = activeCue?.text ?? "";
      if (nextText !== skyTextRef.current) {
        skyTextRef.current = nextText;
        setSkyText(nextText);
        setSkyTextAlign(activeCue?.align ?? "center");
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (goHomeRequestValue > 0) handleGoHome();
  }, [goHomeRequestValue]);

  // Kept in an effect rather than a click handler: with auto-progression,
  // most phase changes never pass through a click, and a handler-only
  // setTheme would leave the favicon frozen on the last *clicked* phase.
  useEffect(() => { setTheme(day); }, [day, setTheme]);

  const flyToHotspot = async (id: string, position: THREE.Vector3, rotation: THREE.Euler) => {
    await cameraControllerRef.current?.flyTo(position, rotation);
    setActiveHotspot(id);
  };
  const handleUpperIslandHotspotClick = () => flyToHotspot("upper", UPPER_ISLAND_VIEWPOINT_POSITION, UPPER_ISLAND_VIEWPOINT_ROTATION);
  const handleLeftTreeHotspotClick = () => flyToHotspot("left-tree", LEFT_TREE_VIEWPOINT_POSITION, LEFT_TREE_VIEWPOINT_ROTATION);
  const handleMoonIslandHotspotClick = () => flyToHotspot("moon-island", MOON_ISLAND_VIEWPOINT_POSITION, MOON_ISLAND_VIEWPOINT_ROTATION);
  const handleHomeHotspotClick = () => flyToHotspot("home", HOME_VIEWPOINT_POSITION, HOME_VIEWPOINT_ROTATION);

  const RAIL_FLY_HANDLERS = [
    handleHomeHotspotClick,
    handleLeftTreeHotspotClick,
    handleMoonIslandHotspotClick,
    handleUpperIslandHotspotClick,
  ];

  const handleUpClick = async () => {
    if (isSequenceRunning.current) return;
    isSequenceRunning.current = true;
    await avatarControllerRef.current?.materializeDragonite();
    await cameraControllerRef.current?.zoomIn();
    await Promise.all([cameraControllerRef.current?.flyUp(), avatarControllerRef.current?.flyUp()]);
    cameraControllerRef.current?.beginSkyJourney();
    avatarControllerRef.current?.beginSkyJourney();
    isInSkyJourney.current = true;
    setInSkyJourneyAtom(true);
    isSequenceRunning.current = false;
  };

  const handleDragoniteRelease = () => {
    setMotion(true);
    handleUpClick();
  };

  const handleDownClick = async () => {
    if (isSequenceRunning.current) return;
    isSequenceRunning.current = true;
    await avatarControllerRef.current?.spinAndTransform("scuba");
    await avatarControllerRef.current?.moveToIslandEdge();
    await avatarControllerRef.current?.diveUnderwater();
    isSequenceRunning.current = false;
    startTransition(() => router.push("/portfolio"));
  };

  const handleGoHome = async () => {
    if (isSequenceRunning.current || !isInSkyJourney.current) return;
    isSequenceRunning.current = true;
    isInSkyJourney.current = false;
    setInSkyJourneyAtom(false);
    skyTextRef.current = "";
    setSkyText("");
    await Promise.all([
      cameraControllerRef.current?.flyTo(HOME_VIEWPOINT_POSITION, HOME_VIEWPOINT_ROTATION),
      avatarControllerRef.current?.returnHome(),
    ]);
    await avatarControllerRef.current?.spinAndTransform("base");
    skyOffset.current = 0;
    setMotion(false);
    isSequenceRunning.current = false;
  };

  return (
    <NavigationProvider>
      <div className="relative h-screen w-screen overflow-hidden">
        <div className={`pointer-events-none absolute bottom-10 left-10 z-10 transition-all duration-300 ${motion || activeHotspot !== "home" ? "invisible" : "visible"}`}>
          <div className="relative">
            {sceneReady && <h1 className="animate-stamp font-nunito text-6xl uppercase tracking-tight text-white">Erik Edmonds</h1>}
            {nameStamped && <p className="font-nunito text-3xl font-normal text-white">Data Scientist</p>}
          </div>
        </div>
        <div className={`pointer-events-none fixed inset-0 z-10 flex items-center px-20 text-5xl font-bold text-white transition-opacity duration-500 ${skyTextAlign === "left" ? "justify-start" : skyTextAlign === "right" ? "justify-end" : "justify-center"}`}
          style={{ opacity: skyText ? 1 : 0 }}>
          <span className="max-w-xl">{skyText}</span>
        </div>
        <div className="flex flex-col justify-items-center absolute right-5 top-5 z-10 bg-[#d25a1a]/50 rounded-xl">
          {/* <Rail sections={SECTIONS} active={active} onSelect={(_s, i) => { setActive(i); RAIL_FLY_HANDLERS[i](); }} phase={day} side="right" /> */}
          <PhaseCube from={dayFrom} phase={day} transitionSeconds={transitionSeconds} onAdvance={skipAhead} />
          
        </div>
        <Canvas id="three-scene-canvas" shadows="soft" camera={{ position: ISLAND_CAMERA_POSITION, rotation: ISLAND_CAMERA_ROTATION, fov: 45 }}
          onPointerDown={() => {
            setDragged(true)
          }}
          onPointerUp={() => setDragged(false)}
          gl={{ preserveDrawingBuffer: true }} style={{ width: "100vw", height: "100vh" }}>
          <EffectComposer>
            <N8AO aoRadius={1.2} intensity={1.2} distanceFalloff={1} quality="medium" />
            <Bloom mipmapBlur={false} luminanceThreshold={1} intensity={1} />
          </EffectComposer>
          <color attach="background" args={["#0a0a0a"]} />
          {islandMounted && <Suspense fallback={null}>
            <Environment from={dayFrom} target={day} transitionSeconds={transitionSeconds} />
            <group>
              <Scene from={dayFrom} day={day} transitionSeconds={transitionSeconds} onDragoniteRelease={handleDragoniteRelease} />
              <AvatarController ref={avatarControllerRef} />
              <ContactShadows opacity={0.42} color="black" position={[0, -10, 0]} scale={50} blur={1.8} far={40} resolution={512} />
              {sceneReady && <> 
                {/* <group visible={!motion}><NavTotems onUp={() => { setMotion(true); handleUpClick(); }} onDown={() => { setMotion(true); handleDownClick(); }} /></group> */}
                {activeHotspot !== "upper" && <CameraHotspot position={UPPER_ISLAND_HOTSPOT_POSITION} onClick={handleUpperIslandHotspotClick} />}
                {activeHotspot !== "left-tree" && <CameraHotspot position={LEFT_TREE_HOTSPOT_POSITION} onClick={handleLeftTreeHotspotClick} />}
                {activeHotspot !== "moon-island" && <CameraHotspot position={MOON_ISLAND_HOTSPOT_POSITION} onClick={handleMoonIslandHotspotClick} />}
                {activeHotspot !== "home" && <CameraHotspot position={HOME_HOTSPOT_POSITION} onClick={handleHomeHotspotClick} />}
              </>}
            </group>
            {/* dragged && rotate && <Mouse /> */}
            <CameraController ref={cameraControllerRef} />
            <NavigationProjector anchors={ANCHORS} onActiveChange={setActive} />

            <Preload all />
          </Suspense>}
        </Canvas>
        {rainTriggered && <RainScene />}
      </div>
    </NavigationProvider>
  );
}
