import * as THREE from "three"
import { Bvh, Detailed } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { ContactShadows, Helper, PerspectiveCamera} from "@react-three/drei"

import { Clouds } from "@/components/canvas/Sky"
import { Speaker } from "@/components/models/Speaker"
import { Island } from "@/components/models/Island"
import { Surfboard } from "@/components/models/Surfboard"
import { Chair } from "@/components/models/Chair"
import { Desk } from "@/components/models/Desk"
import { Ball } from "@/components/models/Ball"
import { Mountains } from "@/components/models/Mountains"

import { Ultraball } from "@/components/models/Ultraball"


import { data, surface } from "@/helpers/store"

function CameraTracker() {
    //VERY IMPORTANT! Used for debuggin camera. TODO: Move this to some utils
    useFrame((state) => {
    const camera = state.camera

    const { x, y, z } = camera.position

    console.log(`Camera Coordinates -> X: ${x}, Y: ${y}, Z: ${z} Roll: ${camera.rotation.x}, Pitch: ${camera.rotation.y}, Yaw: ${camera.rotation.z}`)
  })

  return null
}

function CameraHelper() {
    return (
        <PerspectiveCamera position={[-6, 5.5, 11]} rotation={[-0.5, -0.4, -0.2]} fov={45} near={1} far={10}>
            <Helper type={THREE.CameraHelper} />
        </PerspectiveCamera>
    )
}

export function Scene() {
    return (
        <>
            <Bvh firstHitOnly>
                <group position={[15, 8, -10]}>
                    <Clouds data={data} range={15} />
                </group>
                {/* <Detailed distances={[0,0,0]}> */}
                    {/* <Clouds data={surface} range={15} /> */}
            </Bvh>
            <CameraTracker />
            <Speaker scale={65} position={[-2.5, -1.5, 1]} rotation={[-Math.PI/9, 0, Math.PI/15]} />
            <Island scale={0.02} position={[0, -5, 0]} />
            <Mountains scale={5} position={[10, -7, -35]} rotation={[0, Math.PI, 0]} />
            <Surfboard scale={0.25} position={[3, -1.25, 2]} rotation={[Math.PI/10, Math.PI / 4, -Math.PI/10]} />
            <Chair scale={0.05} position={[-2.75, -1, -1.75]} rotation={[0, -Math.PI / 3, 0]} />
            <Desk scale={0.25} position={[0.35, -0.1, 0.25]} rotation={[0, Math.PI / 10, 0]} />
            <Ball scale={0.55} position={[3, -0.3, -12]} />
            <Ultraball scale={0.25} position={[-3,-1.5,0.2]} rotation={[0,Math.PI/10,Math.PI/10]}/>
            
        </>
    )
}