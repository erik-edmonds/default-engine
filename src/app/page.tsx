"use client"

import * as THREE from "three"
import { createContext, useState, useRef, useEffect, Suspense } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Bvh, Environment, OrbitControls, ContactShadows, Stars } from "@react-three/drei"
import { Bloom, EffectComposer} from "@react-three/postprocessing"

// Models
import { Scuba } from "@/components/models/Scuba"
import { Avatar } from "@/components/models/Avatar"
import { Dragonite } from "@/components/models/Dragonite"

import { Sun } from "@/components/models/Sun"
import { Moon } from "@/components/models/Moon"
import { Clouds } from "@/components/models/Sky"
import { Speaker } from "@/components/models/Speaker"
import { Island } from "@/components/models/Island"
import { Surfboard } from "@/components/models/Surfboard"
import { Chair } from "@/components/models/Chair"
import { Desk } from "@/components/models/Desk"
import { Ball } from "@/components/models/Ball"
import { Mountains } from "@/components/models/Mountains"

import { data } from "@/helpers/store"

export default function Page() {
  const [day, setDay] = useState("day");

  useEffect(() => {
    const checkTime = () => {
      const now = new Date().getHours();
      
      if (now <= 14) setDay("day");
      else if(now <= 18 && now > 14) setDay("evening");
      else setDay("night");
    };

    // Check immediately on load
    checkTime();

    // Check periodically if the target is in the near future
    const intervalId = setInterval(checkTime, 60000); // Check every minute

    return () => clearInterval(intervalId);
  }, []);


  return (
      <Canvas camera={{ position: [0, 0, 15], fov: 45 }} style={{ width: "100vw", height: "100vh" }}>
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={1} levels={2} intensity={1} />
        </EffectComposer>
        
         {/* <Dragonite scale={2} position={[0, 0, 0]} /> */}
         <Bvh firstHitOnly>
          <group position={[10, 5, -10]}>
            <Clouds data={data} range={15} />
          </group>
         </Bvh>
         {day === "day" ? (
            <>
              <mesh scale={500}>
                <sphereGeometry />
                <meshStandardMaterial color="#86edf8" roughness={0.7} side={THREE.BackSide} />
              </mesh>
              <Sun scale={4} position={[15, 10, -20]} rotation={[Math.PI / 2, 0, 0]} />
              <ambientLight intensity={1.5} />
              <spotLight position={[0, 20, 2]} angle={0.5} decay={1} distance={90} penumbra={1} intensity={20} color="white" />
              <spotLight position={[-19, 0, -8]} color="white" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={20} />
              <spotLight position={[19, 0, -8]} color="white" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={20} />
            </>
          ): day === "evening" ? (
            <>
              <mesh scale={500}>
                <sphereGeometry />
                <meshStandardMaterial color="#27c6e5" roughness={0.7} side={THREE.BackSide} />
              </mesh>
              <ambientLight intensity={0.3} />
              <spotLight position={[0, 20, 2]} angle={0.5} decay={1} distance={90} penumbra={1} intensity={20} color="white" />
              <spotLight position={[-19, 0, -8]} color="red" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={20} />
              <spotLight position={[19, 0, -8]} color="#ff7d1c" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={20} />
            </>
          ): (
            <>
              <mesh scale={500}>
                <sphereGeometry />
                <meshStandardMaterial color="#27c6e5" roughness={0.7} side={THREE.BackSide} />
              </mesh>
              <Moon scale={0.15} position={[15, 10, -20]} />
              <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
              <ambientLight intensity={0.75} color="#0b47a7" />
              <ambientLight intensity={0.05} color="#white" />
              <spotLight position={[-10, 15, 0]} angle={45} decay={1} distance={185} penumbra={1} intensity={15} color="white" />
              <spotLight position={[10, 15, 0]} angle={-45} decay={1} distance={185} penumbra={1} intensity={15} color="white" />
              <spotLight position={[10, 0, 0]} angle={-90} decay={1} distance={185} penumbra={1} intensity={15} color="white" />
              <spotLight position={[-10, 0, 0]} angle={-90} decay={1} distance={185} penumbra={1} intensity={15} color="white" />
              <spotLight position={[0, 20, 2]} angle={0.5} decay={1} distance={185} penumbra={1} intensity={200} color="#125999" />
              <spotLight position={[-19, 0, -8]} color="#854650" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={50} />
              <spotLight position={[19, 0, -8]} color="#022154" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={50} />
            </>
          )}
      
         {/* <Avatar scale={0.013} position={[-1, -1.75, 2]} /> */}
         <Speaker scale={65} position={[-2.75, -2.25, 2.5]} rotation={[-Math.PI/9, Math.PI / 6, Math.PI/15]} />
         <Island scale={0.02} position={[0, -5, 0]} />
         <Mountains scale={3.5} position={[-3, -5, -30]} rotation={[0, -Math.PI / 2, 0]} />
         <Surfboard scale={0.25} position={[3, -1.25, 2]} rotation={[Math.PI/10, Math.PI / 4, -Math.PI/10]} />
         <Chair scale={0.05} position={[-3.5, -1.25, 1]} rotation={[0, -Math.PI / 4, 0]} />
         <Desk scale={0.25} position={[0.35, -0.1, 0.25]} rotation={[0, Math.PI / 8, 0]} />
         <Ball scale={0.55} position={[3, -0.3, -12]} rotation={[0, 0, 0]} />
        <ContactShadows opacity={0.25} color="black" position={[0, -10, 0]} scale={50} blur={2.5} far={40} />
        <OrbitControls enablePan={true} enableZoom={true} enableRotate={true} />
      </Canvas>
  )
}
