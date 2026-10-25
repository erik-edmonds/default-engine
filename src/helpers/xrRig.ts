import type * as THREE from "three"

/** The two objects the wearer actually moves.
 *
 *  MODULE SCOPE, NOT PROPS, and the lint rule that forced it is correct.
 *  Passing these down as refs and mutating `ref.current.position` inside a
 *  frame callback trips `react-hooks/immutability` -- "this argument is a
 *  function which may reassign or mutate `origin` after render" -- because
 *  that is exactly what it does, and the React Compiler cannot know the
 *  mutation is confined to three's own scene graph rather than to React
 *  state. Suppressing the rule would be lying to it.
 *
 *  Published here instead, the same way `xrRenderer`, `cameraBase` and
 *  `xrHands` already are: written by whoever mounts the object, read every
 *  frame by code that must not re-render for it.
 *
 *  `origin` is the play space -- TRANSLATION AND YAW ONLY. three builds each
 *  eye as `parent.matrixWorld x camera.matrix` with the runtime's projection
 *  untouched, so a scale here multiplies the wearer's interpupillary
 *  distance: at the tabletop's 1:709 an IPD of 63 mm becomes 0.09 mm, which
 *  is no stereo at all and a world that reads flat and infinitely far away.
 *
 *  `model` is the handling group that sits ABOVE the rig, so what the hands
 *  do stays separate from what the rig computed. A uniform scale on it still
 *  cancels out of the LOD, because `selectNodes` transforms the camera into
 *  the cloud's own space through `group.matrixWorld`.
 */
export const xrRig: {
  origin: THREE.Object3D | null
  model: THREE.Object3D | null
} = { origin: null, model: null }
