import * as THREE from "three"
import { Sun } from "@/components/models/Sun"
import { DeadCampfire } from "@/components/models/DeadCampfire"

export function Day() {
    return (
        <>
            {/* Unlit backdrop: its color is the sky's actual appearance, not
                modulated by scene lights, so foreground brightness (for
                shading the island/avatar/clouds) can be tuned independently
                of how the sky itself looks. */}
            <mesh scale={800}>
            <sphereGeometry />
            <meshBasicMaterial color="#86edf8" side={THREE.BackSide} />
            </mesh>
            <Sun scale={4} position={[25, 10, -20]} rotation={[Math.PI / 2, 0, Math.PI / 6]} />
            <DeadCampfire scale={1.5} position={[1.75, -2, 2]}/>
            {/* Soft sky-fill, dimmed relative to before so the directional
                sun (below) — not flat ambient — does most of the shaping. */}
            <ambientLight intensity={0.7} color="#dff2ff" />
            {/* The actual "sun": gives the scene real light/shadow direction,
                roughly aimed from the Sun model's position. */}
            <directionalLight
              position={[25, 40, -15]}
              intensity={2.2}
              color="#fff6e2"
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-60}
              shadow-camera-right={60}
              shadow-camera-top={60}
              shadow-camera-bottom={-60}
            />
            <spotLight position={[0, 20, 2]} angle={0.5} decay={1} distance={90} penumbra={1} intensity={10} color="white" />
            <spotLight position={[-19, 0, -8]} color="white" angle={0.25} decay={0.75} distance={185} penumbra={0.5} intensity={12} />
            <spotLight position={[19, 0, -8]} color="white" angle={0.25} decay={0.75} distance={185} penumbra={0.5} intensity={12} />
        </>
    )
}
