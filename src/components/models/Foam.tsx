"use client"

import { Blob } from '@/components/models/Blob'

export default function Foam() {

  return (
    <group>
        // Instance this
        <Blob position={[-1, 0, 0]} distort={0.7} speed={7}  />
        <Blob position={[-1.25, 0, 0]} distort={0.5} speed={5}  />
        <Blob position={[-0.5, 0, 0]} distort={0.6} speed={2}  />
        <Blob position={[1, 0, 0]} distort={0.7} speed={4}  />
    </group>
  )
}