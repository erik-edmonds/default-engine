import { useEffect, useRef, useState } from "react"
import { ISLAND_ROTATION_Y } from "@/config/positions"
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
import { Sign } from "@/components/models/Sign"
import { Hologram } from "@/components/models/Hologram"
import { opticsRun } from "@/helpers/optics"
import { openLensPanel } from "@/helpers/lensPanel"
import { OpticsPulse } from "@/components/canvas/OpticsPulse"
import { DetectionBrackets } from "@/components/canvas/DetectionBrackets"

/** Module scope, so the identity is stable for the session. The beacon
 *  re-registers its magnetic target whenever this changes, and an inline arrow
 *  would hand it a new function on every render of this component.
 *
 *  ONE CALLBACK, TWO JOBS, and the return value is what picks between them.
 *  `start()` returns false once the island has already been surveyed --
 *  helpers/optics.ts spells out that the scan runs once and that a second
 *  click is what should open the AI. So this is the whole of that handover:
 *  the first click scans, every click after it opens the panel. The beacon
 *  stops being the dead control layout/Icon.tsx warns about. */
const startOptics = () => {
  if (!opticsRun.start()) openLensPanel()
}

export function Scene({ from, day, transitionSeconds, pokeballRef, showSeagulls = true }: { from: TimeOfDay; day: TimeOfDay; transitionSeconds?: number; pokeballRef?: React.Ref<PokeballHandle>; showSeagulls?: boolean }) {
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
            {/* Named so the survey can find them. These three ARE the main
                island's trees -- merged.glb's own Tree2 and Tree3 are
                commented out of MergedScene.tsx and never render. See
                config/opticsTargets.ts. */}
            {/* THESE POSITIONS LOOK WRONG AND ARE CORRECT. They used to read
                -2/-7/+7 on X, which is what you would author for three palms
                spread across an island -- and the palms rendered bunched in
                the middle anyway, because PalmTree.tsx was adding 13.9 units
                of the rig's own baked offset to every one of them (see the
                long note on Armature001_61 there).

                That offset is gone now, so these numbers finally describe
                where the trees actually are. They were chosen to keep the
                scene PIXEL-IDENTICAL to how it looked with the bug -- the
                composition was signed off, and correcting the rig was about
                making the transforms honest, not about re-dressing the beach.
                Each is the old position plus R*S applied to the removed
                offset; verified identical to 3e-5.

                So the trees really do stand in a loose cluster around x -3.6
                to +0.7. Move them wherever you like now: what Scene.tsx says
                is finally what the screen shows, which is also what lets the
                survey box them. */}
            <PalmTree name="palm-near" scale={0.65} position={[-2.92,-1.48,-1.57]} rotation={[0,Math.PI/4 - Math.PI/12,Math.PI/12]}/>
            <PalmTree name="palm-left" scale={0.55} position={[-0.13,-1.4,-3.08]} rotation={[0,-Math.PI/3 - Math.PI/12,-Math.PI/16]} windOffset={1.7}/>
            <PalmTree name="palm-right" scale={0.72} position={[0.36,-1.43,-1.83]} rotation={[0,Math.PI/1.6 - Math.PI/12,Math.PI/20]} windOffset={3.4}/>
            {/* BACK WHERE IT STARTED, and the LENS moved instead.
                
                This was dragged 1.07 units inboard so the board would be in
                frame on a phone, which worked and cost more than it bought:
                it landed on top of the Poke Ball, and two rounds of shuffling
                the ball around it produced a beach where the sign, the ball,
                the deck chair and the avatar were all stacked into the same
                corner -- "it feels too squeezed in".
                
                The composition was never the problem; the field of view was.
                ISLAND_FOV_Y_PORTRAIT opens far enough to hold the original
                layout instead, which is the change that was rejected earlier
                as too large and is the right one. */}
            <Waterfall />
            {/* Both mounted once for the whole scene, not per-Clouds-group --
                a strike and a downpour are whole-scene events regardless of
                which cloud fired them. */}
            <Thunder />
            <RainController />
            <Guitar scale={0.25} position={[-0.16,-0.7,0.99]} rotation={[-Math.PI/12,Math.PI/3,Math.PI/2]}/>
            {/* Named so the minimap can leave the birds out of its overhead
                photograph: they are scenery, they move, and on a map they read
                as debris scattered over the water. */}
            <group name="birds-flock">{showSeagulls && <SeagullFlock />}</group>
            <group name="birds-gull"><Gull scale={1} position={[-0.54,-2.76,5.86]} rotation={[0,-Math.PI/4 - Math.PI/12,0]}/></group>
            {/* MOVED, finally. The island turned from 90 to 100 degrees
                (config/positions.ts) and everything standing on it was
                rotated to follow -- except this, which was raised at the time
                and never done. It sits beside the moon island at radius 21.3,
                so ten degrees left it 3.71 units out over open air.
                applyAxisAngle on the position, and the delta ADDED to the
                Y rotation, which for a Y-only turn is the same as composing
                the quaternions.

                Named so the survey can find it -- it is the one target in the
                "alive" class that is not a bird. */}
            <Charizard name="charizard" scale={0.1} position={[12.54,3.63,-17.17]} rotation={[0,Math.PI + Math.PI/18 - Math.PI/12,0]}/>
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
            {/* BACK WHERE IT STARTED TOO, on the sign's right.
                
                The sign's arrow points RIGHT -- left-to-right under the words
                with its head at the board's right end -- so this is the side
                the ball always belonged on, and the pair read correctly until
                the sign was moved on top of it. With the sign returned and
                the lens opened, neither has to give way to the other. */}
            {/* The hologram is a beacon, and the beacon is the device that
                follows the screen when clicked. This is the basic framework
                for adding AI into the scene.

                `route` is gone and nothing is lost: it was "/", so clicking
                the beacon pushed the route you were already on. Dead, in the
                same way layout/Icon.tsx records the home button being dead at
                a hotspot -- a control that looks live and does nothing. */}
            <Hologram
                scale={0.5}
                position={[-0.38, -2.75, 8.18]}
                onActivate={startOptics}
            />

            {/* Wrapped in its own Bvh, unlike the one above: merged.glb is 166
                separate meshes with no bounds tree, and the cursor's depth
                raycast (plus every r3f pointer event on the island) pays for
                that on each ray. Its meshes have a standard raycast so they
                actually qualify for accelerat  ion -- the instanced clouds in
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
                    <Merged from={from} day={day} transitionSeconds={transitionSeconds} scale={3} position={[0,-5.5,0]} rotation={[0,ISLAND_ROTATION_Y,0]}/>
                </group>
                {/* Arms the terrain's own materials with the survey wave and
                    drives it. Renders nothing; it needs the ref above because
                    the wave is injected into the materials the island already
                    has rather than drawn as geometry of its own. */}
            </Bvh>
            {/* Both OUTSIDE the Bvh above, and outside the island group.
                The pulse renders nothing at all; the brackets write
                world-space matrices, so parenting them under the terrain would
                apply its scale-3 / rotate-100deg chain a second time. Neither
                wants a bounds tree built over it either -- that Bvh exists for
                merged.glb's 166 raycastable meshes. */}
            <OpticsPulse island={islandRef} />
            <DetectionBrackets />
        </>
    )
}