import * as THREE from "three"
import { Campfire } from "@/components/models/Campfire"

export function Evening() {
    return (
        <>
            <mesh scale={500}>
            <sphereGeometry />
            <meshStandardMaterial color="#27c6e5" roughness={0.7} side={THREE.BackSide} />
            </mesh>
            <ambientLight intensity={0.3} />
            <Campfire scale={1.5} position={[1.75, -2, 2]} />
            <spotLight position={[0, 20, 2]} angle={0.5} decay={1} distance={90} penumbra={1} intensity={20} color="white" />
            <spotLight position={[-19, 0, -8]} color="red" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={20} />
            <spotLight position={[19, 0, -8]} color="#ff7d1c" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={20} />
        </>
    )
}