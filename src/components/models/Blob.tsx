"use client"

import { MeshDistortMaterial } from '@react-three/drei'

// The waterfall foam (Foam.tsx mounts four of these). It has no click handler
// and never did, but it used to raise a pointer cursor on hover -- a promise
// of interactivity it can't keep. Harmless-ish with a native cursor; with the
// custom one it would open the lens and read as a target, so the hover is gone
// entirely rather than being migrated.
export const Blob = ({ distort, speed,  ...props }) => {
  return (
    <mesh {...props}>
      <sphereGeometry args={[1, 24, 8]} scale={[1.5, 0.5, 1.5]} />
      
      <MeshDistortMaterial 
        distort={distort} 
        speed={speed} 
        flatShading={true} 
        color="#c5d3d7"
        roughness={1.0}
        metalness={0.0}
      />
    </mesh>
  )
}