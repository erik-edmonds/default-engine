"use client"

import {  useState, useRef, useEffect, Suspense, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, ContactShadows, SpotLight, Preload } from "@react-three/drei"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { MoonOutlined, SunOutlined, CloudOutlined, UpOutlined, DownOutlined } from "@ant-design/icons";
import { Flex, Segmented } from "antd";
import { useAppState } from "@/components/layout/StateProvider"

import { Day } from "@/components/canvas/Day"
import { Evening } from "@/components/canvas/Evening"
import { Night } from "@/components/canvas/Night"
import { Scene } from "@/components/canvas/Scene"
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController"
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController"
import Loading from "@/app/loading"
import { ScrambleTitle } from "@/components/canvas/ScrambleTitle"
import { EarthIntro } from "@/components/canvas/EarthIntro"
import { EARTH_CAMERA_POSITION, ISLAND_CAMERA_ROTATION } from "@/components/canvas/earthIntroPath"

const VIEWS = {
  day: Day,
  evening: Evening,
  night: Night,
};

const COLORS = {
  day: "white",
  evening: "[#242424]",
  night: "black"
};

const SKY_TEXT_CUES: { threshold: number; text: string; align: "left" | "right" | "center" }[] = [
  { threshold: 75, text: "Digital Nomad", align: "left" },
  { threshold: 225, text: "Pokémon Trainer at Heart", align: "right" },
  { threshold: 375, text: "Let's Connect — Contact Me", align: "center" },
];

// Earth-intro sequence: the camera starts framing Earth (positioned along
// the flight path computed in earthIntroPath.ts), holds for INTRO_HOLD_MS,
// then CameraController.revealIsland() pushes it straight forward to the
// homepage's resting shot. The island scene mounts partway through so its
// models have a head start loading before they're actually in frame -- see
// the plan for why this replaced a real-loading-progress-driven reveal (it
// kept racing).
const ISLAND_MOUNT_DELAY_MS = 0
const INTRO_HOLD_MS = 3000
// Must match .animate-stamp's animation-duration in globals.css -- this is
// how long "Erik Edmonds" takes to slam onto the screen before the
// ScrambleTitle beneath it is allowed to start.
const STAMP_DURATION_MS = 420

export default function Page() {
  const router = useRouter()
  const {theme, setTheme} = useAppState()
  const time = () => {
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
  const [day, setDay] = useState(time);
  const [text, setText] = useState(time);
  const [motion, setMotion] = useState(false);
  const [color, setColor] = useState("light");
  const [skyText, setSkyText] = useState("");
  const [skyTextAlign, setSkyTextAlign] = useState<"left" | "right" | "center">("center");
  const ActiveComponent = VIEWS[day];
  const cameraControllerRef = useRef<CameraControllerHandle>(null);
  const avatarControllerRef = useRef<AvatarControllerHandle>(null);
  const isSequenceRunning = useRef(false);
  const isInSkyJourney = useRef(false);
  const skyOffset = useRef(0);
  const skyTextRef = useRef("");

  // Fixed-timeline Earth intro (see ISLAND_MOUNT_DELAY_MS/INTRO_HOLD_MS
  // above): islandMounted starts the island scene loading in the
  // background while the camera is still framing Earth; revealStarted
  // flips the instant the pull-back tween is kicked off (used to drop
  // EarthIntro's extra lighting right away rather than waiting for the
  // tween to finish, so the island isn't over-lit for the whole glide);
  // islandRevealed flips once that tween actually finishes, un-hiding the
  // rest of the page chrome.
  const [islandMounted, setIslandMounted] = useState(false);
  const [revealStarted, setRevealStarted] = useState(false);
  const [islandRevealed, setIslandRevealed] = useState(false);
  // Flips STAMP_DURATION_MS after islandRevealed, once the "Erik Edmonds"
  // stamp animation has actually finished -- gates the ScrambleTitle below
  // it so the intro reads as Earth -> Island -> name stamp -> scramble,
  // rather than the scramble racing the stamp.
  const [nameStamped, setNameStamped] = useState(false);

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
    const timeout = setTimeout(() => setIslandMounted(true), ISLAND_MOUNT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setRevealStarted(true);
      cameraControllerRef.current?.revealIsland().then(() => setIslandRevealed(true));
    }, INTRO_HOLD_MS);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!islandRevealed) return;
    const timeout = setTimeout(() => setNameStamped(true), STAMP_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [islandRevealed]);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {islandRevealed && (
        <div className="absolute top-10 right-1/2 z-10">
          <Flex gap="small" align="flex-end" vertical>
            <Segmented
              size="medium"
              style={{
                backgroundColor: 'rgba(147, 143, 143, 0.5)',
              }}
              defaultValue={time}
              shape="round"
              options={[
                { value: "day", icon: <SunOutlined /> },
                { value: "evening", icon: <CloudOutlined /> },
                { value: "night", icon: <MoonOutlined />},
              ]}
              onChange={(event) => {
                setDay(event)
                setText(event)
                setTheme(event)
                if (event === "day") setColor("light")
                else setColor("dark")
              }}/>
          </Flex>
        </div>
      )}
      <div className={` ${motion ? "invisible" : "visible"} transition-all transition-discrete duration-300 pointer-events-none absolute top-3/5 left-40 z-10 font-sans text-white`}>
        <div className="relative">
          {islandRevealed && (
            <h1 className={`animate-stamp text-7xl font-bold text-${COLORS[text]} leading-[0.9] tracking-tight`}>
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
          position: EARTH_CAMERA_POSITION,
          rotation: ISLAND_CAMERA_ROTATION,
          fov: 45}
        } style={{ width: "100vw", height: "100vh" }}>
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={1} levels={2} intensity={1} />
        </EffectComposer>
        <EarthIntro lit={!revealStarted} />
        {islandMounted && (
          <Suspense fallback={null}>
            <Scene />
            <ActiveComponent />
            <SpotLight position={[-0.3, 110, 5.5]} angle={0.5} decay={0.9} distance={90} penumbra={0.8} intensity={20} color="white"/>
            <SpotLight position={[3, 1, -3]} angle={0.5} decay={1} distance={10} penumbra={0.9} intensity={20} color="white"/>
            <CameraController ref={cameraControllerRef} />
            <AvatarController ref={avatarControllerRef} />
            <ContactShadows opacity={0.25} color="black" position={[0, -10, 0]} scale={50} blur={2.5} far={40} resolution={256} />
            {/* Inside the same Suspense boundary, as the last child, so this
                only mounts (and runs its one-time gl.compile()) once every
                sibling above has actually resolved -- pre-warming shaders
                for the island's real materials, not just whatever existed
                in the scene at t=0 (previously just Earth). Doing this here
                instead of as a sibling after the Suspense block is what
                moves the compile hitch to right now (Earth still fully
                covering the screen) instead of mid-reveal. */}
            <Preload all />
          </Suspense>
        )}
      </Canvas>
      <Loading />
      {islandRevealed && (
        <div className={`${motion ? "invisible" : "visible"} transition-all transition-discrete duration-700 fixed right-6 bottom-10 z-20 flex flex-col gap-3`}>
          <button
            type="button"
            aria-label="Pan camera up"
            onClick={() => {
              setMotion(true)
              handleUpClick()
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30"
          >
            <UpOutlined />
          </button>
          <button
            type="button"
            aria-label="Pan camera down"
            onClick={() => {
              setMotion(true)
              handleDownClick()
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30">
            <DownOutlined />
          </button>
        </div>
      )}
    </div>
  )
}
