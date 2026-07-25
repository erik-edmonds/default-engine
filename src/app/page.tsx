"use client";

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { ContactShadows, Preload, useProgress } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useAppState } from "@/components/layout/StateProvider";
import { Scene } from "@/components/canvas/Scene";
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController";
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController";
import { ScrambleTitle } from "@/components/canvas/ScrambleTitle";
import { Environment } from "@/components/canvas/Environment";
import { TimeOfDayOrb } from "@/components/canvas/TimeOfDayOrb";
import { NavTotems } from "@/components/canvas/NavTotems";
import type { TimeOfDay } from "@/components/canvas/environmentPresets";
import { ISLAND_CAMERA_POSITION, ISLAND_CAMERA_ROTATION } from "@/components/canvas/earthIntroPath";
import { CameraHotspot } from "@/components/canvas/CameraHotspot";
import * as THREE from "three";
import RainScene from "@/components/canvas/RainScene";
import { useAtomValue } from "jotai";
import { raining } from "@/components/layout/StateProvider";

const STAMP_DURATION_MS = 420;

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour > 6 && hour <= 17) return "day";
  if (hour > 14 && hour <= 18) return "evening";
  return "night";
}

// Where each in-world hotspot marker sits, and the viewpoint the camera
// flies to when it's clicked. Marker positions were found by raycasting a
// probe against the scene mesh (click a landmark, read the world-space hit
// point from the console) -- eyeballing coordinates from a screenshot
// isn't precise enough to land a marker on a specific tree.
const UPPER_ISLAND_HOTSPOT_POSITION: [number, number, number] = [-9.11, 12.97, -13.08];
const UPPER_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(-12.138549003045972, 15.973606020841718, -28.466165069815958);
const UPPER_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.836699146874793, -0.5418705211428874, -2.980689379532905);

const LEFT_TREE_HOTSPOT_POSITION: [number, number, number] = [-14.69, 3.47, -12.94];
const LEFT_TREE_VIEWPOINT_POSITION = new THREE.Vector3(-30.122744508150035, 3.1939029441428497, -17.846728003905334);
const LEFT_TREE_VIEWPOINT_ROTATION = new THREE.Euler(2.9832870595298493, -1.210737021708071, 2.9932851097059734);

const MOON_ISLAND_HOTSPOT_POSITION: [number, number, number] = [11.0, 5.57, -19.72];
const MOON_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(15.098318983889161, 6.795693566831701, -23.697681471253638);
const MOON_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.9175429419626573, 0.625576950652443, 3.0089403059512394);

// "Return to start" -- its viewpoint target is exactly the resting camera
// position/rotation, so the marker sits near the avatar's own setup
// instead of on a distant island.
const HOME_HOTSPOT_POSITION: [number, number, number] = [-4.14, -1.8, 2.82];
const HOME_VIEWPOINT_POSITION = ISLAND_CAMERA_POSITION;
const HOME_VIEWPOINT_ROTATION = ISLAND_CAMERA_ROTATION;

export default function Page() {
  const router = useRouter();
  const { setTheme } = useAppState();
  const [, startTransition] = useTransition();
  const [day, setDay] = useState<TimeOfDay>(getTimeOfDay);
  const [motion, setMotion] = useState(false);
  const [islandMounted, setIslandMounted] = useState(false);
  const [nameStamped, setNameStamped] = useState(false);
  // Which hotspot the camera is currently at -- that one marker hides (no
  // point floating a ring right where you're already standing); every
  // other one shows, including ones already visited, so each spot doubles
  // as a jumping-off point to the rest. Starts at "home" since the camera
  // begins at the resting position, which is exactly home's own target.
  const [activeHotspot, setActiveHotspot] = useState("home");
  const click = useAtomValue(raining)
  const cameraControllerRef = useRef<CameraControllerHandle>(null);
  const avatarControllerRef = useRef<AvatarControllerHandle>(null);
  const nameTextRef = useRef<HTMLHeadingElement>(null);
  const isSequenceRunning = useRef(false);
  const progress = useProgress((state) => state.progress);
  const sceneReady = progress >= 100;

  useEffect(() => {
    router.prefetch("/portfolio");
    const mountTimer = setTimeout(() => startTransition(() => setIslandMounted(true)), 0);
    return () => clearTimeout(mountTimer);
  }, [router, startTransition]);

  useEffect(() => {
    if (!sceneReady) return;
    const timer = setTimeout(() => setNameStamped(true), STAMP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [sceneReady]);

  const handleTimeOfDayChange = (next: TimeOfDay) => {
    setDay(next);
    setTheme(next);
  };

  const flyToHotspot = (id: string, position: THREE.Vector3, rotation: THREE.Euler) => {
    setActiveHotspot(id);
    cameraControllerRef.current?.flyTo(position, rotation);
  };
  const handleUpperIslandHotspotClick = () => flyToHotspot("upper", UPPER_ISLAND_VIEWPOINT_POSITION, UPPER_ISLAND_VIEWPOINT_ROTATION);
  const handleLeftTreeHotspotClick = () => flyToHotspot("left-tree", LEFT_TREE_VIEWPOINT_POSITION, LEFT_TREE_VIEWPOINT_ROTATION);
  const handleMoonIslandHotspotClick = () => flyToHotspot("moon-island", MOON_ISLAND_VIEWPOINT_POSITION, MOON_ISLAND_VIEWPOINT_ROTATION);
  const handleHomeHotspotClick = () => flyToHotspot("home", HOME_VIEWPOINT_POSITION, HOME_VIEWPOINT_ROTATION);

  const handleUpClick = async () => {
    if (isSequenceRunning.current) return;
    isSequenceRunning.current = true;
    await cameraControllerRef.current?.zoomIn();
    await avatarControllerRef.current?.spinAndTransform("dragonite");
    await Promise.all([cameraControllerRef.current?.flyUp(), avatarControllerRef.current?.flyUp()]);
    cameraControllerRef.current?.beginSkyJourney();
    avatarControllerRef.current?.beginSkyJourney();
    isSequenceRunning.current = false;
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

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className={`pointer-events-none absolute left-40 top-3/5 z-10 font-sans transition-all duration-300 ${motion ? "invisible" : "visible"}`}>
        <div className="relative">
          {sceneReady && <h1 ref={nameTextRef} className="animate-stamp text-7xl font-bold leading-[0.9] tracking-tight">Erik<br />Edmonds</h1>}
          {nameStamped && <div className="relative mt-0 grid justify-items-end"><ScrambleTitle text="Data Scientist" /></div>}
        </div>
      </div>
      <Canvas id="three-scene-canvas" shadows camera={{ position: ISLAND_CAMERA_POSITION, rotation: ISLAND_CAMERA_ROTATION, fov: 45 }} gl={{ preserveDrawingBuffer: true }} style={{ width: "100vw", height: "100vh" }}>
        <EffectComposer><Bloom mipmapBlur luminanceThreshold={1} levels={2} intensity={1} /></EffectComposer>
        <color attach="background" args={["#0a0a0a"]} />
        {islandMounted && <Suspense fallback={null}>
          <Environment target={day} nameTextRef={nameTextRef} />
          <group>
            <Scene day={day} />
            <AvatarController ref={avatarControllerRef} />
            <ContactShadows opacity={0.25} color="black" position={[0, -10, 0]} scale={50} blur={2.5} far={40} resolution={256} />
            {sceneReady && <>
              <TimeOfDayOrb current={day} onChange={handleTimeOfDayChange} />
              <group visible={!motion}><NavTotems onUp={() => { setMotion(true); handleUpClick(); }} onDown={() => { setMotion(true); handleDownClick(); }} /></group>
              {activeHotspot !== "upper" && <CameraHotspot position={UPPER_ISLAND_HOTSPOT_POSITION} onClick={handleUpperIslandHotspotClick} />}
              {activeHotspot !== "left-tree" && <CameraHotspot position={LEFT_TREE_HOTSPOT_POSITION} onClick={handleLeftTreeHotspotClick} />}
              {activeHotspot !== "moon-island" && <CameraHotspot position={MOON_ISLAND_HOTSPOT_POSITION} onClick={handleMoonIslandHotspotClick} />}
              {activeHotspot !== "home" && <CameraHotspot position={HOME_HOTSPOT_POSITION} onClick={handleHomeHotspotClick} />}
            </>}
          </group>
          <CameraController ref={cameraControllerRef} />
          <Preload all />
        </Suspense>}
      </Canvas>
      {click && <RainScene /> }
    </div>
  );
}
