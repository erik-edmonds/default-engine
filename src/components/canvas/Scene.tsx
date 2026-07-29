import { Bvh, Clone } from "@react-three/drei"

import { Clouds } from "@/components/canvas/Sky"
import { Speaker } from "@/components/models/Speaker"
import { Merged } from "@/components/models/MergedScene"
import { GreenTree } from "@/components/models/GreenTree"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"
import { BrownTree } from "@/components/models/BrownTree"
import { ClusterTree } from "@/components/models/ClusterTree"
import { data, surface } from "@/config/store"

export function Scene({ day }: { day: TimeOfDay }) {
    return (
        <>
            <Bvh firstHitOnly>
                <group position={[20, 15, -20]}>
                    <Clouds data={data} range={5} />
                </group>
                <group position={[10, 0, 10]}>
                    <Clouds data={surface} range={15} />
                </group>
                <BrownTree scale={0.01} position={[-3,-3,-4]} rotation={[0,Math.PI/4,0]} />
                <ClusterTree scale={0.01} position={[0,-3,-5]} rotation={[0,0,0]} />
                <GreenTree scale={0.01} position={[-4,-2,-1]} rotation={[Math.PI/7,0,Math.PI/7]}/>
                <GreenTree scale={0.01} position={[1,-2,-3]} rotation={[0,0,0]}/>
            </Bvh>
            <Speaker scale={65} position={[-2.5, -1.5, 1]} rotation={[-Math.PI/9, 0, Math.PI/15]} />
            <Merged day={day} scale={3} position={[0,-5.5,0]} rotation={[0,Math.PI/2,0]}/>
        </>
    )
}