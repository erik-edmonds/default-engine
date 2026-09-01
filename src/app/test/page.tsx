"use client";
import * as TRHEE from 'three'

import { Canvas } from "@react-three/fiber";
import { PalmTree } from "@/components/models/PalmTree";
import { OrbitControls } from '@react-three/drei';
 
export default function Page() {

  return (
        <Canvas id="three-scene-canvas" shadows="percentage" gl={{ preserveDrawingBuffer: true }} dpr={[1, 2]} style={{ width: "100vw", height: "100vh" }}>
            <ambientLight />
            <PalmTree />
            <OrbitControls />
        </Canvas>
  );
}
