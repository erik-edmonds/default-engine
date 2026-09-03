import * as THREE from 'three'

// Where the sun disc currently is, and how much lens flare it should throw.
//
// A module-level singleton rather than an atom or context because of where the
// two ends sit: Environment.tsx computes the sun's position every frame inside
// page.tsx's <Suspense>, while the <EffectComposer> that needs it is mounted
// outside that boundary entirely. Routing a 60fps value through React state to
// cross that gap would mean 60 re-renders a second of the whole canvas tree --
// the same reason Environment.tsx keeps its tweened blend in a ref and reads
// it imperatively in useFrame rather than holding it in state.
//
// Written once per frame by Environment.tsx; read once per frame by
// SunFlare.tsx. Both run inside the same canvas, so there is no ordering
// hazard worth guarding: a one-frame-stale sun position is imperceptible.
export const sunState = {
  /** World position of the sun disc, on the shared sun/moon arc. */
  position: new THREE.Vector3(),
  /** 0..1, tweened from the active preset's flareOpacity. Evening only. */
  flare: 0,
}
