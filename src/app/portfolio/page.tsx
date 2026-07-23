"use client";

import {  Gltf, Preload } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Rig, FRAME_SPACING } from '@/helpers/CameraHelpers';
import { WaterScene } from '@/components/canvas/water/WaterScene'
import Frame from '@/components/canvas/Card';


export default function Page() {
	return (
		<main className="portfolio-page">
			<div className="canvas-wrap">
				<Canvas flat camera={{ fov: 75, position: [0, 0, 20] }}>
        <color attach="background" args={['#f0f0f0']} />
        <WaterScene />
        <Frame id="01" name="1" author="Omar Faruq Tawsif" bg="#e4cdac" position={[-1.15, -1 * FRAME_SPACING, 0]}>
          <Gltf src="models/pickles.glb" scale={8} position={[0, -0.7, -2]} />
        </Frame>
        <Frame id="02" name="2" author="Omar Faruq Tawsif" position={[-1.15, -2 * FRAME_SPACING, 0]}>
          <Gltf src="models/tea.glb" position={[0, -2, -3]}/>
        </Frame>
        <Frame id="03" name="2" author="Omar Faruq Tawsif" bg="#d1d1ca" position={[-1.15, -3 * FRAME_SPACING, 0]}>
          <Gltf src="models/orange.glb" scale={2} position={[0, -0.8, -4]} />
        </Frame>
        <Frame id="04" name="2" author="Omar Faruq Tawsif" bg="#d1d1ca" position={[-1.15, -4 * FRAME_SPACING, 0]}>
          <Gltf src="models/orange.glb" scale={2} position={[0, -0.8, -4]} />
        </Frame>
        <Rig />
        <Preload all />
      </Canvas>
			</div>

      <style jsx>{`
        .portfolio-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
        }

        .canvas-wrap {
          position: absolute;
          inset: 0;
        }
      `}</style>
		</main>
	);
}
