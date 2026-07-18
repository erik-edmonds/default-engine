import { Stars } from "@react-three/drei"
import { Campfire } from "@/components/models/Campfire"
import { Moon } from "@/components/models/Moon"
import * as THREE from "three"

export function Night() {
    return (
        <>
              {/* Dark, unlit backdrop — this is what actually reads as
                  "night." Because it's unlit, it stays dark no matter how
                  brightly the island/avatar/clouds need to be lit to stay
                  visible; the two were previously coupled through a lit
                  sky material, which made them fight each other. */}
              <mesh scale={800}>
                <sphereGeometry />
                <meshBasicMaterial color="#050b1c" side={THREE.BackSide} />
              </mesh>
              <Campfire scale={1.5} position={[1.75, -2, 2]} />
              <Moon scale={0.15} position={[20, 10, -20]} />
              <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
              {/* Uniform cool wash — carries the navy/blue night color the
                  same way everywhere, so it reads as moonlit air rather
                  than a patchwork of separately-aimed lights. This (plus
                  ambient) is the visibility guarantee up in the sky-journey
                  clouds too, since neither falls off with distance. */}
              <hemisphereLight args={["#2c5490", "#0a0d18", 0.75]} />
              <ambientLight intensity={0.32} color="#25436f" />
              {/* Soft cool moonlight for gentle directional shape — a
                  directional light has no position/falloff, so it shades
                  everything from one consistent angle instead of pooling. */}
              <directionalLight position={[20, 25, -20]} intensity={0.9} color="#cfe0ff" />
              {/* The one intentionally local light: a small fire glow right
                  at the campfire — real campfires do cast a local pool of
                  light, so this one spot reading as "lit from a point" is
                  expected rather than a flaw. */}
              <pointLight position={[1.75, -1, 2]} intensity={3.5} distance={7} decay={2} color="#ff7a30" />
            </>
    )
}
