"use client";

import * as THREE from "three";
import dynamic from "next/dynamic";
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, PerformanceMonitor, Preload, useProgress } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useAppState, raining, clicked, pointer, inSkyJourney, goHomeRequest, musicEnabled, titleScreenActive, sfxEnabled, portalExitRequest, portalEnterRequest } from "@/helpers/StateProvider";
import { useSfx } from "@/helpers/useSfx";
import SoundToggle from "@/components/layout/SoundToggle";
import { Scene } from "@/components/canvas/Scene";
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController";
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController";
import { Environment } from "@/components/canvas/Environment";
import { SunFlare } from "@/components/canvas/SunFlare";
import { useTimeOfDayCycle } from "@/helpers/useTimeOfDayCycle";
import { timeOfDay } from "@/helpers/timeOfDay";
import { PRESETS } from "@/components/canvas/environmentPresets";
import { PORTALS, portalById } from "@/config/portals";
import { PortalInterior } from "@/components/canvas/PortalInteriors";
import { PortalDestination } from "@/components/layout/PortalDestination";
import { openPortalId } from "@/helpers/StateProvider";
import { SceneBoundary } from "@/components/layout/SceneBoundary";
import { SceneFallback } from "@/components/layout/SceneFallback";
import { useContextLoss } from "@/helpers/useContextLoss";
import { ISLAND_CAMERA_POSITION, ISLAND_CAMERA_ROTATION } from "@/config/positions";
import { CameraHotspot } from "@/components/canvas/CameraHotspot";
import { HotspotPortal, PORTAL_HEIGHT, portalTransformFor } from "@/components/canvas/HotspotPortal";
import { PortalRouteSync } from "@/components/canvas/PortalRouteSync";
import { HintAnchor } from "@/components/canvas/HintAnchor";
import { SceneHint } from "@/components/layout/SceneHint";
import { CursorDriver } from "@/components/canvas/CursorDriver";
import { CameraLook } from "@/components/canvas/CameraLook";
import { JourneyPath } from "@/components/canvas/JourneyPath";
import { RainRefraction } from "@/components/canvas/RainRefraction";
import { SceneCursor } from "@/components/layout/SceneCursor";
import { useHintDirector } from "@/helpers/useHintDirector";
import { useCoarsePointer } from "@/helpers/useCoarsePointer";
import { setSceneInputSuppressed } from "@/helpers/cursor";
import { useShortViewport } from "@/helpers/useShortViewport";
import {
  JOURNEY_SCROLL_SCREENS,
  JOURNEY_STOPS,
  JOURNEY_STOP_SCROLL,
  journeyUForScroll,
  routeBetween,
  type JourneyStopId,
} from "@/config/journey";
import { SKY_JOURNEY_DISTANCE, SKY_TEXT_CUES } from "@/config/skyJourney";
import { requestSceneFullscreen } from "@/helpers/fullscreen";
import { tweenDuration } from "@/helpers/motion";
import RainScene from "@/components/canvas/RainScene";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import PhaseCube from "@/components/canvas/PhaseCube";
import { NavigationProvider } from "@/components/layout/Navigation";
import { LoadingScreen, type LoadingScreenHandle } from "@/components/layout/LoadingScreen";
import { InteractionHint } from "@/components/layout/InteractionHint";
import { JourneyRail } from "@/components/layout/JourneyRail";
import { Minimap } from "@/components/layout/Minimap";
import { MinimapOverlay } from "@/components/layout/MinimapOverlay";
import { MinimapMarker } from "@/components/canvas/MinimapRenderer";

// Debug

const STAMP_DURATION_MS = 420;
// Where the bloom lands once the arrival has ramped it up from 0.
const BLOOM_INTENSITY = 0.85;
/** How long the ring labels stay up when the markers first appear. Long enough
 *  to read four short words, short enough not to become permanent chrome. */
const LABEL_INTRO_MS = 3500;



const UPPER_ISLAND_HOTSPOT_POSITION: [number, number, number] = [-9.11, 12.97, -13.08];
const UPPER_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(-12.138549003045972, 15.973606020841718, -28.466165069815958);
const UPPER_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.836699146874793, -0.5418705211428874, -2.980689379532905);

const LEFT_TREE_HOTSPOT_POSITION: [number, number, number] = [-14.69, 3.47, -12.94];
const LEFT_TREE_VIEWPOINT_POSITION = new THREE.Vector3(-30.122744508150035, 3.1939029441428497, -17.846728003905334);
const LEFT_TREE_VIEWPOINT_ROTATION = new THREE.Euler(2.9832870595298493, -1.210737021708071, 2.9932851097059734);

const MOON_ISLAND_HOTSPOT_POSITION: [number, number, number] = [11.0, 5.57, -19.72];
const MOON_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(15.098318983889161, 6.795693566831701, -23.697681471253638);
const MOON_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.9175429419626573, 0.625576950652443, 3.0089403059512394);

const HOME_HOTSPOT_POSITION: [number, number, number] = [-4.14, -1.8, 2.82];

/** One label per hotspot id, read by the 3D ring markers. */
const HOTSPOT_LABELS: Record<string, string> = {
  home: "Home",
  "left-tree": "Models",
  "moon-island": "Donate",
  upper: "Contact",
};
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
/** Viewpoints by hotspot id, so config/portals.ts can stay free of geometry --
 *  it describes what each portal CONTAINS and where it GOES; where it stands is
 *  a property of the island. */
const HOTSPOT_VIEWPOINT_BY_ID = {
  "left-tree": { position: LEFT_TREE_VIEWPOINT_POSITION, rotation: LEFT_TREE_VIEWPOINT_ROTATION },
  "moon-island": { position: MOON_ISLAND_VIEWPOINT_POSITION, rotation: MOON_ISLAND_VIEWPOINT_ROTATION },
  upper: { position: UPPER_ISLAND_VIEWPOINT_POSITION, rotation: UPPER_ISLAND_VIEWPOINT_ROTATION },
} as const;

const HOTSPOT_PORTALS = PORTALS.map((portal) => ({
  ...portal,
  ...portalTransformFor(HOTSPOT_VIEWPOINT_BY_ID[portal.hotspotId].position, HOTSPOT_VIEWPOINT_BY_ID[portal.hotspotId].rotation),
}));

// Nothing to preload for the portal interiors any more.
//
// This used to warm earth.glb for the About globe. All three interiors are now
// either generated (the point cloud, which moved to About) or already in the
// scene's cache (the avatar; the water's own assets load with WaterScene), so
// there is no third file left to fetch.

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

// Where the "double-click to enter" caption pins itself at each portal-bearing
// hotspot: on the axis of the portal, tucked just under its bottom edge. Below
// rather than on it, because the portal is the subject and covers most of the
// frame -- a caption over the middle of it would read as part of the artwork
// inside. `home` is absent on purpose: it has no portal, so the hint has
// nothing to point at there and simply never fires.
const PORTAL_HINT_TARGETS: Record<string, THREE.Vector3> = Object.fromEntries(
  HOTSPOT_PORTALS.map((portal) => [
    portal.hotspotId,
    portal.position.clone().setY(portal.position.y - PORTAL_HEIGHT / 2 - 0.3),
  ]),
);

// --- touch navigation: scrolling through the scene -------------------------
//
// The whole journey is one continuous scroll along an authored path (see
// config/journey.ts) that sweeps around the outside of the island cluster and
// passes through each destination's viewpoint on the way. Nothing here is
// automatic: the scroll position IS the camera's position along that path.
//
// How close to a destination's own point on the path counts as being parked
// there. Only inside this window does that destination's portal become
// enterable -- sweeping past one at speed should not let you fall into it.
// 0.012 of the path is roughly a second of unhurried scrolling.
const ARRIVAL_WINDOW = 0.012;
/** What hotspotNav reads as while between destinations. Matches no portal and
 *  no ring, which is the point. */
const IN_TRANSIT = "transit";

/** Which destination the camera is parked at, or IN_TRANSIT. */
function stopAt(u: number) {
  for (const stop of JOURNEY_STOPS) if (Math.abs(u - stop.u) <= ARRIVAL_WINDOW) return stop.id as string;
  return IN_TRANSIT;
}

/** The four ids routeBetween understands, as a set, so a nav id read from
 *  component state can be narrowed before being handed to it. */
const JOURNEY_STOP_ID_SET = new Set<string>(JOURNEY_STOPS.map((s) => s.id));
const asJourneyStop = (id: string | null): JourneyStopId | null =>
  id !== null && JOURNEY_STOP_ID_SET.has(id) ? (id as JourneyStopId) : null;

/** The destinations with a portal standing at them -- everywhere the rail may
 *  be used to leave from. Home is deliberately not one: it has no portal (see
 *  HOTSPOT_PORTALS), so there is nothing there to have arrived at. */
const PORTAL_STOP_IDS = new Set<string>(HOTSPOT_PORTALS.map((p) => p.hotspotId));

/** Where the scroll has to be put for the camera to be parked at a
 *  destination: the middle of its hold, so arriving does not leave it on the
 *  edge of moving off again. */
function scrollForStop(id: JourneyStopId) {
  const stop = JOURNEY_STOP_SCROLL.find((s) => s.id === id);
  return stop ? (stop.scroll + stop.holdUntil) / 2 : 0;
}

export default function Page() {
  const router = useRouter();
  const { setTheme } = useAppState();
  const [, startTransition] = useTransition();
  // Fixed initial value, corrected to the real time-of-day in an effect
  // below -- calling timeOfDay() directly in useState() runs it once on
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
  // drei tracks every asset that failed to load and nothing was reading it, so
  // a 404'd model was indistinguishable from one still downloading -- the
  // loader simply sat there. These are the URLs that will never arrive.
  const assetErrors = useProgress((state) => state.errors);
  const { lost: contextLost, onCreated: watchContext } = useContextLoss();
  // Which portal is open, published by PortalRouteSync from the wouter route.
  // Outside <Canvas> nothing can call wouter (see PortalRouteSync's note), so
  // the atom is how the DOM layer learns a portal has been entered.
  const openPortal = portalById(useAtomValue(openPortalId));
  // The same value where a bare event listener can read it. onScrollTick runs
  // from a window listener registered once, so it reads every gate through a
  // ref rather than closing over the render's value -- see scrollNavActive.
  const openPortalRef = useRef(openPortal);
  // Written from an effect, not during render: the compiler's react-hooks/refs
  // rule rejects the latter, and a one-commit lag is immaterial to a listener
  // that only runs on a user gesture.
  useEffect(() => { openPortalRef.current = openPortal }, [openPortal]);
  const [motion, setMotion] = useState(false);
  const [islandMounted, setIslandMounted] = useState(false);
  // Gates the loading screen: once the scene can render (sceneReady) but
  // before `started`, LoadingScreen's point cloud is up and the scene is
  // inert (see CameraHotspot below); clicking Enter runs LoadingScreen's
  // burst() dissolve, which only flips `started` once it resolves.
  const [started, setStarted] = useState(false);
  // How far through the arrival the reveal has got. The world used to arrive
  // in the single commit where `started` flipped -- bloom, the four hotspot
  // rings, the name, the HUD, all at once -- so the plate dissolved smoothly
  // and then everything popped. Each stage is a beat of that same arrival:
  // 1 the name stamps, 2 the HUD, 3 the hotspot rings.
  const [revealStage, setRevealStage] = useState(0);
  /** All four ring labels show together for a beat when the markers appear,
   *  then go hover-only. One clock here rather than four inside the markers,
   *  so they cannot drift apart. */
  const [labelsIntro, setLabelsIntro] = useState(false);
  /** Neither prop publishes a "used it" signal of its own, and hasInteracted
   *  is set by every hotspot flight, so it cannot stand in for these. */
  const [pokeballUsed, setPokeballUsed] = useState(false);
  // Upper bound on device pixel ratio, walked by PerformanceMonitor below.
  const [dprCeiling, setDprCeiling] = useState(2);
  // Flips on the click, before burst() has even started -- `started` is 420ms
  // later. Only <Bloom> uses it, so its shader compile is paid while the black
  // plate still covers the screen instead of on a bare frame.
  const [entering, setEntering] = useState(false);
  const loadingScreenRef = useRef<LoadingScreenHandle>(null);
  // The Bloom effect instance, ramped by gsap rather than by React state --
  // driving intensity through state would re-render this component and the
  // whole canvas tree every frame across the one second where smoothness
  // matters most.
  const bloomRef = useRef<{ intensity: number } | null>(null);
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
  /** The island map, expanded. Desktop only -- see the Minimap mount below. */
  const [mapOpen, setMapOpen] = useState(false);
  // Make the world inert while full-screen chrome covers it.
  //
  // Both of these hide the scene completely, and until now the scene did not
  // know: the custom cursor bypasses r3f's event system entirely, so from
  // inside a portal it still magnetised to clouds and hotspot rings behind the
  // portal and a click still fired them. See setSceneInputSuppressed.
  useEffect(() => {
    setSceneInputSuppressed(Boolean(openPortal) || mapOpen);
    // Restoring on unmount matters more than it looks: the flag is module
    // state, so a page that unmounted while suppressed would leave the next
    // mount's scene dead.
    return () => setSceneInputSuppressed(false);
  }, [openPortal, mapOpen]);
  // Entering/leaving a portal is expressed entirely as the wouter route
  // Card.tsx's Frame already reads (`/item/:id`), so there's no separate
  // "which portal is open" state here. All wouter calls live in
  // PortalRouteSync (inside <Canvas>) because wouter reads `location` at
  // render and this page is statically prerendered; this atom is how we ask
  // it to close an open portal.
  const requestPortalExit = useSetAtom(portalExitRequest);
  /** Close an open portal on the way somewhere else. The caller is already
   *  flying, so PortalRouteSync must not also fly back out to the portal's
   *  viewpoint -- see portalExitRequest. */
  const closePortal = useCallback(
    () => requestPortalExit((prev) => ({ seq: prev.seq + 1, flyBack: false })),
    [requestPortalExit],
  );
  /** Open the portal standing at a given destination.
   *
   *  The keyboard's way in. Entering is otherwise a double-click or a
   *  press-and-hold on the portal mesh, so before this a keyboard user could
   *  fly to a destination and then had no way to go into it. Routed through the
   *  same wouter /item/:id that a double-click writes, via PortalRouteSync --
   *  one way a portal opens, not two. */
  const requestPortalEnter = useSetAtom(portalEnterRequest);
  const enterPortalByKeyboard = useCallback(
    (stop: JourneyStopId) => {
      const portal = HOTSPOT_PORTALS.find((p) => p.hotspotId === stop);
      if (!portal) return;
      requestPortalEnter((prev) => ({ seq: prev.seq + 1, id: portal.id }));
    },
    [requestPortalEnter],
  );

  /** Step back out of a portal to where it is seen from, and stop there. The
   *  home button's meaning while a portal is open. */
  const exitPortal = useCallback(
    () => requestPortalExit((prev) => ({ seq: prev.seq + 1, flyBack: true })),
    [requestPortalExit],
  );
  // Drives InteractionHint's dismissal: flips true on the first genuine
  // interaction (a hotspot, the Poke Ball, or the Gear), or after an ~8s
  // timeout below if the user hasn't touched anything yet.
  const [hasInteracted, setHasInteracted] = useState(false);
  // SSR-safe (fixed on the first render, corrected in an effect) -- same
  // pattern as timeOfDay() in helpers/timeOfDay.ts. Gates the heaviest postprocessing passes,
  // which are the single biggest mobile GPU-performance risk in this scene.
  // Lifted into a shared hook because Card.tsx needs the same answer to decide
  // between double-click and press-and-hold portal entry.
  const isCoarsePointer = useCoarsePointer();
  const isShortViewport = useShortViewport();
  const isRaining = useAtomValue(raining);
  const rotate = useAtomValue(clicked);
  const [dragged, setDragged] = useAtom(pointer);
  const setInSkyJourneyAtom = useSetAtom(inSkyJourney);
  // Read, not just written: the journey rail hides while the sky sequence
  // owns the camera, since the scroll no longer means anything then.
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
    // Synchronously, before any await: a fullscreen request made after one is
    // judged to have lost its user gesture and is refused. Does nothing on
    // iPhone, which has no Fullscreen API for ordinary elements -- that is
    // what the scroll spacer below is for.
    requestSceneFullscreen();
    setEntering(true);
    // A real user gesture -- flips sound on here (not before) so every
    // gated Howl (SoundToggle's waves.mp3, Speaker's music.mp3, Sky.tsx's
    // rain.mp3) can start playing with no autoplay restriction to work
    // around. Set before playSfx("click") so the Enter click's own sound
    // is included, not silently swallowed by the switch still being off.
    setSfxEnabled(true);
    playSfx("click");
    // Started alongside the burst, not after it: intro() snaps the camera to
    // its pulled-back start immediately, and doing that while the plate is
    // still opaque is what makes the dissolve reveal a moving camera rather
    // than a static frame that then starts moving.
    const settled = cameraControllerRef.current?.intro();
    // `started` (which wakes the hotspots/UI back up) only flips once the
    // burst/dissolve animation has actually finished.
    await loadingScreenRef.current?.burst();
    setStarted(true);
    await settled;
  }, [playSfx, setSfxEnabled]);

  // The staggered reveal. gsap rather than a setTimeout chain so it matches
  // burst()'s idiom and cleans itself up on unmount; tweenDuration collapses
  // the whole sequence to near-instant under prefers-reduced-motion.
  useEffect(() => {
    if (!started) return;
    // Ramp the bloom in over the same window instead of popping it. The effect
    // is already mounted (at intensity 0, from the click), so its shader
    // compile happened under the opaque plate rather than on a bare screen.
    // Held so it can be killed: unmounting during the 1.6s ramp otherwise
    // leaves a tween writing .intensity onto a disposed postprocessing effect.
    let bloomTween: gsap.core.Tween | null = null;
    if (bloomRef.current) {
      bloomTween = gsap.to(bloomRef.current, { intensity: BLOOM_INTENSITY, duration: tweenDuration(1.6), ease: "power2.out" });
    }
    const timeline = gsap.timeline();
    timeline.call(() => setRevealStage(1), undefined, tweenDuration(0.5));
    timeline.call(() => setRevealStage(2), undefined, tweenDuration(0.9));
    timeline.call(() => setRevealStage(3), undefined, tweenDuration(1.4));
    return () => { timeline.kill(); bloomTween?.kill(); };
  }, [started]);

  useEffect(() => {
    router.prefetch("/portfolio");
    const mountTimer = setTimeout(() => startTransition(() => setIslandMounted(true)), 0);
    return () => clearTimeout(mountTimer);
  }, [router, startTransition]);

  useEffect(() => { resetTo(timeOfDay()); }, [resetTo]);

  // Keyed to the reveal, not to sceneReady. The <h1>'s animate-stamp used to
  // play the moment loading finished -- underneath the loading screen, where
  // nobody could see it -- so by the time you entered, the name could only
  // fade in flat. Both it and the tagline that follows it now land on the
  // first beat of the arrival.
  useEffect(() => {
    if (revealStage < 1) return;
    const timer = setTimeout(() => setNameStamped(true), STAMP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [revealStage]);

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

  // Contextual hints, picked up where InteractionHint leaves off: nudges
  // toward the guitar and the clouds once the user has gone quiet without
  // finding them, then how to open a portal on arrival and how to leave one
  // from inside. At most one on screen at a time, each at most once per load.
  // It infers what's already been discovered from atoms that exist anyway
  // (musicEnabled, rainRequest, openPortalId), so nothing in the scene has to
  // report to it.
  useHintDirector({
    started,
    hasInteracted,
    currentHotspot: hotspotNav.current,
    pokeballUsed,
    portalTargets: PORTAL_HINT_TARGETS,
  });

  // The markers mount at revealStage 3; hold their labels open long enough to
  // read all four, then let them go hover-only.
  useEffect(() => {
    if (revealStage < 3) return;
    setLabelsIntro(true);
    const timer = setTimeout(() => setLabelsIntro(false), LABEL_INTRO_MS);
    return () => clearTimeout(timer);
  }, [revealStage]);

  useEffect(() => {
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
      // The sky journey captures the gesture outright -- it reads the delta
      // itself and nothing on the page should scroll underneath it.
      if (isInSkyJourney.current) {
        event.preventDefault();
        applyScrollDelta(event.deltaY);
        return;
      }
      // Otherwise, preventDefault ONLY when there is nothing to scroll.
      //
      // This used to be unconditional, written when the page had no scrollable
      // content at all and the only job was suppressing a trackpad's elastic
      // rubber-band for a scroll that never happened. Once the spacer arrived
      // and the document became the navigation, that same line swallowed it:
      // a one-finger touch drag still scrolled (touchmove is left alone), but
      // a two-finger trackpad scroll, a mouse wheel on a tablet, and Chrome's
      // device emulation on a laptop all did nothing at all.
      //
      // Requires the listener below to be non-passive, or preventDefault is a
      // silent no-op.
      if (document.documentElement.scrollHeight <= window.innerHeight + 1) event.preventDefault();
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
      // Only claim the gesture when something is actually going to use it.
      // This used to preventDefault unconditionally and then let
      // applyScrollDelta decide to do nothing, which cancelled every vertical
      // swipe on the page for a feature that is live in a small minority of a
      // session -- and a page that never scrolls is a page whose mobile
      // browser toolbar never retracts. Letting the browser have the gesture
      // is what reclaims that space.
      if (!isInSkyJourney.current) return;
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
    // The OS cancels touches (a call arrives, a system gesture wins). Without
    // this the stale lastTouchY makes the next drag jump.
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  // Kept in an effect rather than a click handler: with auto-progression,
  // most phase changes never pass through a click, and a handler-only
  // setTheme would leave the favicon frozen on the last *clicked* phase.
  useEffect(() => { setTheme(day); }, [day, setTheme]);

  // Desktop's ring markers, and handleGoHome. Touch navigates by scrolling the
  // path instead and never calls this.
  const flyToHotspot = (id: string, position: THREE.Vector3, rotation: THREE.Euler) => {
    setHasInteracted(true);
    const from = asJourneyStop(hotspotNav.current);
    const to = asJourneyStop(id);
    beginHotspotTransition(id);
    playSfx("whoosh");
    // Leaving for any hotspot closes whatever portal was open -- otherwise a
    // blended-in portal would stay blended while the camera flew away from it.
    closePortal();
    // The same authored routes the rail's jumps use. These clicks used to fly
    // a straight line between two viewpoints, which nothing had ever checked
    // for clearance -- the route curves are verified against the terrain.
    const route = from && to ? routeBetween(from, to) : null;
    if (route) return cameraControllerRef.current?.flyRoute(route);
    return cameraControllerRef.current?.flyTo(position, rotation);
  };
  const handleUpperIslandHotspotClick = () => flyToHotspot("upper", UPPER_ISLAND_VIEWPOINT_POSITION, UPPER_ISLAND_VIEWPOINT_ROTATION);
  const handleLeftTreeHotspotClick = () => flyToHotspot("left-tree", LEFT_TREE_VIEWPOINT_POSITION, LEFT_TREE_VIEWPOINT_ROTATION);
  const handleMoonIslandHotspotClick = () => flyToHotspot("moon-island", MOON_ISLAND_VIEWPOINT_POSITION, MOON_ISLAND_VIEWPOINT_ROTATION);
  const handleHomeHotspotClick = () => flyToHotspot("home", HOME_VIEWPOINT_POSITION, HOME_VIEWPOINT_ROTATION);


  // --- touch navigation: scrolling through the scene -----------------------
  //
  // Driven off the document's own scroll (the spacer at the bottom of this
  // file), NOT off captured wheel/touch events. That is deliberate and it is
  // load-bearing: a mobile browser only retracts its toolbar in response to a
  // real scroll, so preventDefault-ing the gesture to read it would silently
  // undo the fix the spacer exists for and cost the scene 60-100px of height.
  // Here the navigation and the toolbar collapse are the same gesture.
  // Set when we move the scroll ourselves, so our own listener doesn't read
  // the resulting event as the visitor scrolling.
  const suppressScrollUntil = useRef(0);
  // Whether to draw the journey path overlay. Read through
  // useSyncExternalStore rather than as state corrected in an effect: this
  // page is statically prerendered, so the server has to say `false` while the
  // client reads the real URL, and that is exactly the split this hook exists
  // for. The subscribe function is a no-op because the flag cannot change
  // without a navigation.
  const showJourneyPath = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).has("path"),
    () => false,
  );

  const scrollFraction = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / max));
  };

  // `!openPortalRef.current` is a bug fix, not bookkeeping for the new scroll.
  // Without it, a document scroll on touch while you are standing inside a
  // portal called setJourney(u) -- restarting the journey spring, which then
  // writes camera.position every frame and drags you off the portal plane while
  // the material blend stays at 1 -- and beginHotspotTransition could flip the
  // open portal's own `interactive` prop off underneath it.
  const scrollNavActive = () =>
    isCoarsePointer && started && !isInSkyJourney.current && !isSequenceRunning.current
    && !isJumping.current && !openPortalRef.current;

  // --- jumping: a direct flight to a destination ---------------------------
  //
  // The rail's taps. Deliberately not a scroll animation to the destination's
  // place in the itinerary: that is what "scroll past Models to reach
  // Contact" would be, and it announces a destination you did not ask for.
  // routeBetween builds a curve straight there instead, the short way round
  // the cluster.
  const isJumping = useRef(false);
  const [jumping, setJumping] = useState(false);
  const handleJump = async (to: JourneyStopId) => {
    if (isJumping.current) return;
    const from = asJourneyStop(hotspotNav.current);
    const route = from && from !== to ? routeBetween(from, to) : null;
    if (!route) return;

    isJumping.current = true;
    setJumping(true);
    // try/finally, not a straight line: isJumping gates scrollNavActive(), so
    // anything that throws between here and the end would leave the flag set
    // and silently disable scroll navigation for the rest of the session --
    // with nothing on screen to say why. The same reasoning applies to
    // isSequenceRunning in handleGoHome and handleUpClick.
    try {
      setHasInteracted(true);
      beginHotspotTransition(to);
      playSfx("whoosh");
      closePortal();
      await cameraControllerRef.current?.flyRoute(route);

      // Re-seat the scroll onto the destination, so the itinerary and the
      // camera agree again and the next scroll carries on from here instead of
      // yanking back to wherever the document was left. The one programmatic
      // scroll in the design, and it fires at the end of a discrete tap --
      // never during a gesture, which is what made the earlier version of this
      // feel like the page was fighting you.
      // Touch only. The rail is the only caller that could be on a coarse
      // pointer anyway, and on desktop the journey spring is never taken up --
      // handing it the camera there would pin the view to the path until the
      // next flight killed it.
      if (isCoarsePointer) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        suppressScrollUntil.current = performance.now() + 250;
        window.scrollTo(0, scrollForStop(to) * max);
        const u = JOURNEY_STOPS.find((s) => s.id === to)?.u ?? 0;
        // Hand the camera back to the journey spring, seeded where the flight
        // left it, or the next scroll would spring it across from u = 0.
        cameraControllerRef.current?.setJourney(u, u);
      }
    } finally {
      isJumping.current = false;
      setJumping(false);
    }
  };

  const onScrollTick = () => {
    if (performance.now() < suppressScrollUntil.current) return;
    if (!scrollNavActive()) return;
    setHasInteracted(true);

    // The whole of it. journeyUForScroll turns the scroll fraction into a
    // distance along the path -- travelling for most of it, and holding still
    // while parked at a destination so the camera stops at the portal rather
    // than sweeping past it. setJourney only sets a target; the spring in
    // CameraController is what moves, which is where the weight comes from.
    // No committed flights and no state machine: scrolling back retraces the
    // way you came, exactly.
    const u = journeyUForScroll(scrollFraction());
    cameraControllerRef.current?.setJourney(u);
    // Keeps the portals' `interactive` gate honest. Safe to call on every
    // scroll event: it returns the previous state unchanged when the id
    // already matches, so React bails out.
    beginHotspotTransition(stopAt(u));
  };

  // The latest-ref pattern, and not a nicety here. Everything above closes over
  // render-scoped values (playSfx, closePortal, `started`, the hotspot
  // helpers); a listener subscribed once with useCallback deps would either go
  // stale mid-session or re-subscribe on every render. A ref reassigned each
  // render means the listener is registered once and always calls the current
  // version.
  const scrollTickRef = useRef(onScrollTick);
  // Deliberately no dependency array: this has to re-point after every commit,
  // and a scroll event cannot be delivered between a render and its effects,
  // so the listener never sees a stale one. (Assigning during render instead
  // would be equivalent here, but react-hooks/refs rightly flags it.)
  useEffect(() => {
    scrollTickRef.current = onScrollTick;
  });

  useEffect(() => {
    if (!isCoarsePointer || !started) return;
    // Browsers restore the scroll position across a reload, so without this a
    // refresh could hand the first scroll event a point part-way along the
    // path and jump the camera there. Start every session at the top, where
    // u = 0 is exactly the pose intro() just landed on.
    if (window.scrollY !== 0) {
      suppressScrollUntil.current = performance.now() + 250;
      window.scrollTo(0, 0);
    }

    const onScroll = () => scrollTickRef.current();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isCoarsePointer, started]);

  const handleUpClick = async () => {
    setHasInteracted(true);
    if (isSequenceRunning.current) return;
    isSequenceRunning.current = true;
    try {
      setMusicEnabled(false);
      await avatarControllerRef.current?.materializeDragonite();
      await cameraControllerRef.current?.zoomIn();
      await Promise.all([cameraControllerRef.current?.flyUp(), avatarControllerRef.current?.flyUp()]);
      cameraControllerRef.current?.beginSkyJourney();
      avatarControllerRef.current?.beginSkyJourney();
      isInSkyJourney.current = true;
      setInSkyJourneyAtom(true);
    } finally {
      isSequenceRunning.current = false;
    }
  };

  const handleDragoniteRelease = () => {
    setPokeballUsed(true);
    setMotion(true);
    handleUpClick();
  };

  // The dive lived here: scuba swap, swim to the island edge, dive with the
  // camera, wash, sessionStorage handshake, route to /portfolio. It is gone
  // because /portfolio already has an entrance -- the Models portal's
  // destination is that page. Two doors to one room, and this was the door you
  // had to find a prop on a beach to open. The wash and DIVE_ARRIVAL_KEY went
  // with it; nothing arrives at /portfolio mid-animation any more.

  /** Fly back to the establishing shot from wherever on the island you are --
   *  the same route, sound and portal-close as any other trip, because it is
   *  the same trip. handleJump already returns early when you are stood at the
   *  destination, so pressing home at home does nothing. */
  const travelHome = () => handleJump("home");

  const handleGoHome = async () => {
    if (isSequenceRunning.current) return;
    // Inside a portal, home means "get me out of this portal" -- back to the
    // viewpoint it is seen from, a step you can see yourself take. It does NOT
    // mean fly to the establishing shot: that throws away where you were, and
    // it is what this button started doing when travelHome became an
    // unconditional handleJump("home"). Press it again, now outside, and the
    // branch below takes you home properly.
    //
    // It also matters for the scroll. handleJump ends by re-seating the
    // document scroll onto its destination, and Home's seat is exactly 0 --
    // Home has no hold band to sit in the middle of -- so flying home from a
    // portal left the page pinned to the top of a 15-screen document with the
    // camera already at the end of the trip. Small scroll gestures then moved
    // nothing, which is why two-finger scrolling looked broken afterwards
    // while a big finger drag still worked. Exiting the portal touches the
    // scroll not at all.
    if (openPortal) {
      exitPortal();
      return;
    }
    // Two different trips home. Out of the sky journey it is a whole sequence
    // -- the avatar has to come down and change back. On the island it is just
    // a flight, and before this it was nothing at all.
    if (!isInSkyJourney.current) {
      await travelHome();
      return;
    }
    isSequenceRunning.current = true;
    // try/finally for the same reason as handleJump: isSequenceRunning also
    // gates scrollNavActive(), so a throw in the middle of this sequence would
    // leave scroll navigation dead with no way back short of a reload.
    try {
      isInSkyJourney.current = false;
      setInSkyJourneyAtom(false);
      // Before the flight below, so the sky driver stops writing the camera
      // and flyTo owns the descent outright.
      cameraControllerRef.current?.endSkyJourney();
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
      // Put the scroll navigation back at the top with the camera, or the next
      // swipe would be read against a scroll position left over from before the
      // sky journey and jump somewhere unrelated along the path.
      if (isCoarsePointer) {
        suppressScrollUntil.current = performance.now() + 250;
        window.scrollTo(0, 0);
        cameraControllerRef.current?.endJourney();
      }
    } finally {
      isSequenceRunning.current = false;
    }
  };

  // Escape leaves a portal, from anywhere.
  //
  // The convention a visitor will try first, and before this it did nothing at
  // all -- the only ways out were the home button in the corner and, on touch,
  // a ring tap. Uses exitPortal, so Escape means exactly what pressing home
  // inside a portal means: step back out to the viewpoint it is seen from,
  // rather than fly to Home.
  // Mark the document once the visitor is navigating by keyboard, so the
  // journey rail can show itself before focus actually reaches it (see
  // .keyboard-rail). Tab only -- arrow keys and Enter are also used by the
  // scene itself, and a mouse user who happens to press one should not be
  // handed navigation chrome they did not ask for.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      document.documentElement.dataset.keyboard = "true";
      window.removeEventListener("keydown", onKeyDown);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Depends on openPortal rather than reading it through a latest-ref: a
  // keydown listener that re-subscribes when a portal opens costs nothing, and
  // the ref version needed a write during render that react-hooks/refs rightly
  // rejects.
  useEffect(() => {
    if (!openPortal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      exitPortal();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPortal, exitPortal]);

  // The latest-ref pattern, as with scrollTickRef above: handleGoHome closes
  // over render-scoped values, and the listener below must always reach the
  // current one without re-subscribing.
  const goHomeRef = useRef(handleGoHome);
  useEffect(() => {
    goHomeRef.current = handleGoHome;
  });

  // Keyed on the counter alone, and de-duplicated by hand. The atom is a
  // monotonically rising number that never returns to 0, so an effect which
  // also depended on the handler would re-fire it on every render that
  // recreated the handler. That was harmless only while handleGoHome opened
  // with a guard that happened to early-return off the island -- it no longer
  // does, because off the island is now exactly when it has work to do.
  const lastGoHomeHandled = useRef(0);
  useEffect(() => {
    if (goHomeRequestValue > 0 && goHomeRequestValue !== lastGoHomeHandled.current) {
      lastGoHomeHandled.current = goHomeRequestValue;
      goHomeRef.current();
    }
  }, [goHomeRequestValue]);

  return (
    <NavigationProvider>
      {/* fixed, so the document underneath can scroll without dragging the
          scene with it -- the <Canvas> sits in normal flow inside here, and
          every absolute overlay resolves against this box. h-[100dvh] rather
          than inset-0 on purpose: on iOS a fixed element's inset-0 resolves
          against the LARGE viewport, which is exactly the "taller than what
          you can see" problem dvh was added to solve. w-full rather than
          w-screen because 100vw overflows by the scrollbar width once the
          page is scrollable. */}
      <div className="fixed inset-x-0 top-0 h-[100dvh] w-full overflow-hidden">
        {/* The name lockup, and the one piece of chrome that genuinely changes
            shape rather than size.

            With room, it sits bottom-left at full size over two lines. On a
            landscape phone -- ~350-430px of height, where the stamp, the HUD
            and the journey rail were all competing for the same few hundred
            pixels -- it moves to the TOP-left, beside the home button, on one
            line with the tagline dropped. That clears the entire bottom edge
            for the rail and stops two elements fighting over one corner.

            The left offset in that state clears the 56px home button plus a
            gap, so the two read as a single lockup rather than a collision. */}
        {/* Hidden while a portal is open. The name sits bottom-left and the
            destination panel sits bottom-centre, and on a phone those are the
            same place: "ERIK EDMONDS / Data Scientist" in orange ran directly
            under the panel's buttons. Faded rather than unmounted so it comes
            back the way it left, and hidden rather than moved because inside a
            portal the island's own title is not what you are looking at.
            aria-hidden and pointer-events-none together keep it out of the
            way of a screen reader and the cursor while it is invisible. */}
        <div
          aria-hidden={revealStage < 1 || !!openPortal}
          className={`pointer-events-none absolute z-10 transition-opacity duration-300 ${revealStage < 1 || openPortal ? "opacity-0" : "opacity-100"}`}
          style={
            isShortViewport
              ? {
                  top: "calc(1.25rem + var(--safe-top))",
                  left: "calc(1.25rem + 56px + 0.75rem + var(--safe-left))",
                }
              : {
                  bottom: "calc(2.5rem + var(--safe-bottom))",
                  left: "calc(2.5rem + var(--safe-left))",
                }
          }
        >
          <div className={isShortViewport ? "flex flex-row items-baseline gap-2" : "relative"}>
            {revealStage >= 1 && <h1 data-cursor="text" className={`scene-type animate-stamp font-nunito uppercase ${isShortViewport ? "text-2xl" : "text-4xl sm:text-5xl md:text-6xl"} tracking-tight text-[#d25a1a]`}>Erik Edmonds</h1>}
            {/* Dropped entirely on a landscape phone rather than shrunk: at
                that height every line costs more than it gives, and the role
                is the least load-bearing string on screen. */}
            {nameStamped && !isShortViewport && <p data-cursor="text" className="scene-type font-nunito font-semibold text-[#d25a1a] text-xl sm:text-2xl md:text-3xl">Data Scientist</p>}
          </div>
        </div>
        {/* Announced, not just drawn. These four captions carry the whole
            narration of the sky journey and a screen reader heard none of it.
            polite rather than assertive: they are commentary on a sequence the
            visitor is driving, not an interruption. */}
        <div role="status" aria-live="polite" className={`pointer-events-none fixed inset-0 z-10 flex items-center px-6 sm:px-12 md:px-20 scene-type text-2xl sm:text-3xl md:text-5xl font-bold text-white transition-opacity duration-500 ${skyTextAlign === "left" ? "justify-start" : skyTextAlign === "right" ? "justify-end" : "justify-center"}`}
          style={{ opacity: skyText ? 1 : 0 }}>
          <span className="max-w-xl">{skyText}</span>
        </div>
        <div
          className={`flex flex-row items-center gap-2 absolute z-10 transition-opacity duration-300 ${sceneReady && revealStage < 2 ? "invisible opacity-0" : "visible opacity-100"}`}
          style={{ top: "calc(1.25rem + var(--safe-top))", right: "calc(1.25rem + var(--safe-right))" }}
        >
          <SoundToggle currentPhase={currentPhase} />
          <PhaseCube from={dayFrom} phase={day} transitionSeconds={transitionSeconds} onAdvance={skipAhead} />
        </div>
        {/* Touch navigates by scrolling through the scene (see the scroll
            state machine above and the spacer at the bottom of this file).
            The rail is the only chrome that navigation gets: it says which of
            the four destinations you are at and lets you jump, and it clears
            itself about a second after you stop scrolling.

            Touch only. Desktop already has four labelled ring markers in the
            world answering the same question, and a rail there would be a
            second answer permanently over the scene.

            Hidden while a portal is open, alongside the name stamp: the rail
            navigates the journey, and inside a portal the journey is not what
            the screen is for. The way out is the home button, which stays. */}
        {isCoarsePointer ? (
          <JourneyRail
            labels={HOTSPOT_LABELS}
            visible={sceneReady && started && !isInSkyJourneyValue && !openPortal}
            horizontal={isShortViewport}
            // Parked at a portal, and not already on the way somewhere else.
            parkedAt={jumping || !PORTAL_STOP_IDS.has(hotspotNav.current) ? null : asJourneyStop(hotspotNav.current)}
            onJump={handleJump}
          />
        ) : (
          /* The same rail, as the keyboard's way into a scene that is otherwise
             pure 3D picking. Hidden until focus enters it (see .keyboard-rail
             in globals.css), so a mouse user still sees only the ring markers
             and the "second answer on screen" objection above still holds.

             `parkedAt` differs from the touch version on purpose. There it
             means "in a portal's hold band", because the rail tracks a
             continuous scroll and jumping only makes sense once you have
             stopped. On desktop the camera is always AT a discrete stop, Home
             included -- so the current stop is simply where you are, and
             gating it on PORTAL_STOP_IDS would leave a keyboard user at Home
             facing four disabled buttons and no way to move. */
          <div className="keyboard-rail">
            <JourneyRail
              labels={HOTSPOT_LABELS}
              visible={sceneReady && started && !isInSkyJourneyValue && !openPortal}
              horizontal={false}
              // NOT gated on `jumping`, unlike the touch rail above.
              //
              // Disabling every stop mid-flight drops keyboard focus: a focused
              // button that becomes disabled hands focus back to <body>, so
              // pressing Enter to travel somewhere silently ejected the user
              // from the rail and they had to Tab all the way back in.
              // beginHotspotTransition already sets hotspotNav to the
              // destination synchronously, so showing it as current throughout
              // the flight keeps the buttons alive and focus where it was.
              // Mashing Enter mid-flight is harmless -- handleJump returns
              // early while isJumping is set.
              parkedAt={asJourneyStop(hotspotNav.current)}
              onJump={handleJump}
              onEnterPortal={enterPortalByKeyboard}
              enterableStops={PORTAL_STOP_IDS}
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
        <SceneBoundary label="island-scene">
        <Canvas id="three-scene-canvas" onCreated={watchContext} shadows="percentage" camera={{ position: ISLAND_CAMERA_POSITION, rotation: ISLAND_CAMERA_ROTATION, fov: 50 }}
          onPointerDown={() => {
            setDragged(true)
          }}
          onPointerUp={() => setDragged(false)}
          dpr={[1, dprCeiling]} style={{ width: "100%", height: "100dvh" }}>
          {/* No runtime quality adaptation existed: a 2019 integrated GPU got the
              same composer, AO and shadow map as an M4 Max. PerformanceMonitor
              watches the real frame rate and walks dpr down a step at a time;
              AdaptiveDpr drops resolution while the camera is moving and
              restores it when things settle. */}
          <PerformanceMonitor
            onDecline={() => setDprCeiling((d) => Math.max(1, +(d - 0.25).toFixed(2)))}
            onIncline={() => setDprCeiling((d) => Math.min(2, +(d + 0.25).toFixed(2)))}
          />
          <AdaptiveDpr pixelated />
          <EffectComposer>
            <N8AO halfRes aoRadius={1.2} intensity={1.2} distanceFalloff={1} quality={isCoarsePointer ? "performance" : "medium"} />
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
            {/* A CALLBACK ref, not an object ref. <Bloom> is a plain function
                component whose wrapper memoises on `JSON.stringify(props)`, and
                in React 19 `ref` arrives as an ordinary prop -- so an object ref
                gets stringified the moment it holds the effect, whose
                parent/children cycle throws and takes the whole canvas down.
                JSON.stringify drops function values, so a callback is safe. */}
            {entering ? <Bloom ref={(effect: unknown) => { bloomRef.current = effect as { intensity: number } | null }} mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.3} intensity={0} radius={0.7} levels={7} /> : <></>}
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
              <Scene from={dayFrom} day={day} transitionSeconds={transitionSeconds} onDragoniteRelease={handleDragoniteRelease} showSeagulls={currentPhase !== "night"} />
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
                  once on a narrow mobile viewport anyway. Touch travels by
                  scrolling instead, so it needs no markers to aim at. */}
              {/* `!openPortal` joins the gate for a reason the others don't
                  share: the rings draw with depthTest={false} and renderOrder
                  998-1000, so an open portal -- which fills the screen -- had
                  them floating ON TOP of its interior. Every other piece of
                  chrome (the rail, the minimap, the name stamp, the hint)
                  already checks this; the rings were the one that didn't. */}
              {sceneReady && revealStage >= 3 && !isCoarsePointer && !openPortal && <>
                {/* <group visible={!motion}><NavTotems onUp={() => { setMotion(true); handleUpClick(); }} onDown={() => { setMotion(true); handleDownClick(); }} /></group> */}
                <CameraHotspot label={HOTSPOT_LABELS["upper"]} labelsIntro={labelsIntro} position={UPPER_ISLAND_HOTSPOT_POSITION} onClick={handleUpperIslandHotspotClick} hidden={isHotspotHidden("upper")} pendingOffscreen={isHotspotPendingOffscreen("upper")} onOffscreen={() => handleHotspotOffscreen("upper")} />
                <CameraHotspot label={HOTSPOT_LABELS["left-tree"]} labelsIntro={labelsIntro} position={LEFT_TREE_HOTSPOT_POSITION} onClick={handleLeftTreeHotspotClick} hidden={isHotspotHidden("left-tree")} pendingOffscreen={isHotspotPendingOffscreen("left-tree")} onOffscreen={() => handleHotspotOffscreen("left-tree")} />
                <CameraHotspot label={HOTSPOT_LABELS["moon-island"]} labelsIntro={labelsIntro} position={MOON_ISLAND_HOTSPOT_POSITION} onClick={handleMoonIslandHotspotClick} hidden={isHotspotHidden("moon-island")} pendingOffscreen={isHotspotPendingOffscreen("moon-island")} onOffscreen={() => handleHotspotOffscreen("moon-island")} />
                <CameraHotspot label={HOTSPOT_LABELS["home"]} labelsIntro={labelsIntro} position={HOME_HOTSPOT_POSITION} onClick={handleHomeHotspotClick} hidden={isHotspotHidden("home")} pendingOffscreen={isHotspotPendingOffscreen("home")} onOffscreen={() => handleHotspotOffscreen("home")} />
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
                  name={portal.title}
                  author={portal.credit}
                  bg={portal.bg}
            // The colour the scene fades its own distant geometry to. A portal
            // you have not walked up to then reads as glass in the sky rather
            // than as the black rectangle it used to be.
            sleepBg={PRESETS[day].fogColor}
                  // Openable only from its own hotspot. The portals are
                  // permanently in the scene, so several are in shot from
                  // home -- and entering one from there put the camera inside
                  // a portal while hotspotNav still said "home", so on exit
                  // the flight landed at that hotspot's viewpoint with its
                  // own marker still showing, right in front of you.
                  // Also interactive while it is the portal you are inside:
                  // a shared /item/:id link lands you in the room without ever
                  // passing through its hotspot, so hotspotNav still says
                  // "home" and the portal would otherwise stay inert and dark.
                  interactive={hotspotNav.current === portal.hotspotId || openPortal?.id === portal.id}
                  open={openPortal?.id === portal.id}
                >
                  <PortalInterior kind={portal.interior} open={openPortal?.id === portal.id} />
                </HotspotPortal>
              ))}
            </group>
            <CameraController ref={cameraControllerRef} />
            {/* Inside the Canvas on purpose -- it owns every wouter call, and
                wouter reads `location` at render, which would break this
                page's static prerender if it ran at the page's top level. */}
            <PortalRouteSync
              portals={HOTSPOT_PORTALS}
              viewpoints={HOTSPOT_VIEWPOINTS}
              cameraControllerRef={cameraControllerRef}
              enterInset={PORTAL_ENTER_INSET}
              // Record WHERE the portal is, not just that one opened. Arriving
              // by double-click has already set this on the way in, but a
              // shared /item/:id link opens a portal with no flight at all --
              // and without this the rail, the ring markers and every route
              // computed from here would still believe you were stood at Home.
              onEnter={(portal) => {
                playSfx("whoosh")
                beginHotspotTransition(portal.hotspotId)
              }}
            />
            {/* Same split as NavigationProjector above: the projection needs
                the camera so it lives in here, while the thing it positions is
                a DOM node outside the canvas (SceneHint, below). */}
            <HintAnchor />
            {/* Same split as the projectors above: the driver needs the camera
                so it lives in here, while the thing it positions is a DOM node
                outside the canvas (SceneCursor, below). Desktop only -- there
                is no pointer to replace on a touch device, which is also why
                the hotspot rings and InteractionHint are gated this way. */}
            {/* Inside the Canvas so the drawing-buffer copy happens in the frame
                loop rather than from a timer -- see RainRefraction.tsx. */}
            <RainRefraction />
            {started && !isCoarsePointer && <CursorDriver />}
            {/* The view follows the cursor; the camera never moves. Same
                desktop-only gate as CursorDriver -- it reads the same
                pointerState, which SceneCursor only populates where there is a
                hovering pointer to read. */}
            {started && !isCoarsePointer && <CameraLook />}
            {/* The scroll journey's path, drawn in the scene, for tuning the
                waypoints in config/journey.ts. Off unless the URL says
                otherwise, so it can be switched on against a deployed build. */}
            {showJourneyPath && <JourneyPath />}
            {/* Writes the camera's position onto the minimap's dot every
                frame. Stays in THIS canvas, not the map's own: the dot says
                where the PLAYER is, and this is the camera that knows.

                Its sibling used to be MinimapRenderer, which photographed the
                island into a 512-square texture. The map renders itself now. */}
            {!isCoarsePointer && <MinimapMarker />}
            <Preload all />
          </Suspense>}
        </Canvas>
        </SceneBoundary>
        {/* What the portal actually delivers. Entering used to blend a window
            fullscreen onto a model and stop there -- no content, nothing to do
            and no way onward. */}
        {/* Where you are on the island, and the shape of the route joining the
            four destinations -- neither of which anything on screen said before.
            Desktop only: touch has the rail, and a third answer to "where am I"
            would be one too many.

            Hidden with the rest of the chrome inside a portal, and during the
            sky journey, where the camera is 100 units above the map and the dot
            would sit pinned to an edge claiming a position it does not have. */}
        {/* UNMOUNTED while the overlay is open, not faded.
            
            The overlay renders its own MinimapFace, and each face is now a real
            WebGL context -- on a page that already runs two (the scene, and the
            time-of-day cube). Leaving this one alive behind the overlay would
            make four. `visible` only ever set opacity, which was fine for a
            photograph and is not fine for a renderer. */}
        {!isCoarsePointer && !mapOpen && (
          <Minimap
            visible={sceneReady && started && !isInSkyJourneyValue && !openPortal}
            onOpen={() => setMapOpen(true)}
            phase={day}
          />
        )}
        {!isCoarsePointer && (
          <MinimapOverlay
            open={mapOpen}
            labels={HOTSPOT_LABELS}
            currentStop={hotspotNav.current}
            onPick={(id) => {
              setMapOpen(false);
              handleJump(id);
            }}
            onClose={() => setMapOpen(false)}
            phase={day}
          />
        )}
        {/* No exit control of its own: the home button in the corner is the
            single way out of a portal. */}
        {openPortal && <PortalDestination portal={openPortal} />}
        {/* A lost GPU context used to be a black canvas and nothing else. This
            says so, and clears itself if the browser hands the context back --
            which it only can because the listener calls preventDefault(). */}
        {contextLost && (
          <SceneFallback
            title="Rendering stopped"
            detail="The browser released the graphics context, usually to free memory for another tab. It may come back on its own."
            action="Reload"
            onAction={() => window.location.reload()}
          />
        )}
        {/* An asset that 404s can never finish loading, so without this the
            loader simply sat at whatever percentage it had reached, forever,
            looking identical to a slow connection. */}
        {!started && assetErrors.length > 0 && (
          <SceneFallback
            title="Some of the scene didn't load"
            detail={`${assetErrors.length} file${assetErrors.length === 1 ? "" : "s"} failed to download. The scene may be missing pieces.`}
            action="Try again"
            onAction={() => window.location.reload()}
          />
        )}
        {/* Plain DOM + 2D-canvas overlay, not a second WebGL canvas -- see
            LoadingScreen.tsx for why. Unmounted (not just hidden) once
            `started` flips, so its animation loop actually stops. */}
        {!started && (
          <LoadingScreen ref={loadingScreenRef} progress={progress} isCoarsePointer={isCoarsePointer} onEnter={handleEnter} />
        )}
        {/* Now mounted on touch too, where it carries more weight than it does
            on desktop: with the joystick gone there is no other affordance on
            screen, so this caption is the only thing that says the scene is
            navigated by scrolling. Dismissed by the first scroll, which the
            scroll listener reports as an interaction.

            Not while a portal is open: it describes how to move around the
            island, which is not where you are. */}
        <InteractionHint visible={started && !openPortal} dismissed={hasInteracted} gesture={isCoarsePointer ? "scroll" : "click"} />
        {/* Not gated on pointer type, unlike InteractionHint: everything these
            point at is reachable by touch too, and the copy adapts to the
            gesture that actually works there (see HINTS). */}
        <SceneHint />
        {/* Not before entering: the loading screen is ordinary chrome with a
            button to press, so it keeps the ordinary OS pointer. The custom
            cursor is part of the scene and arrives with it. Unmounted rather
            than hidden, so SceneCursor's own cleanup puts the OS pointer back
            and the driver does no per-frame work while the plate is up. */}
        {started && !isCoarsePointer && <SceneCursor />}
        {rainTriggered && <RainScene />}
      </div>
      {/* The scroll spacer -- now the travel axis for touch navigation, and
          still the entire reason the stage above is fixed.

          It began as a toolbar fix: a mobile browser only retracts its chrome
          in response to a real scroll, and this page had none (the wrapper was
          exactly one viewport tall with overflow hidden, so scrollHeight ===
          clientHeight). It still does that job -- the same swipe that flies
          the camera also collapses the toolbar, which is precisely why this
          navigation reads the document's scroll instead of capturing the
          gesture.

          One viewport taller than the scroll range it has to provide: the
          stage is fixed and contributes nothing to flow, so the spacer IS the
          document, and a document's scrollable range is its height minus one
          viewport. The range itself is the journey's -- travel plus the holds
          at each destination -- so it comes from config/journey.ts rather than
          being restated here, where it would drift the first time the pacing
          changed. Nothing moves while it scrolls; the camera is what responds.

          Touch only. On desktop the wheel handler still preventDefaults (it
          guards a real trackpad rubber-band), so a taller document would only
          add a scrollbar that could never move. */}
      {isCoarsePointer && (
        <div
          aria-hidden="true"
          className="pointer-events-none w-full"
          style={{ height: `${(JOURNEY_SCROLL_SCREENS + 1) * 100}dvh` }}
        />
      )}
    </NavigationProvider>
  );
}
