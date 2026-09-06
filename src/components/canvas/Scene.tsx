import { useEffect, useRef, useState } from "react"
import type * as THREE from "three"
import { Bvh } from "@react-three/drei"
import { useCursorHover } from "@/helpers/useCursorHover"
import {
    MAGNETIC_SNAP_RADIUS,
    activateTarget,
    registerCursorSurface,
    registerMagneticTarget,
    type MagneticTarget,
} from "@/helpers/cursor"

/** Same reasoning as the guitar's: a prop the cursor should notice without
 *  being captured by. */
const PROP_MAGNETIC_STRENGTH = 0.8
const PROP_MAGNETIC_RADIUS = 110

import { Clouds } from "@/components/canvas/Sky"
import { Speaker } from "@/components/models/Speaker"
import { Merged } from "@/components/models/MergedScene"
import { GreenTree } from "@/components/models/GreenTree"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"
import { BrownTree } from "@/components/models/BrownTree"
import { ClusterTree } from "@/components/models/ClusterTree"
import { data, surface } from "@/config/store"
import { Pokeball } from "@/components/models/Pokeball"
import { Waterfall } from "@/components/models/Waterfall"
import { Gear } from "@/components/models/Gear"
import { Charizard } from "@/components/models/Charizard"
import { Palm } from "@/components/models/Palm"
import { PalmTree } from "@/components/models/PalmTree"
import { Guitar } from "@/components/models/Guitar"
import { Gull } from "@/components/models/Gull"
import { SeagullFlock } from "@/components/canvas/SeagullFlock"
import { Thunder } from "@/components/canvas/Thunder"
import { RainController } from "@/components/canvas/RainController"
import { Foams } from "@/components/models/Foams"

export function Scene({ from, day, transitionSeconds, onDragoniteRelease, downclick, showSeagulls = true }: { from: TimeOfDay; day: TimeOfDay; transitionSeconds?: number; onDragoniteRelease?: () => void; downclick: () => void; showSeagulls?: boolean }) {
    const [hovered, set] = useState(false)
    useCursorHover(hovered)

    // The Gear's hover state has always lived up here rather than in Gear.tsx
    // (which has no pointer handling of its own), so its magnet does too. The
    // wrapper group exists purely to give the registry something to read a
    // world position from.
    const gearRef = useRef<THREE.Group>(null)
    const gearMagnet = useRef<MagneticTarget | null>(null)
    const downclickRef = useRef(downclick)
    downclickRef.current = downclick
    useEffect(() => {
        if (!gearRef.current) return
        const target: MagneticTarget = {
            object: gearRef.current,
            type: "interactive",
            strength: PROP_MAGNETIC_STRENGTH,
            radius: PROP_MAGNETIC_RADIUS,
            snapRadius: MAGNETIC_SNAP_RADIUS * 0.7,
            isEnabled: () => true,
            activate: () => downclickRef.current(),
        }
        gearMagnet.current = target
        return registerMagneticTarget(target)
    }, [])

    // The island itself is the cursor's depth reference. Registered as a
    // curated raycast surface rather than letting the cursor ray the whole
    // scene -- see the note on cursorSurfaces in helpers/cursor.ts for why
    // scene.children is not an option here.
    const islandRef = useRef<THREE.Group>(null)
    useEffect(() => {
        if (!islandRef.current) return
        return registerCursorSurface(islandRef.current)
    }, [])

    return (
        <>
            <Bvh firstHitOnly>
                <group position={[20, 15, -20]}>
                    <Clouds data={data} range={5} />
                </group>
                <group position={[10, 0, 10]}>
                    <Clouds data={surface} range={15} />
                </group>
                <PalmTree scale={0.65} position={[-2,-6,5.5]} rotation={[0,Math.PI/4,Math.PI/12]}/>
            </Bvh>
            <Waterfall />
            {/* Both mounted once for the whole scene, not per-Clouds-group --
                a strike and a downpour are whole-scene events regardless of
                which cloud fired them. */}
            <Thunder />
            <RainController />
            <Guitar scale={0.25} position={[0.1,-0.7,1]} rotation={[-Math.PI/12,Math.PI/3,Math.PI/2]}/>
            {showSeagulls && <SeagullFlock />}
            <Gull scale={1} position={[0,-2.76,5.8]} rotation={[0,-Math.PI/4,0]}/>
            <Charizard scale={0.1} position={[11,3.63,-18.2]} rotation={[0,Math.PI,0]}/>
            <group ref={gearRef}>
                <Gear
                    onClick={() => {
                        // Through the registry, so a direct click and the
                        // cursor's assisted one share a debounce.
                        if (gearMagnet.current) activateTarget(gearMagnet.current)
                        else downclick()
                    }}
                    onPointerOver={() => set(true)} onPointerOut={() => set(false)} scale={1} position={[-3,-1.8,5]} rotation={[0, Math.PI/0.8, 0]} />
            </group>
            <Pokeball scale={2} position={[-3.25,-1.5,0]} rotation={[0, -Math.PI/4, 0]} onRelease={onDragoniteRelease}/>
            {/* Wrapped in its own Bvh, unlike the one above: merged.glb is 166
                separate meshes with no bounds tree, and the cursor's depth
                raycast (plus every r3f pointer event on the island) pays for
                that on each ray. Its meshes have a standard raycast so they
                actually qualify for acceleration -- the instanced clouds in
                the Bvh above do not, which is why that one buys almost
                nothing. */}
            <Bvh firstHitOnly>
                <group ref={islandRef}>
                    <Merged from={from} day={day} transitionSeconds={transitionSeconds} scale={3} position={[0,-5.5,0]} rotation={[0,Math.PI/2,0]}/>
                </group>
            </Bvh>
        </>
    )
}