import { useState } from "react"
import { Bvh, useCursor } from "@react-three/drei"

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
    useCursor(hovered)
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
            <Gear onClick={() => downclick()} onPointerOver={() => set(true)} onPointerOut={() => set(false)} scale={1} position={[-3,-1.8,5]} rotation={[0, Math.PI/0.8, 0]} /> 
            <Pokeball scale={2} position={[-3.25,-1.5,0]} rotation={[0, -Math.PI/4, 0]} onRelease={onDragoniteRelease}/>
            <Merged from={from} day={day} transitionSeconds={transitionSeconds} scale={3} position={[0,-5.5,0]} rotation={[0,Math.PI/2,0]}/>
        </>
    )
}