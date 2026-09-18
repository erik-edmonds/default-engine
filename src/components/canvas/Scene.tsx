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
import { makeCloud, randomVector, surface, type CloudDatum } from "@/config/store"
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

/** Where the low cloud group sits, and how many of it draws. Named because the
 *  placement effect below has to convert between this group's local space and
 *  world space to test a candidate against the island. */
const CLOUD_GROUP_LOW = { x: 20, y: 15, z: -20 }
const LOW_CLOUD_COUNT = 5

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

    // The low clouds, vetted against the island.
    //
    // They are placed at random inside a box that the upper floating islands
    // already occupy -- Icosphere_27 reaches y 17.8, the trees sit at y 12-15 --
    // and both are opaque and depth-writing, so a cloud landing in one hard
    // intersects it. Randomness is the point (the sky should not be identical
    // every visit), so the fix is to re-roll the bad draws rather than to
    // author the good ones.
    //
    // Deferred to an effect because it needs the island's real world bounds,
    // which only exist once the GLB has mounted. Until then the group renders
    // empty, which happens behind the loading screen.
    const [lowClouds, setLowClouds] = useState<CloudDatum[]>([])
    useEffect(() => {
        const island = islandRef.current
        if (!island) return

        // How far a cloud's own body reaches from its centre: the GLB's
        // half-extent, grown by the 1.4x hover scale, plus the +/-0.5 bob that
        // Sky.tsx applies every frame. A cloud that merely touches when idle
        // would still punch through when hovered.
        const reach = new THREE.Vector3(2.689 * 1.4, 1.164 * 1.4 + 0.5, 1.910 * 1.4)

        const blockers: THREE.Box3[] = []
        island.traverse((child) => {
            const mesh = child as THREE.Mesh
            if (!mesh.isMesh || !mesh.geometry) return
            const box = new THREE.Box3().setFromObject(mesh)
            const size = box.getSize(new THREE.Vector3())
            // The ocean plane spans the whole world and would veto everything;
            // it is also nowhere near the clouds.
            if (size.x > 100 || size.z > 100) return
            if (box.max.y < CLOUD_GROUP_LOW.y - 12) return
            blockers.push(box.expandByVector(reach))
        })

        const world = new THREE.Vector3()
        const clear = (local: [number, number, number]) => {
            world.set(local[0] + CLOUD_GROUP_LOW.x, local[1] + CLOUD_GROUP_LOW.y, local[2] + CLOUD_GROUP_LOW.z)
            return !blockers.some((b) => b.containsPoint(world))
        }

        const placed: CloudDatum[] = []
        for (let i = 0; i < LOW_CLOUD_COUNT; i++) {
            let local = randomVector()
            for (let attempt = 0; attempt < 24 && !clear(local); attempt++) local = randomVector()
            // Every draw was blocked -- lift it clear instead of dropping it.
            // The cluster tops out at y 17.8, so this always terminates.
            while (!clear(local) && local[1] + CLOUD_GROUP_LOW.y < 30) local = [local[0], local[1] + 2, local[2]]
            placed.push(makeCloud(local))
        }
        setLowClouds(placed)
    }, [])

    return (
        <>
            {/* Sliced to what actually draws. `range` only clamps the DRAW
                count -- every entry still mounted a <Cloud> with its own
                useFrame, and drei's <Instances> loop decomposes/composes a
                matrix for all of them regardless. Two 1000-entry arrays were
                paying ~4,000 callbacks and 2,000 matrix rebuilds per frame so
                that 20 clouds could appear. */}
            <Bvh firstHitOnly>
                {/* Named so the check can find these five and test them
                    against the island, which is the only way to know the
                    re-roll below actually worked. */}
                <group name="clouds-low" position={[CLOUD_GROUP_LOW.x, CLOUD_GROUP_LOW.y, CLOUD_GROUP_LOW.z]}>
                    <Clouds data={lowClouds} range={LOW_CLOUD_COUNT} />
                </group>
                <group position={[10, 0, 10]}>
                    <Clouds data={surface} range={15} />
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