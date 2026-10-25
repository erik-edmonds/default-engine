import type * as THREE from "three"

/** Where the hands are, for code that is not inside a controller.
 *
 *  `XRControllerState` carries an optional `object` (input.d.ts:25), but
 *  OPTIONAL is the problem: it is populated by whatever happens to render a
 *  model for that controller, so it is null before the model loads and gone
 *  entirely if the model is switched off. Grabbing the world with a hand that
 *  is sometimes null is not a thing to build on.
 *
 *  So each controller mounts a bare `<group>` inside its own `grip-space` and
 *  registers it here. The group's `matrixWorld` is then the hand's pose in
 *  world space, every frame, with no model involved.
 *
 *  GRIP SPACE, NOT TARGET-RAY SPACE. The ray points where you aim; the grip is
 *  where your fist actually is. Grabbing something and having it orbit a point
 *  six inches in front of your knuckles is the kind of wrongness people feel
 *  immediately and cannot name.
 *
 *  Module scope and mutable, like `xrRenderer` and `scanStats`: it is written
 *  by a component inside the XR origin's portal and read by one in the main
 *  scene, every frame, and neither should re-render for it.
 */
export const xrHands: {
  left: THREE.Object3D | null
  right: THREE.Object3D | null
} = { left: null, right: null }
