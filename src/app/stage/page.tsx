"use client"

import * as THREE from "three"
import { createContext, useContext, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { Environment, OrbitControls, ContactShadows, PerspectiveCamera } from "@react-three/drei"

// Models
import { Earth } from "@/components/models/Earth"

export default function Page() {

  return (
      <Canvas style={{ width: "100vw", height: "100vh", display: "block" }}>
        <ambientLight intensity={Math.PI / 2} />
        <PerspectiveCamera makeDefault position={[0, 10, 5]} fov={45} >
          <spotLight position={[0, 40, 2]} angle={0.5} decay={1} distance={45} penumbra={1} intensity={2000} />
          <spotLight position={[-19, 0, -8]} color="red" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={400} />
        </PerspectiveCamera>
        <mesh scale={200}>
          <sphereGeometry />
          <meshStandardMaterial color="#999" roughness={0.7} side={THREE.BackSide} />
        </mesh>
        <Earth scale={0.5} position={[0, 0, 0]} />
        <ContactShadows opacity={0.25} color="black" position={[0, -10, 0]} scale={50} blur={2.5} far={40} />
        <OrbitControls makeDefault enableZoom={false} enablePan={false} minPolarAngle={Math.PI / 1.7} maxPolarAngle={Math.PI / 1.7} />
        <Environment files="https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/blue_lagoon_night_1k.hdr" />
      </Canvas>
  )
}
