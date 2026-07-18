import * as THREE from "three"
import { Campfire } from "@/components/models/Campfire"

export function Evening() {
    return (
        <>
            {/* Deeper, duskier blue than Day's — unlit, so it stays this
                color regardless of foreground light levels. */}
            <mesh scale={800}>
            <sphereGeometry />
            <meshBasicMaterial color="#3f7fae" side={THREE.BackSide} />
            </mesh>
            <Campfire scale={1.5} position={[1.75, -2, 2]} />
            {/* Uniform warm-above/cool-below wash — this (not positioned
                spotlights) is what carries the "reddish glow": it tints
                every surface the same way regardless of distance or angle,
                so it reads as the evening air itself rather than a light
                someone pointed at the island. */}
            <hemisphereLight args={["#ffb37a", "#3a2a3a", 0.9]} />
            <ambientLight intensity={0.2} color="#ffcf9a" />
            {/* Low, warm "setting sun" — a directional light has no
                position/falloff, so it shades everything from the same
                angle instead of pooling around a source. Softer and dimmer
                than Day's. */}
            <directionalLight
              position={[-30, 12, -10]}
              intensity={1.3}
              color="#ff9d5c"
              castShadow
              shadow-mapSize={[1024, 1024]}
              shadow-camera-left={-60}
              shadow-camera-right={60}
              shadow-camera-top={60}
              shadow-camera-bottom={-60}
            />
            {/* The one intentionally local light: a small fire glow right
                at the campfire, which is supposed to look like a pool of
                light — that's what campfires actually do. */}
            <pointLight position={[1.75, -1, 2]} intensity={3} distance={7} decay={2} color="#ff7a30" />
        </>
    )
}
