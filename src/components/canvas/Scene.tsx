import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
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
const PROP_MAGNETIC_STRENGTH = 1.05
const PROP_MAGNETIC_RADIUS = 155

import { Clouds } from "@/components/canvas/Sky"
import { Speaker } from "@/components/models/Speaker"
import { Merged } from "@/components/models/MergedScene"
import { GreenTree } from "@/components/models/GreenTree"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"
import { BrownTree } from "@/components/models/BrownTree"
import { ClusterTree } from "@/components/models/ClusterTree"
import { ringClouds, CLOUD_RING_LOW, CLOUD_RING_HIGH } from "@/config/store"
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
            snapRadius: MAGNETIC_SNAP_RADIUS,
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

    // Both cloud rings, vetted against the island.
    //
    // The islands are opaque and depth-writing, so a cloud placed inside one
    // hard-intersects it. Randomness is the point (the sky should not be
    // identical every visit), so the fix is to re-roll the bad draws rather
    // than to author the good ones. ringClouds re-rolls a rejected cloud WITHIN
    // ITS OWN BEARING BUCKET, which keeps the coverage guarantee intact while
    // dodging a tree.
    //
    // Placed in a useState initialiser, so the data exists on the very first
    // render and its length never changes. That is load-bearing, not tidiness:
    // drei's <Instances> sizes its instance buffers from the first `limit` it
    // sees and keeps stale refs in a subscription array, so a group whose data
    // arrives late gets a zero-length matrix buffer AND a frame loop that
    // dereferences refs which are not attached yet. Those were the "performance
    // is horrible" regression and the `matrixWorld of undefined` error
    // respectively -- see the note on `limit` in Sky.tsx.
    //
    // The clearance test reads config/terrain.ts, a measured table, rather than
    // the live scene graph. Reading the graph is what forced the late data in
    // the first place: the island is behind <Suspense> and animates in, so
    // there is no frame early enough to measure it and no cheap way to know
    // when it has settled.
    const [clouds] = useState(() => ({
        low: ringClouds(CLOUD_RING_LOW),
        high: ringClouds(CLOUD_RING_HIGH),
    }))

    return (
        <>
            {/* Every entry draws. `range` used to clamp the DRAW count out of
                two 1000-entry arrays, which meant ~4,000 callbacks and 2,000
                matrix rebuilds per frame so that 20 clouds could appear; now
                the arrays ARE the sky, so the two numbers cannot drift and
                every cloud the data describes is one you can actually see.

                Both groups sit at the origin: cloud positions are world-space
                (see config/store.ts). The old offset groups meant every
                clearance test had to convert local to world, and that
                conversion is where the placement bug lived. */}
            <Bvh firstHitOnly>
                {/* Named so the checks can find them and test them against the
                    island, which is the only way to know the re-roll worked. */}
                <group name="clouds-low">
                    <Clouds data={clouds.low} limit={CLOUD_RING_LOW.count} />
                </group>
                <group name="clouds-high">
                    <Clouds data={clouds.high} limit={CLOUD_RING_HIGH.count} />
                </group>
            </Bvh>
            {/* Outside the Bvh above, which exists for the cloud groups. A
                bounds tree is built once at mount, and these are skinned
                meshes whose pose changes every frame -- so it bought the palm
                nothing when there was one, and would build three trees now.
                Nothing raycasts them: no pointer handlers, not a cursor
                surface, not a magnetic target.

                One asset, three copies -- PalmTree clones its skeleton per
                instance (see the note in PalmTree.tsx), and windOffset keeps
                them from swaying in lockstep. The two below the original are
                placeholders: move them wherever you want them. */}
            <PalmTree scale={0.65} position={[-2,-6,5.5]} rotation={[0,Math.PI/4,Math.PI/12]}/>
            <PalmTree scale={0.55} position={[-7,-3.5,-4.5]} rotation={[0,-Math.PI/3,-Math.PI/16]} windOffset={1.7}/>
            <PalmTree scale={0.72} position={[7,-6,0]} rotation={[0,Math.PI/1.6,Math.PI/20]} windOffset={3.4}/>
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
            {/* Need to hide this until the underwater scene is ready.
            <group ref={gearRef}>
                <Gear
                    onClick={() => {
                        // Through the registry, so a direct click and the
                        // cursor's assisted one share a debounce.
                        if (gearMagnet.current) activateTarget(gearMagnet.current)
                        else downclick()
                    }}
                    onPointerOver={() => set(true)} onPointerOut={() => set(false)} scale={1} position={[-3,-1.8,5]} rotation={[0, Math.PI/0.8, 0]} />
            </group> */}
            {/* Need to hide this until the sky scene is ready.
             <Pokeball scale={2} position={[-3.25,-1.5,0]} rotation={[0, -Math.PI/4, 0]} onRelease={onDragoniteRelease}/> */}
            {/* Wrapped in its own Bvh, unlike the one above: merged.glb is 166
                separate meshes with no bounds tree, and the cursor's depth
                raycast (plus every r3f pointer event on the island) pays for
                that on each ray. Its meshes have a standard raycast so they
                actually qualify for acceleration -- the instanced clouds in
                the Bvh above do not, which is why that one buys almost
                nothing. */}
            <Bvh firstHitOnly>
                {/* Named so the scene graph says which subtree is the solid
                    world. The journey path's clearance check needs to measure
                    against terrain and nothing else; identifying it by
                    excluding everything that isn't (by name, one pattern at a
                    time) let animated props through, and the same viewpoint
                    then measured 2.31, 1.73 and 4.50 units of clearance on
                    three runs of unchanged geometry. */}
                <group ref={islandRef} name="island-terrain">
                    <Merged from={from} day={day} transitionSeconds={transitionSeconds} scale={3} position={[0,-5.5,0]} rotation={[0,Math.PI/2,0]}/>
                </group>
            </Bvh>
        </>
    )
}