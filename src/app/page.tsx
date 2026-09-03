"use client";

import * as THREE from "three";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { Gltf, Preload, useGLTF, useProgress } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, Noise, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useAppState, raining, clicked, pointer, inSkyJourney, goHomeRequest, musicEnabled, titleScreenActive, sfxEnabled, portalExitRequest } from "@/helpers/StateProvider";
import { useSfx } from "@/helpers/useSfx";
import SoundToggle from "@/components/layout/SoundToggle";
import { Scene } from "@/components/canvas/Scene";
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController";
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController";
import { Environment } from "@/components/canvas/Environment";
import { SunFlare } from "@/components/canvas/SunFlare";
import { type TimeOfDay } from "@/components/canvas/environmentPresets";
import { useTimeOfDayCycle } from "@/helpers/useTimeOfDayCycle";
import { ISLAND_CAMERA_POSITION, ISLAND_CAMERA_ROTATION } from "@/config/positions";
import { CameraHotspot } from "@/components/canvas/CameraHotspot";
import { HotspotPortal, portalTransformFor } from "@/components/canvas/HotspotPortal";
import { PortalRouteSync } from "@/components/canvas/PortalRouteSync";
import RainScene from "@/components/canvas/RainScene";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import PhaseCube from "@/components/canvas/PhaseCube";
import { NavigationProjector, NavigationProvider } from "@/components/layout/Navigation";
import { HotspotJoystick } from "@/components/layout/HotspotJoystick";
import { LoadingScreen, type LoadingScreenHandle } from "@/components/layout/LoadingScreen";
import { InteractionHint } from "@/components/layout/InteractionHint";
import { Mouse } from "@/helpers/CameraHelpers";
import { Anchor } from "@/helpers/Interfaces";

// Debug
import { CameraTracker } from "@/helpers/CameraHelpers"
import { OrbitControls } from "@react-three/drei";

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

// One portal standing permanently at each destination viewpoint, framed by a
// carved surround (HotspotPortal.tsx). The ring markers still own navigation --
// fly to a hotspot and its portal is what's waiting in front of the camera;
// double-clicking the portal is what enters it.
//
// Deliberately NOT one for "home": home's viewpoint is the establishing shot
// of the whole island, and a portal placed in front of that camera by the
// same rule would sit dead centre over the avatar and the scene. Three
// destinations, three portals -- which also matches the three distinct GLBs
// the portfolio page uses (it repeats orange.glb for its fourth).
//
// id/name/author/bg/model values are lifted verbatim from app/portfolio's own
// <Frame> usages, so these are the same portals that page renders -- the only
// thing added here is where they stand. `hotspotId` is the island waypoint
// each one is parked in front of; `id` is what Card.tsx's Frame matches its
// own `/item/:id` route on.
const HOTSPOT_PORTALS = [
  {
    hotspotId: "left-tree",
    ...portalTransformFor(LEFT_TREE_VIEWPOINT_POSITION, LEFT_TREE_VIEWPOINT_ROTATION),
    id: "01",
    name: "1",
    author: "Omar Faruq Tawsif",
    bg: "#e4cdac",
    src: "/models/pickles.glb",
    modelScale: 8,
    modelPosition: [0, -0.7, -2] as [number, number, number],
  },
  {
    hotspotId: "moon-island",
    ...portalTransformFor(MOON_ISLAND_VIEWPOINT_POSITION, MOON_ISLAND_VIEWPOINT_ROTATION),
    id: "02",
    name: "2",
    author: "Omar Faruq Tawsif",
    bg: "#f0f0f0",
    src: "/models/tea.glb",
    modelScale: 1,
    modelPosition: [0, -2, -3] as [number, number, number],
  },
  {
    hotspotId: "upper",
    ...portalTransformFor(UPPER_ISLAND_VIEWPOINT_POSITION, UPPER_ISLAND_VIEWPOINT_ROTATION),
    id: "03",
    name: "3",
    author: "Omar Faruq Tawsif",
    bg: "#d1d1ca",
    src: "/models/orange.glb",
    modelScale: 2,
    modelPosition: [0, -0.8, -4] as [number, number, number],
  },
];

// Warms the portal models alongside everything else during the loading screen
// rather than leaving them to <Preload all />'s scene-graph walk alone.
// useGLTF.preload is a static method, not a hook, so module scope is fine.
HOTSPOT_PORTALS.forEach((portal) => useGLTF.preload(portal.src));

// Where the camera ends up when a portal is entered: just short of the plane,
// on the viewpoint side. The portal material's own blend (0 -> 1) is what
// actually takes you "through" -- the flight only has to close the distance.
const PORTAL_ENTER_INSET = 0.3;

// The viewpoint each portal is parked in front of, so backing out of a portal
// can return to exactly where you entered from.
const HOTSPOT_VIEWPOINTS: Record<string, { position: THREE.Vector3; rotation: THREE.Euler }> = {
  "left-tree": { position: LEFT_TREE_VIEWPOINT_POSITION, rotation: LEFT_TREE_VIEWPOINT_ROTATION },
  "moon-island": { position: MOON_ISLAND_VIEWPOINT_POSITION, rotation: MOON_ISLAND_VIEWPOINT_ROTATION },
  upper: { position: UPPER_ISLAND_VIEWPOINT_POSITION, rotation: UPPER_ISLAND_VIEWPOINT_ROTATION },
  home: { position: HOME_VIEWPOINT_POSITION, rotation: HOME_VIEWPOINT_ROTATION },
};

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
  const { from: dayFrom, phase: day, transitionSeconds, skipAhead, resetTo, currentPhase } = useTimeOfDayCycle("day");
  const progress = useProgress((state) => state.progress);
  const sceneReady = progress >= 100;
  const [motion, setMotion] = useState(false);
  const [islandMounted, setIslandMounted] = useState(false);
  // Gates the loading screen: once the scene can render (sceneReady) but
  // before `started`, LoadingScreen's point cloud is up and the scene is
  // inert (see CameraHotspot below); clicking Enter runs LoadingScreen's
  // burst() dissolve, which only flips `started` once it resolves.
  const [started, setStarted] = useState(false);
  const loadingScreenRef = useRef<LoadingScreenHandle>(null);
  // Re-entrancy guard for handleEnter: set synchronously before any await,
  // so a second click during burst() can't fire a second burst.
  const startingRef = useRef(false);
  // Favicon.tsx (the home button) is rendered from layout.tsx, outside this
  // component's tree, so it needs this atom rather than local state to know
  // to hide itself while the loading screen is up.
  const setTitleScreenActive = useSetAtom(titleScreenActive);
  // Must match the LoadingScreen's own mount condition below, which is plain
  // `!started`. Gating on `sceneReady && !started` only covered the window
  // AFTER loading finished but before Enter -- so for the whole time assets
  // were actually loading (sceneReady false), the logo sat on top of the
  // loading screen.
  useEffect(() => { setTitleScreenActive(!started); }, [started, setTitleScreenActive]);
  const [nameStamped, setNameStamped] = useState(false);
  const [skyText, setSkyText] = useState("");
  const [skyTextAlign, setSkyTextAlign] = useState<"left" | "right" | "center">("center");
  const [active, setActive] = useState(0);
  // A marker is hidden in exactly two cases:
  // - `current`: wherever the camera is at/heading to right now -- its own
  //   marker should never be visible in front of you.
  // - `departingFrom`: the single hotspot you *just* left -- hidden only
  //   for as long as it's still inside the camera's view frustum (checked
  //   continuously, see CameraHotspot's onOffscreen), so it can't pop back
  //   into view mid-flight or the instant you arrive somewhere new. Once
  //   it's actually off-screen it reappears on its own -- every other
  //   non-current marker is visible all the time, with no click-gating.
  const [hotspotNav, setHotspotNav] = useState<{ current: string; departingFrom: string | null }>({
    current: "home",
    departingFrom: null,
  });
  const isHotspotHidden = (id: string) => hotspotNav.current === id || hotspotNav.departingFrom === id;
  const isHotspotPendingOffscreen = (id: string) => hotspotNav.departingFrom === id;
  const handleHotspotOffscreen = useCallback((id: string) => {
    setHotspotNav((prev) => (prev.departingFrom === id ? { ...prev, departingFrom: null } : prev));
  }, []);
  // Instant, atomic state transition -- the *only* thing that decides a
  // marker's hidden-ness updates here, synchronously on click, never gated
  // on the camera actually finishing its flight.
  const beginHotspotTransition = useCallback((id: string) => {
    setHotspotNav((prev) => (id === prev.current ? prev : { current: id, departingFrom: prev.current }));
  }, []);
  const [rainTriggered, setRainTriggered] = useState(false);
  // Entering/leaving a portal is expressed entirely as the wouter route
  // Card.tsx's Frame already reads (`/item/:id`), so there's no separate
  // "which portal is open" state here. All wouter calls live in
  // PortalRouteSync (inside <Canvas>) because wouter reads `location` at
  // render and this page is statically prerendered; this atom is how we ask
  // it to close an open portal.
  const requestPortalExit = useSetAtom(portalExitRequest);
  const closePortal = useCallback(() => requestPortalExit((n) => n + 1), [requestPortalExit]);
  // Drives InteractionHint's dismissal: flips true on the first genuine
  // interaction (a hotspot, the Poke Ball, or the Gear), or after an ~8s
  // timeout below if the user hasn't touched anything yet.
  const [hasInteracted, setHasInteracted] = useState(false);
  // Fixed initial value (SSR-safe), corrected on the client -- same pattern
  // as getTimeOfDay() above. Gates the heaviest postprocessing passes, which
  // are the single biggest mobile GPU-performance risk in this scene.
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    setIsCoarsePointer(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  const isRaining = useAtomValue(raining);
  const rotate = useAtomValue(clicked);
  const [dragged, setDragged] = useAtom(pointer);
  const setInSkyJourneyAtom = useSetAtom(inSkyJourney);
  // page.tsx otherwise only *writes* this atom (see setInSkyJourneyAtom
  // above) -- this is a second, independent read, purely to gate the
  // compass HUD's visibility during the sky sequence. Icon.tsx already
  // reads the same atom for the same "hide UI mid-sequence" purpose.
  const isInSkyJourneyValue = useAtomValue(inSkyJourney);
  const goHomeRequestValue = useAtomValue(goHomeRequest);
  const setMusicEnabled = useSetAtom(musicEnabled);
  const setSfxEnabled = useSetAtom(sfxEnabled);
  const playSfx = useSfx();
  const cameraControllerRef = useRef<CameraControllerHandle>(null);
  const avatarControllerRef = useRef<AvatarControllerHandle>(null);
  const isSequenceRunning = useRef(false);
  const isInSkyJourney = useRef(false);
  const skyOffset = useRef(0);
  const skyTextRef = useRef("");
  const handleEnter = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    // A real user gesture -- flips sound on here (not before) so every
    // gated Howl (SoundToggle's waves.mp3, Speaker's music.mp3, Sky.tsx's
    // rain.wav) can start playing with no autoplay restriction to work
    // around. Set before playSfx("click") so the Enter click's own sound
    // is included, not silently swallowed by the switch still being off.
    setSfxEnabled(true);
    playSfx("click");
    // `started` (which wakes the hotspots/UI back up) only flips once the
    // burst/dissolve animation has actually finished.
    await loadingScreenRef.current?.burst();
    setStarted(true);
  }, [playSfx, setSfxEnabled]);

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

  const triggerRain = useCallback(() => setRainTriggered(true), []);
  useEffect(() => {
    if (isRaining) triggerRain();
  }, [isRaining, triggerRain]);

  // The onboarding hint stays up until the user actually moves the pointer --
  // it's telling them the scene is interactive, so it should persist for
  // exactly as long as they haven't worked that out. This replaces a fixed 8s
  // auto-dismiss, which could time out while someone was still reading it.
  // (Real interactions -- a hotspot, the Poke Ball, the Gear -- also set this,
  // elsewhere.)
  useEffect(() => {
    if (!started) return;
    const dismiss = () => setHasInteracted(true);
    // Capture phase: the pointer spends most of its time over the r3f canvas,
    // which handles pointer events itself and can stop them propagating up to
    // window. Capturing runs on the way DOWN from window, so this sees the
    // move regardless of what the canvas does with it afterwards.
    const opts = { once: true, capture: true } as const;
    window.addEventListener("pointermove", dismiss, opts);
    return () => window.removeEventListener("pointermove", dismiss, opts);
  }, [started]);

  useEffect(() => {
    const SKY_JOURNEY_DISTANCE = 600;
    const SCROLL_SENSITIVITY = 0.4 / 6;

    const applyScrollDelta = (deltaY: number) => {
      if (!isInSkyJourney.current) return;
      skyOffset.current = Math.min(Math.max(skyOffset.current + deltaY * SCROLL_SENSITIVITY, 0), SKY_JOURNEY_DISTANCE);
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
      applyScrollDelta(event.deltaY);
    };

    // Touch equivalent of the wheel handler above -- there's no wheel event
    // on a touchscreen at all, so without this the sky journey (and this
    // page in general) is simply inert on mobile. Swiping up (finger moves
    // up the screen) should read the same as scrolling down/forward, so the
    // synthesized delta is the *previous* touch Y minus the current one.
    let lastTouchY: number | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (lastTouchY === null) return;
      event.preventDefault();
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined) return;
      applyScrollDelta(lastTouchY - currentY);
      lastTouchY = currentY;
    };
    const handleTouchEnd = () => {
      lastTouchY = null;
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Kept in an effect rather than a click handler: with auto-progression,
  // most phase changes never pass through a click, and a handler-only
  // setTheme would leave the favicon frozen on the last *clicked* phase.
  useEffect(() => { setTheme(day); }, [day, setTheme]);

  const flyToHotspot = (id: string, position: THREE.Vector3, rotation: THREE.Euler) => {
    setHasInteracted(true);
    beginHotspotTransition(id);
    playSfx("whoosh");
    // Leaving for any hotspot closes whatever portal was open -- otherwise a
    // blended-in portal would stay blended while the camera flew away from it.
    closePortal();
    cameraControllerRef.current?.flyTo(position, rotation);
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

  // Fixed screen-space directions for the mobile joystick (HotspotJoystick) --
  // labels reuse ANCHORS' existing copy for the same landmarks rather than
  // inventing new strings.
  const JOYSTICK_DIRECTIONS = {
    up: { id: "moon-island", label: "Donate", onSelect: handleMoonIslandHotspotClick },
    down: { id: "home", label: "Home", onSelect: handleHomeHotspotClick },
    left: { id: "left-tree", label: "Models", onSelect: handleLeftTreeHotspotClick },
    right: { id: "upper", label: "Contact", onSelect: handleUpperIslandHotspotClick },
  };

  const handleUpClick = async () => {
    setHasInteracted(true);
    if (isSequenceRunning.current) return;
    isSequenceRunning.current = true;
    setMusicEnabled(false);
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
    setHasInteracted(true);
    if (isSequenceRunning.current) return;
    isSequenceRunning.current = true;
    setMusicEnabled(false);
    await avatarControllerRef.current?.spinAndTransform("scuba");
    await avatarControllerRef.current?.moveToIslandEdge();
    await avatarControllerRef.current?.diveUnderwater();
    isSequenceRunning.current = false;
    startTransition(() => router.push("/portfolio"));
  };

  const handleGoHome = useCallback(async () => {
    if (isSequenceRunning.current || !isInSkyJourney.current) return;
    isSequenceRunning.current = true;
    isInSkyJourney.current = false;
    setInSkyJourneyAtom(false);
    skyTextRef.current = "";
    setSkyText("");
    beginHotspotTransition("home");
    // A second way out of a hotspot that doesn't go through flyToHotspot, so
    // it has to close an open portal itself.
    closePortal();
    await Promise.all([
      cameraControllerRef.current?.flyTo(HOME_VIEWPOINT_POSITION, HOME_VIEWPOINT_ROTATION),
      avatarControllerRef.current?.returnHome(),
    ]);
    await avatarControllerRef.current?.spinAndTransform("base");
    skyOffset.current = 0;
    setMotion(false);
    isSequenceRunning.current = false;
  }, [setInSkyJourneyAtom, setSkyText, setMotion, beginHotspotTransition]);

  useEffect(() => {
    if (goHomeRequestValue > 0) handleGoHome();
  }, [goHomeRequestValue, handleGoHome]);

  return (
    <NavigationProvider>
      <div className="relative h-screen w-screen overflow-hidden">
        <div className={`pointer-events-none absolute bottom-10 left-10 z-10 transition-all duration-300 ${!started ? "invisible" : "visible"}`}>
          <div className="relative">
            {sceneReady && <h1 className="animate-stamp font-nunito text-4xl sm:text-5xl md:text-6xl uppercase tracking-tight text-[#d25a1a]">Erik Edmonds</h1>}
            {nameStamped && <p className="font-nunito text-xl sm:text-2xl md:text-3xl font-normal text-[#d25a1a]">Data Scientist</p>}
          </div>
        </div>
        <div className={`pointer-events-none fixed inset-0 z-10 flex items-center px-6 sm:px-12 md:px-20 text-2xl sm:text-3xl md:text-5xl font-bold text-white transition-opacity duration-500 ${skyTextAlign === "left" ? "justify-start" : skyTextAlign === "right" ? "justify-end" : "justify-center"}`}
          style={{ opacity: skyText ? 1 : 0 }}>
          <span className="max-w-xl">{skyText}</span>
        </div>
        <div className={`flex flex-row items-center gap-2 absolute right-5 top-5 z-10 transition-opacity duration-300 ${sceneReady && !started ? "invisible opacity-0" : "visible opacity-100"}`}>
          <SoundToggle currentPhase={currentPhase} />
          <PhaseCube from={dayFrom} phase={day} transitionSeconds={transitionSeconds} onAdvance={skipAhead} />
        </div>
        {/* Superseded by HotspotJoystick below -- kept here, commented out
            rather than deleted, as a one-block revert path (Rail.tsx itself
            is untouched and still fully functional). */}
        {/* <div className="flex lg:hidden absolute bottom-28 left-1/2 -translate-x-1/2 z-10 bg-[#d25a1a]/50 rounded-full px-4 py-2">
          <Rail
            sections={SECTIONS}
            active={active}
            onSelect={(_s, i) => { setActive(i); RAIL_FLY_HANDLERS[i](); }}
            phase={day}
            orientation="horizontal"
          />
        </div> */}
        {/* Mobile/touch only -- the same isCoarsePointer signal that hides
            the 3D ring hotspots below, so the two are perfectly
            complementary: rings show exactly when the joystick doesn't.
            Desktop keeps only the 3D rings, unchanged. */}
        {isCoarsePointer && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10">
            <HotspotJoystick
              directions={JOYSTICK_DIRECTIONS}
              currentId={hotspotNav.current}
              visible={sceneReady && started && !motion && !isInSkyJourneyValue}
            />
          </div>
        )}
        {/* "percentage" (PCFShadowMap), not "soft" (PCFSoftShadowMap) --
            three.js has deprecated PCFSoftShadowMap and silently substitutes
            PCFShadowMap for it at runtime anyway (with a console warning),
            so this is the same shadow map already actually in effect,
            requested directly instead of through the deprecated name. The
            softness Environment.tsx's directional light relies on comes
            from its own shadow-radius, not this type. */}
        <Canvas id="three-scene-canvas" shadows="percentage" camera={{ position: ISLAND_CAMERA_POSITION, rotation: ISLAND_CAMERA_ROTATION, fov: 50 }}
          onPointerDown={() => {
            setDragged(true)
          }}
          onPointerUp={() => setDragged(false)}
          gl={{ preserveDrawingBuffer: true }} dpr={[1, 2]} style={{ width: "100vw", height: "100vh" }}>
          <EffectComposer>
            <N8AO aoRadius={1.2} intensity={1.2} distanceFalloff={1} quality={isCoarsePointer ? "performance" : "medium"} />
            {/* Before Bloom, so the flare's hot core blooms like any other
                highlight rather than sitting flat on top of the image. */}
            <SunFlare />
            {/* Held back until Enter is clicked, so the world visibly "lights up"
                as you enter rather than looking fully lit under the loading screen.
                luminanceThreshold was 1 -- "strictly brighter than white" -- so
                with the composer running a HalfFloat buffer essentially nothing
                ever cleared it. 0.9 catches the sun/moon disc, the water's
                specular dapples, the campfire core and the hottest key-facing
                sand, and nothing else. The 0.3 smoothing is a soft knee so
                pixels crossing the threshold as the sun travels its arc fade in
                instead of popping (the default 0.03 is knife-edged).
                mipmapBlur was explicitly false, which forces postprocessing's
                deprecated half-resolution Kawase path -- true is both wider and
                cheaper. */}
            {started ? <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.3} intensity={0.85} radius={0.7} levels={7} /> : <></>}
            {/* Last, and the single biggest change to how this scene reads.
                <EffectComposer> pins renderer.toneMapping to NoToneMapping
                while it's mounted, and nothing was putting a curve back -- so
                every linear value above 1 clipped flat to white (the lake
                glare, day's brightest sand losing all texture). AgX rolls
                highlights off filmically instead. Outside the `started` gate
                so the curve exists on frame one. */}
            <ToneMapping mode={ToneMappingMode.AGX} />
          </EffectComposer>
          <color attach="background" args={["#0a0a0a"]} />
          {islandMounted && <Suspense fallback={null}>
            <Environment from={dayFrom} target={day} transitionSeconds={transitionSeconds} />
            <group>
              <Scene from={dayFrom} day={day} transitionSeconds={transitionSeconds} downclick={handleDownClick} onDragoniteRelease={handleDragoniteRelease} showSeagulls={currentPhase !== "night"} />
              <AvatarController ref={avatarControllerRef} />
              {/* <ContactShadows> removed. Its plane sat at y = -10, but the
                  water surface resolves to about y = -3.44 -- so it was 6.6
                  units UNDERWATER, and with the camera at y = -1.33 pitched up
                  ~8 degrees the bottom of frame only reaches y = -10 some 34
                  units out, well past the island's ~14 unit radius. It was
                  never in shot. It was not free either: drei defaults
                  frames={Infinity} and renders the whole scene again with an
                  override material every frame, plus four fullscreen blur
                  passes. Real cast shadows (Environment.tsx's key, now at
                  2048 over a +/-26 frustum, with the props actually flagged to
                  cast -- see helpers/useShadows.ts) do the job properly. */}
              {/* Rings hidden on mobile/touch -- their hover-preview affordance
                  (grow, glow, sonar pulse) needs a real hover state that
                  touch doesn't have, and most of the 4 are off-screen at
                  once on a narrow mobile viewport anyway. HotspotJoystick
                  (mounted below, outside the Canvas) is the touch-facing
                  replacement. */}
              {sceneReady && started && !isCoarsePointer && <>
                {/* <group visible={!motion}><NavTotems onUp={() => { setMotion(true); handleUpClick(); }} onDown={() => { setMotion(true); handleDownClick(); }} /></group> */}
                <CameraHotspot position={UPPER_ISLAND_HOTSPOT_POSITION} onClick={handleUpperIslandHotspotClick} hidden={isHotspotHidden("upper")} pendingOffscreen={isHotspotPendingOffscreen("upper")} onOffscreen={() => handleHotspotOffscreen("upper")} />
                <CameraHotspot position={LEFT_TREE_HOTSPOT_POSITION} onClick={handleLeftTreeHotspotClick} hidden={isHotspotHidden("left-tree")} pendingOffscreen={isHotspotPendingOffscreen("left-tree")} onOffscreen={() => handleHotspotOffscreen("left-tree")} />
                <CameraHotspot position={MOON_ISLAND_HOTSPOT_POSITION} onClick={handleMoonIslandHotspotClick} hidden={isHotspotHidden("moon-island")} pendingOffscreen={isHotspotPendingOffscreen("moon-island")} onOffscreen={() => handleHotspotOffscreen("moon-island")} />
                <CameraHotspot position={HOME_HOTSPOT_POSITION} onClick={handleHomeHotspotClick} hidden={isHotspotHidden("home")} pendingOffscreen={isHotspotPendingOffscreen("home")} onOffscreen={() => handleHotspotOffscreen("home")} />
              </>}
              {/* Outside the ring-marker gate above: the portals are real
                  objects standing in the world, not overlay markers, so they
                  stay put on touch devices too (where the joystick, not the
                  rings, does the navigating). */}
              {/* Permanently in the scene -- they never appear or disappear.
                  Note this means three MeshPortalMaterials each render their
                  whole interior to a framebuffer every frame, on top of N8AO +
                  Bloom + the shadow map; if frame time becomes a problem, the
                  portals' `resolution` is the first dial. */}
              {HOTSPOT_PORTALS.map((portal) => (
                <HotspotPortal
                  key={portal.id}
                  position={portal.position}
                  rotation={portal.rotation}
                  id={portal.id}
                  name={portal.name}
                  author={portal.author}
                  bg={portal.bg}
                >
                  <Gltf src={portal.src} scale={portal.modelScale} position={portal.modelPosition} />
                </HotspotPortal>
              ))}
            </group>
            {/* dragged && rotate && <Mouse /> */}
            <CameraController ref={cameraControllerRef} />
            {/* Inside the Canvas on purpose -- it owns every wouter call, and
                wouter reads `location` at render, which would break this
                page's static prerender if it ran at the page's top level. */}
            <PortalRouteSync
              portals={HOTSPOT_PORTALS}
              viewpoints={HOTSPOT_VIEWPOINTS}
              cameraControllerRef={cameraControllerRef}
              enterInset={PORTAL_ENTER_INSET}
              onEnter={() => playSfx("whoosh")}
            />
            <NavigationProjector anchors={ANCHORS} onActiveChange={setActive} />
            <Preload all />
          </Suspense>}
        </Canvas>
        {/* Plain DOM + 2D-canvas overlay, not a second WebGL canvas -- see
            LoadingScreen.tsx for why. Unmounted (not just hidden) once
            `started` flips, so its animation loop actually stops. */}
        {!started && (
          <LoadingScreen ref={loadingScreenRef} progress={progress} isCoarsePointer={isCoarsePointer} onEnter={handleEnter} />
        )}
        {!isCoarsePointer && <InteractionHint visible={started} dismissed={hasInteracted} />}
        {rainTriggered && <RainScene />}
      </div>
    </NavigationProvider>
  );
}
