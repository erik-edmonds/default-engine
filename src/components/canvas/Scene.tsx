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
import { Ditto } from "@/components/models/Ditto"
import { Gull } from "@/components/models/Gull"
import { Seagull } from "@/components/models/Seagull"
import { Foams } from "@/components/models/Foams"

export function Scene({ from, day, transitionSeconds, onDragoniteRelease, downclick }: { from: TimeOfDay; day: TimeOfDay; transitionSeconds?: number; onDragoniteRelease?: () => void; downclick: () => void }) {
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
                <Palm scale={1} position={[-3.5,-2,-1]} rotation={[0,Math.PI/4,Math.PI/10]}/>
                {/* <BrownTree scale={0.01} position={[-3,-3,-4]} rotation={[0,Math.PI/4,0]} />
                <ClusterTree scale={0.01} position={[0,-3,-5]} rotation={[0,0,0]} />
                <GreenTree scale={0.01} position={[-4,-2,-1]} rotation={[Math.PI/7,0,Math.PI/7]}/>
                <GreenTree scale={0.01} position={[1,-2,-3]} rotation={[0,0,0]}/> */}
            </Bvh>
            <Waterfall />
            {/* <Ditto scale={0.15} position={[-0.1,-2.8,8.2]} rotation={[0,-Math.PI/5,0]}/> */}
            <Charizard scale={0.1} position={[11,3.63,-18.2]} rotation={[0,Math.PI,0]}/>
            <Gear onClick={() => downclick()} onPointerOver={() => set(true)} onPointerOut={() => set(false)} scale={1.5} position={[1.75,-1.8,4.5]} rotation={[0, Math.PI/1.8, Math.PI/9]} /> 
            <Pokeball scale={2} position={[-3.25,-1.5,0]} rotation={[0, -Math.PI/4, 0]} onRelease={onDragoniteRelease}/>
            <Speaker scale={65} position={[0.5, -2.75, 9]} rotation={[0, -Math.PI/4, 0]} />
            <Merged from={from} day={day} transitionSeconds={transitionSeconds} scale={3} position={[0,-5.5,0]} rotation={[0,Math.PI/2,0]}/>
        </>
    )
}