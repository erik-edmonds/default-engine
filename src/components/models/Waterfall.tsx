import Foam from '@/components/models/Foam'
import { SplashParticles } from '@/components/models/Particles'

export function Waterfall() {
    return (
        <>
            <group position={[-3, -4, -12]}>
                <SplashParticles count={250} />
            </group>
        </>
    )
}