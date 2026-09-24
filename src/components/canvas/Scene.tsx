import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { Bvh } from "@react-three/drei"
import { registerCursorSurface } from "@/helpers/cursor"

import { Clouds } from "@/components/canvas/Sky"
import { Merged } from "@/components/models/MergedScene"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"
import { ringClouds, CLOUD_RING_LOW, CLOUD_RING_HIGH } from "@/config/store"
import { Pokeball, type PokeballHandle } from "@/components/models/Pokeball"
import { Waterfall } from "@/components/models/Waterfall"
import { Charizard } from "@/components/models/Charizard"
import { PalmTree } from "@/components/models/PalmTree"
import { Guitar } from "@/components/models/Guitar"
import { Gull } from "@/components/models/Gull"
import { SeagullFlock } from "@/components/canvas/SeagullFlock"
import { Thunder } from "@/components/canvas/Thunder"
import { RainController } from "@/components/canvas/RainController"
import { PaperSky } from "@/components/canvas/PaperSky"
import { skyWorldMounted } from "@/helpers/StateProvider"
import { useAtomValue } from "jotai"

export function Scene({ from, day, transitionSeconds, onDragoniteRelease, pokeballRef, showSeagulls = true }: { from: TimeOfDay; day: TimeOfDay; transitionSeconds?: number; onDragoniteRelease?: () => void; pokeballRef?: React.Ref<PokeballHandle>; showSeagulls?: boolean }) {
    // The island itself is the cursor's depth reference. Registered as a
    // curated raycast surface rather than letting the cursor ray the whole
    // scene -- see the note on cursorSurfaces in helpers/cursor.ts for why
    // scene.children is not an option here.
    // The paper world is mounted only for the journey. Reading the atom here
    // rather than threading a prop: it is already the global "we are up there"
    // signal and several components read it the same way.
    const inSky = useAtomValue(skyWorldMounted)

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
            {/* Named so the minimap can leave the birds out of its overhead
                photograph: they are scenery, they move, and on a map they read
                as debris scattered over the water. */}
            <group name="birds-flock">{showSeagulls && <SeagullFlock />}</group>
            <group name="birds-gull"><Gull scale={1} position={[0,-2.76,5.8]} rotation={[0,-Math.PI/4,0]}/></group>
            <Charizard scale={0.1} position={[11,3.63,-18.2]} rotation={[0,Math.PI,0]}/>
            {/* The scuba gear used to stand here, and clicking it dived the
                avatar off the island edge and cut to /portfolio. It is gone
                because it was the second door to a room that already had one:
                the Models portal's destination is that same page (see
                config/portals.ts), and a portal you can see from the journey is
                a better entrance than a prop on a beach you have to find. */}
            {/* The sky journey's entry point, unparked now that the camera
                actually flies it: CameraController.beginSkyJourney and
                setSkyOffset were empty functions, so releasing the Dragonite
                used to leave the camera sitting still while the avatar and the
                captions ran the whole sequence without it. */}
            <Pokeball ref={pokeballRef} scale={2} position={[-3.25,-1.5,0]} rotation={[0, -Math.PI/4, 0]} onRelease={onDragoniteRelease}/>
            {/* Wrapped in its own Bvh, unlike the one above: merged.glb is 166
                separate meshes with no bounds tree, and the cursor's depth
                raycast (plus every r3f pointer event on the island) pays for
                that on each ray. Its meshes have a standard raycast so they
                actually qualify for acceleration -- the instanced clouds in
                the Bvh above do not, which is why that one buys almost
                nothing. */}
            {/* The destination. Nothing paper exists on the island -- the
                whole world mounts with the journey and unmounts with it, so
                the island's own Clouds and its cloud-placement constants are
                untouched. See components/canvas/PaperSky.tsx. */}
            <PaperSky active={inSky} />
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