/** Where the torches stand, two to a floating island.
 *
 *  WORLD SPACE, AND MEASURED RATHER THAN EYEBALLED.
 *
 *  The floating islands are hand-placed nodes inside the gltfjsx dump
 *  `components/models/MergedScene.tsx`, under one `Sketchfab_model` subtree
 *  whose own transform is then composed with `<Merged>`'s
 *  `translate(0,-5.5,0) · rotateY(90°) · scale(3)` (Scene.tsx). There is no
 *  table of island transforms to hang children off.
 *
 *  Worse, two of the four island groups carry a mesh-level offset INSIDE
 *  them -- `Icosphere003_14`'s mesh sits at a local [13.9, -4.1, 5.9], for
 *  instance -- so the group's origin is some eighteen units from the island
 *  you can actually see. A torch added as a child of those groups hangs in
 *  open air. That is why these are world positions worked out from the
 *  composed matrices and the meshes' real bounding boxes, rather than
 *  offsets from a parent.
 *
 *  The heights are the islands' usable surface, taken from what already
 *  stands on them (the trees and rocks in the same file), not from the
 *  bounding-box top -- the big island's bbox peaks at y 17.8 but everything
 *  standing on it sits between 11.3 and 14.3.
 */

export interface TorchSite {
  /** Which island, for readers -- unused by the code. */
  island: string
  position: [number, number, number]
  /** Turned so the pair do not read as a matched set. */
  rotationY: number
}

export const TORCH_SITES: TorchSite[] = [
  // The big upper island (Icosphere_27) -- the "upper" hotspot.
  { island: "upper", position: [-3.2, 12.5, -16.4], rotationY: 0.4 },
  { island: "upper", position: [-9.6, 12.2, -17.8], rotationY: -1.1 },

  // The tree island (Icosphere002_13) -- the "left-tree" hotspot. Its green
  // top is at y 1.48, centred near (-17.4, 0.7, -12.9).
  { island: "left-tree", position: [-15.9, 1.3, -11.4], rotationY: 2.1 },
  { island: "left-tree", position: [-18.8, 1.3, -13.7], rotationY: -0.6 },

  // The moon island (Icosphere003_14) -- the "moon-island" hotspot. Small:
  // its green top is only 4.3 x 3.7, centred (10.4, 2.8, -20.2).
  { island: "moon-island", position: [9.5, 3.9, -19.3], rotationY: 1.3 },
  { island: "moon-island", position: [11.4, 3.9, -21.1], rotationY: -2.0 },

  // The fourth isle (Icosphere004_15), which has no hotspot of its own --
  // bbox centred (2.5, 2.4, -19.2), top y 5.21.
  { island: "fourth", position: [1.7, 4.6, -18.4], rotationY: 0.9 },
  { island: "fourth", position: [3.4, 4.6, -20.0], rotationY: -1.5 },
]
