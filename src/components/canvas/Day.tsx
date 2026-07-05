import * as THREE from "three"
import { Sun } from "@/components/models/Sun"
import { DeadCampfire } from "@/components/models/DeadCampfire"

export function Day() {
    return (
        <>
            <mesh scale={800}>
            <sphereGeometry />
            <meshStandardMaterial color="#86edf8" roughness={0.7} side={THREE.BackSide} />
            </mesh>
            <Sun scale={4} position={[25, 10, -20]} rotation={[Math.PI / 2, 0, Math.PI / 6]} />
            <DeadCampfire scale={1.5} position={[1.75, -2, 2]}/>
            <ambientLight intensity={1.5} />
            <spotLight position={[0, 20, 2]} angle={0.5} decay={1} distance={90} penumbra={1} intensity={20} color="white" />
            <spotLight position={[-19, 0, -8]} color="white" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={20} />
            <spotLight position={[19, 0, -8]} color="white" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={20} />
        </>
    )
}