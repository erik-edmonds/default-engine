import Foam from '@/components/models/Foam'
import { SplashParticles } from '@/components/models/Particles'

export function Waterfall() {
    return (
        <>
            {/* Rotated with the island when it turned 100 -> 85 degrees. This
                lines up with a cliff inside merged.glb, so it is a world point
                standing ON the island and has to follow it. */}
            <group position={[0.21, -4, -12.37]}>
                <SplashParticles count={250} />
            </group>
        </>
    )
}