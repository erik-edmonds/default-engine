"use client"

import {  useState, useRef, useEffect, Suspense } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import {  OrbitControls, ContactShadows, Helper } from "@react-three/drei"
import { Bloom, EffectComposer} from "@react-three/postprocessing"
import { MoonOutlined, SunOutlined, StarOutlined } from "@ant-design/icons";
import { Flex, Segmented, ConfigProvider } from "antd";

// Models
import { Scuba } from "@/components/models/Scuba"
import { Avatar } from "@/components/models/Avatar"
import { Dragonite } from "@/components/models/Dragonite"

import { Day } from "@/components/canvas/Day"
import { Evening } from "@/components/canvas/Evening"
import { Night } from "@/components/canvas/Night"
import { Scene } from "@/components/canvas/Scene"

import { ScrambleTitle } from "@/components/ScrambleTitle"

const VIEWS = {
  day: Day,
  evening: Evening,
  night: Night,
};

export default function Page() {
  const [day, setDay] = useState();
  const ActiveComponent = VIEWS[day];

  const time = () => {
    const now = new Date().getHours();
    if (now <= 14 && now > 6) return "day";
    else if(now <= 18 && now > 14) return "evening";
    else return "night"
  }

  useEffect(() => {
    const checkTime = () => {
      const now = new Date().getHours();
      
      if (now <= 14 && now > 6) setDay("day");
      else if(now <= 18 && now > 14) setDay("evening");
      else setDay("night");
    };

    checkTime();

    const intervalId = setInterval(checkTime, 60000);

    return () => clearInterval(intervalId);
  }, []);


  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <div className="absolute top-10 right-1/10 z-10">
        <Flex gap="small" align="flex-end" vertical>
          <Segmented
            size="large"
            style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.50)', 
            }}
            defaultValue={time}
            shape="round"
            options={[
              { value: "day", icon: <SunOutlined /> },
              { value: "evening", icon: <MoonOutlined />},
              { value: "night", icon: <StarOutlined /> },
            ]}
            onChange={(event) => setDay(event)}/>
        </Flex>
      </div>
      <div className="pointer-events-none absolute top-3/5 left-40 z-10 font-sans text-white">
        <div className="relative">
          <h1 className="text-7xl font-extralight text-black leading-[0.9] tracking-tight">
            Erik<br />Edmonds
          </h1>
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
        <OrbitControls enablePan={true} enableRotate={true} enableDamping={true}/>
        <ContactShadows opacity={0.25} color="black" position={[0, -10, 0]} scale={50} blur={2.5} far={40} />
      </Canvas>
    </div>
  )
}
