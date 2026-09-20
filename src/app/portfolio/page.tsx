"use client";

import { Preload } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { DIVE_ARRIVAL_KEY } from '@/config/dive'
import { Rig, FRAME_SPACING } from '@/helpers/CameraHelpers';
import { WaterScene } from '@/components/canvas/water/WaterScene'
import { PortalInterior } from '@/components/canvas/PortalInteriors'
import Frame from '@/components/canvas/Card';

/** The four projects, in the order the card stack runs.
 *
 *  These used to be the drei portals example's own props -- a jar of pickles, a
 *  teacup and an orange twice -- with three of the four frames named "2" and a
 *  stranger's name on every one. The four project pages they should have been
 *  pointing at have existed in this repo the whole time, linked from nothing.
 *
 *  Each interior is a generated point cloud rather than a downloaded model:
 *  distinct per project by colour and density, owes nobody an attribution, and
 *  adds nothing to the download. */
const PROJECTS = [
  { id: '01', title: 'Election', blurb: 'D3 · county, race, age, education', href: '/portfolio/election', accent: '#6fa8ff', count: 1800, bg: '#0d1b2a' },
  { id: '02', title: 'Detection', blurb: 'object detection', href: '/portfolio/detection', accent: '#ffb37a', count: 1100, bg: '#1b1410' },
  { id: '03', title: 'Driving', blurb: 'autonomous driving · CARLA', href: '/portfolio/driving', accent: '#7ce3b1', count: 1400, bg: '#0c1a16' },
  { id: '04', title: 'Gaussian', blurb: 'gaussian splatting', href: '/portfolio/gaussian', accent: '#d9a7ff', count: 2200, bg: '#150f1c' },
]

export default function Page() {
	const router = useRouter()

	// The far side of the dive's match cut.
	//
	// If the island set the flag on its way under, this page opens covered by the
	// same wash and lifts it once mounted, so the join reads as continuing
	// underwater. Anyone arriving by link or bookmark has no flag and sees
	// nothing. The flag is consumed immediately: reloading /portfolio should not
	// replay an arrival the visitor never made.
	//
	// Driven by writing the DOM through a ref rather than by React state, for two
	// reasons. Reading sessionStorage in a useState initialiser would run on the
	// server too -- where it does not exist -- and any client-only initial value
	// is a hydration mismatch, which is the exact bug that took this page's
	// styling out in Round 5. And setting state synchronously in an effect is a
	// cascading render; updating an external system, which the DOM is here, is
	// what an effect is actually for.
	const washRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		let arrived = false
		try {
			arrived = sessionStorage.getItem(DIVE_ARRIVAL_KEY) === '1'
			if (arrived) sessionStorage.removeItem(DIVE_ARRIVAL_KEY)
		} catch {
			// Storage unavailable -- there is simply no arrival to play.
		}
		const node = washRef.current
		if (!arrived || !node) return
		node.dataset.state = 'covering'
		// Next frame, so the browser has the covered state to transition FROM.
		const id = requestAnimationFrame(() => { node.dataset.state = 'lifting' })
		return () => cancelAnimationFrame(id)
	}, [])

	return (
		<main className="portfolio-page">
			<div className="canvas-wrap">
				<Canvas flat camera={{ fov: 75, position: [0, 0, 20] }}>
        <color attach="background" args={['#f0f0f0']} />
        <WaterScene />
        {PROJECTS.map((project, i) => (
          <Frame
            key={project.id}
            id={project.id}
            name={project.title}
            author={project.blurb}
            bg={project.bg}
            position={[-1.15, -(i + 1) * FRAME_SPACING, 0]}
            // Entering a card here is not "open a window onto this" -- the card
            // IS the project, so it goes to the project. Without this it pushed
            // /item/:id, a URL that belongs to the island.
            onEnter={() => router.push(project.href)}
          >
            <PortalInterior kind="points" accent={project.accent} count={project.count} />
          </Frame>
        ))}
        <Rig />
        <Preload all />
      </Canvas>
			</div>
			<div ref={washRef} className="dive-wash" data-state="none" aria-hidden="true" />
		</main>
	);
}
