"use client"

import {  useState, useRef, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import  Image  from "next/image"
import { Canvas } from "@react-three/fiber"
import {  OrbitControls, ContactShadows, SpotLight } from "@react-three/drei"
import { Bloom, EffectComposer } from "@react-three/postprocessing"
import { MoonOutlined, SunOutlined, CloudOutlined, UpOutlined, DownOutlined } from "@ant-design/icons";
import { Flex, Segmented } from "antd";

import { Day } from "@/components/canvas/Day"
import { Evening } from "@/components/canvas/Evening"
import { Night } from "@/components/canvas/Night"
import { Scene } from "@/components/canvas/Scene"
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController"
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController"

import { ScrambleTitle } from "@/components/ScrambleTitle"

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

export default function Page() {
  const router = useRouter()
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

  }, )


  return (
    <div className="relative w-screen h-screen overflow-hidden">
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
              if (event === "day") setColor("light")
              else setColor("dark")
            }}/>
        </Flex>
      </div>
      <div onClick={() => router.push("/")} className="absolute top-10 left-10 z-10">
        <Image
          src={`/images/diamond_${color}.png`}
          width={75}
          height={75}
          alt="Homer"/>
      </div>
      <div className={` ${motion ? "invisible" : "visible"} transition-all transition-discrete duration-300 pointer-events-none absolute top-3/5 left-40 z-10 font-sans text-white`}>
        <div className="relative">
          <h1 className={`text-7xl font-bold text-${COLORS[text]} leading-[0.9] tracking-tight`}>
            Erik<br />Edmonds
          </h1>
          <div className="relative mt-0 grid justify-items-end">
            <ScrambleTitle text="Data Scientist" />
          </div>
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
          position: [-4.928243225199323, 2.4125281238269634, 12.519669594882314],
          rotation: [-0.19036563694483571, -0.36883975963262605, -0.06936299235827743],
          fov: 45}
        } style={{ width: "100vw", height: "100vh" }}>
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={1} levels={2} intensity={1} />
        </EffectComposer>
        <Scene />
        <ActiveComponent />
        <SpotLight position={[-0.3, 110, 5.5]} angle={0.5} decay={0.9} distance={90} penumbra={0.8} intensity={20} color="white"/>
        <SpotLight position={[3, 1, -3]} angle={0.5} decay={1} distance={10} penumbra={0.9} intensity={20} color="white"/>
        <CameraController ref={cameraControllerRef} />
        <AvatarController ref={avatarControllerRef} />
        <ContactShadows opacity={0.25} color="black" position={[0, -10, 0]} scale={50} blur={2.5} far={40} />
      </Canvas>
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
    </div>
  )
}
