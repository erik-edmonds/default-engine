'use client'

import dynamic from 'next/dynamic'
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { PerspectiveCamera } from "@react-three/drei";

const Hologram = dynamic(() => import('@/components/models/Hologram').then((mod) => mod.Hologram), { ssr: false })

export default function Page() {
  return (
    <>
      <Canvas className='absolute top-0 flex size-full flex-col items-center justify-center'>
        {/* Position and scale live at the call site, as on the island
            (Scene.tsx). Rendered with none at all this page threw on
            `const [x, y, z] = props.position` -- it was only ever type-clean
            because `props` was implicitly `any`. Centred for the camera
            below: fov 40 at z=6 shows ~4.4 units of height. */}
        <Hologram position={[0, -1.1, 0]} scale={0.8} />
        <Suspense fallback={null}>
            <color attach='background' args={["black"]} />
            <ambientLight />
            <pointLight position={[20, 30, 10]} intensity={3} decay={0.2} />
            <pointLight position={[-10, -10, -10]} color='blue' decay={0.2} />
            <PerspectiveCamera makeDefault fov={40} position={[0, 0, 6]} />
        </Suspense>
      </Canvas>
    </>
  )
}