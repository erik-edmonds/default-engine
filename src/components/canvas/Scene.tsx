import { Bvh } from "@react-three/drei"

import { Clouds } from "@/components/canvas/Sky"
import { Speaker } from "@/components/models/Speaker"
import { Desk } from "@/components/models/Desk"
import { Merged } from "@/components/models/MergedScene"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"

import { CameraTracker } from "@/helpers/CameraHelpers"
import { data, surface } from "@/helpers/store"

export function Scene({ day }: { day: TimeOfDay }) {
    return (
        <>
            <Bvh firstHitOnly>
                <group position={[15, 8, -10]}>
                    <Clouds data={data} range={15} />
                </group>
                <Clouds data={surface} range={15} />
            </Bvh>
            <Speaker scale={65} position={[-2.5, -1.5, 1]} rotation={[-Math.PI/9, 0, Math.PI/15]} />
            <Desk scale={0.25} position={[0.35, -0.1, 0.25]} rotation={[0, Math.PI / 10, 0]} />
            <Merged day={day} scale={3} position={[0,-5.5,0]} rotation={[0,Math.PI/2,0]}/>
            <CameraTracker />
        </>
    )
}