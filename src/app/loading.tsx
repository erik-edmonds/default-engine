"use client"

import { Suspense } from "react"
import { Canvas } from "@react-three/fiber"
import { Bounds, Center, useProgress } from "@react-three/drei"

// Models
import { Earth } from "@/components/models/Earth"

function ProgressLabel() {
  const { progress } = useProgress()

  return (
    <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 font-sans text-sm tracking-[0.3em] text-white/60">
      {Math.round(progress)}%
    </div>
  )
}

export default function Loading() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a]">
      <Canvas camera={{ fov: 40 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 5, 5]} intensity={2.5} />
        <Suspense fallback={null}>
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <Earth />
            </Center>
          </Bounds>
        </Suspense>
      </Canvas>
      <ProgressLabel />
    </div>
  )
}
