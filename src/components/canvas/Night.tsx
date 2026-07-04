import { Stars } from "@react-three/drei"
import { Campfire } from "@/components/models/Campfire"
import { Moon } from "@/components/models/Moon"
import * as THREE from "three"

export function Night() {
    return (
        <>
              <mesh scale={500}>
                <sphereGeometry />
                <meshStandardMaterial color="#27c6e5" roughness={0.7} side={THREE.BackSide} />
              </mesh>
              <Campfire scale={1.5} position={[1.75, -2, 2]} />
              <Moon scale={0.15} position={[15, 10, -20]} />
              <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
              <ambientLight intensity={0.75} color="#0b47a7" />
              <ambientLight intensity={0.05} color="#white" />
              <spotLight position={[-10, 15, 0]} angle={45} decay={1} distance={15} penumbra={0.5} intensity={15} color="white" />
              <spotLight position={[10, 15, 0]} angle={-45} decay={1} distance={15} penumbra={0.5} intensity={15} color="white" />
              <spotLight position={[10, 0, 0]} angle={-90} decay={1} distance={185} penumbra={0.5} intensity={15} color="white" />
              <spotLight position={[-10, 0, 0]} angle={-90} decay={1} distance={185} penumbra={0.5} intensity={15} color="white" />
              <spotLight position={[0, 20, 2]} angle={0.5} decay={1} distance={185} penumbra={0.5} intensity={200} color="#125999" />
              <spotLight position={[-19, 0, -8]} color="#854650" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={50} />
              <spotLight position={[19, 0, -8]} color="#022154" angle={0.25} decay={0.75} distance={185} penumbra={-1} intensity={50} />
            </>
    )
}