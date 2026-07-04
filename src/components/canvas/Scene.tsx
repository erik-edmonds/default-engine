import * as THREE from "three"
import { Bvh } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import {  OrbitControls, ContactShadows, Helper, PerspectiveCamera} from "@react-three/drei"

import { Clouds } from "@/components/canvas/Sky"
import { Speaker } from "@/components/models/Speaker"
import { Island } from "@/components/models/Island"
import { Surfboard } from "@/components/models/Surfboard"
import { Chair } from "@/components/models/Chair"
import { Desk } from "@/components/models/Desk"
import { Ball } from "@/components/models/Ball"
import { Mountains } from "@/components/models/Mountains"

import { Ultraball } from "@/components/models/Ultraball"

import { data } from "@/helpers/store"

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
                <group position={[10, 5, -10]}>
                    <Clouds data={data} range={15} />
                </group>
            </Bvh>
            {/* <Dragonite scale={2} position={[0, 0, 0]} /> */}
            {/* <Scuba scale={0.5} position={[0, -1.5, 0]} /> */}
            {/* <Avatar scale={0.013} position={[-1, -1.75, 2]} /> */}
            <Speaker scale={65} position={[-2.75, -2.25, 2.5]} rotation={[-Math.PI/9, Math.PI / 6, Math.PI/15]} />
            <Island scale={0.02} position={[0, -5, 0]} />
            <Mountains scale={5} position={[5, -7, -35]} rotation={[0, -Math.PI / 2, 0]} />
            <Surfboard scale={0.25} position={[3, -1.25, 2]} rotation={[Math.PI/10, Math.PI / 4, -Math.PI/10]} />
            <Chair scale={0.05} position={[-3.5, -1.25, 1]} rotation={[0, -Math.PI / 4, 0]} />
            <Desk scale={0.25} position={[0.35, -0.1, 0.25]} rotation={[0, Math.PI / 10, 0]} />
            <Ball scale={0.55} position={[3, -0.3, -12]} />
            <Ultraball scale={0.25} position={[-3,-1.5,0.2]} rotation={[0,Math.PI/10,Math.PI/10]}/>
            
        </>
    )
}