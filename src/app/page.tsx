"use client"

import {  useState, useRef, useEffect, Suspense, ViewTransition } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import {  OrbitControls, ContactShadows, Helper } from "@react-three/drei"
import { Bloom, EffectComposer} from "@react-three/postprocessing"
import { MoonOutlined, SunOutlined, CloudOutlined, UpOutlined, DownOutlined } from "@ant-design/icons";
import { Flex, Segmented } from "antd";

import { Day } from "@/components/canvas/Day"
import { Evening } from "@/components/canvas/Evening"
import { Night } from "@/components/canvas/Night"
import { Scene } from "@/components/canvas/Scene"
import { CameraController, type CameraControllerHandle } from "@/components/canvas/CameraController"
import { AvatarController, type AvatarControllerHandle } from "@/components/canvas/AvatarController"
import { SkyClouds } from "@/components/canvas/SkyClouds"

import { ScrambleTitle } from "@/components/ScrambleTitle"

const VIEWS = {
  day: Day,
  evening: Evening,
  night: Night,
};

export default function Page() {
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

  const [day, setDay] = useState(time);
  const [motion, setMotion] = useState(false);
  const ActiveComponent = VIEWS[day];
  const cameraControllerRef = useRef<CameraControllerHandle>(null);
  const avatarControllerRef = useRef<AvatarControllerHandle>(null);
  const isUpSequenceRunning = useRef(false);
  const isInSkyJourney = useRef(false);
  const skyOffset = useRef(0);

  const handleUpClick = async () => {
    if (isUpSequenceRunning.current) return
    isUpSequenceRunning.current = true

    await cameraControllerRef.current?.zoomIn()
    await avatarControllerRef.current?.spinAndTransform()
    await Promise.all([cameraControllerRef.current?.flyUp(), avatarControllerRef.current?.flyUp()])

    cameraControllerRef.current?.beginSkyJourney()
    avatarControllerRef.current?.beginSkyJourney()
    isInSkyJourney.current = true

    isUpSequenceRunning.current = false
  };

  // Once in the sky, scrolling down flies the camera+avatar forward (-Z)
  // past the placeholder clouds (in lockstep, so the avatar stays centered
  // while the clouds appear to approach) — 5 clouds, 100 units apart, plus
  // a little buffer past the last one. Placeholder distance/sensitivity, tune later.
  useEffect(() => {
    const SKY_JOURNEY_DISTANCE = 550
    const SCROLL_SENSITIVITY = 0.4

    const handleWheel = (event: WheelEvent) => {
      if (!isInSkyJourney.current) return
      skyOffset.current = Math.min(Math.max(skyOffset.current + event.deltaY * SCROLL_SENSITIVITY, 0), SKY_JOURNEY_DISTANCE)
      cameraControllerRef.current?.setSkyOffset(skyOffset.current)
      avatarControllerRef.current?.setSkyOffset(skyOffset.current)
    }

    window.addEventListener("wheel", handleWheel, { passive: true })
    return () => window.removeEventListener("wheel", handleWheel)
  }, []);

  


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
            onChange={(event) => setDay(event)}/>
        </Flex>
      </div>
      <div className={` ${motion ? "invisible" : "visible"} transition-all transition-discrete duration-300 pointer-events-none absolute top-3/5 left-40 z-10 font-sans text-white`}>
        <div className="relative">
          <ViewTransition>
          { day === "night" ? 
            (
              <h1 className="text-7xl font-bold text-white leading-[0.9] tracking-tight">
                Erik<br />Edmonds
              </h1>
            ) : day === "evening" ? 
            (
              <h1 className="text-7xl font-bold text-[#242424] leading-[0.9] tracking-tight">
                Erik<br />Edmonds
              </h1>
            ) : (
              <h1 className="text-7xl font-bold text-black leading-[0.9] tracking-tight">
              Erik<br />Edmonds
            </h1>
            )
          }
          </ViewTransition>
          <div className="relative mt-0 grid justify-items-end">
            <ScrambleTitle text="Data Scientist" />
          </div>
        </div>
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
        <SkyClouds />
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
          disabled
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30 disabled:opacity-30"
        >
          <DownOutlined />
        </button>
      </div>
    </div>
  )
}
