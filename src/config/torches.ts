/** Where the torches stand: one per island, and only on islands that carry a
 *  portal.
 *
 *  "I want 1 torch per island, and only on islands with portals. The torch
 *  should be visible, planted firmly on the island, on the right side of the
 *  portal." So three torches, not eight -- the fourth floating island has no
 *  portal and now has no torch either.
 *
 *  WORLD SPACE, AND MEASURED RATHER THAN EYEBALLED.
 *
 *  The floating islands are hand-placed nodes inside the gltfjsx dump
 *  `components/models/MergedScene.tsx`, under one `Sketchfab_model` subtree
 *  whose own transform is then composed with `<Merged>`'s
 *  `translate(0,-5.5,0) · rotateY(90°) · scale(3)` (Scene.tsx). There is no
 *  table of island transforms to hang children off, and two of the four
 *  island groups carry a mesh-level offset INSIDE them, so a torch added as a
 *  child of those groups hangs in open air.
 *
 *  WHY THESE ARE MEASURED FROM THE HOTSPOT AND NOT FROM THE PORTAL.
 *
 *  "Right of the portal" sounds like it should be the portal's position plus
 *  its own right vector, and that is what I tried first. It does not work,
 *  because a portal is not on its island: `portalTransformFor` puts it
 *  PORTAL_VIEW_DISTANCE in front of the VIEWPOINT -- the camera -- and the
 *  camera stands well back. Measured, by scanning every island mesh for the
 *  highest surface under each spot:
 *
 *    portal 01  [-25.91, 3.44, -16.28]   nothing below it anywhere in a
 *                                        7x7 metre grid. It floats eight
 *                                        metres clear of its island.
 *    portal 02  [ 12.46, 5.99, -20.14]   ground 0.6 below -- this one is
 *                                        close to its island.
 *    portal 03  [ -9.82, 14.82, -24.79]  ground 0.7 below at +1.5m right.
 *
 *  So the anchor is the HOTSPOT -- a point over the island by construction,
 *  since it is the ring you stand on -- stepped sideways along the PORTAL's
 *  right vector, which keeps "right" meaning right as a visitor looking at
 *  that portal sees it.
 *
 *  AND THEN CHECKED ON SCREEN, which is where the first attempt came apart
 *  twice over. Stepping two metres right put the torch at screen x 844
 *  inside a portal whose silhouette runs 588 to 955 -- behind it, not beside
 *  it, because the portal is four metres from the lens and the island is
 *  fifteen. And the height was wrong too: a scan for "the highest surface
 *  under this spot" returns the top of a TREE as readily as the ground, so
 *  the hotspot read 3.5 where the island is really 1.3. Both are settled by
 *  projecting every candidate cell from the hotspot's own camera and keeping
 *  only those that are on plausible ground AND land clear of the portal's
 *  screen box. The screen positions are quoted below so the next person can
 *  tell whether they still hold.
 */

export interface TorchSite {
  /** Which island, and therefore which portal it stands beside. */
  island: string
  /** The portal it belongs to, for readers -- unused by the code. */
  portal: string
  position: [number, number, number]
  /** Turned so the three do not read as a matched set. */
  rotationY: number
}

/** How big a torch is drawn. 0.8 of the model's own scale makes it about 1.9
 *  units tall, against a portal frame of 2.43 -- "the torch should be
 *  visible", and at the previous 0.6 it was a thirty-pixel sliver from the
 *  home viewpoint. Shoulder-height beside the portal is the read. */
export const TORCH_SCALE = 0.8

/** The torch model is 2.32 units tall at scale 1, so its flame sits at about
 *  0.86 of that. Derived rather than typed, so changing TORCH_SCALE moves the
 *  light with the fire instead of leaving it floating at the old height. */
export const TORCH_FLAME_HEIGHT = 2.32 * 0.86 * TORCH_SCALE

export const TORCH_SITES: TorchSite[] = [
  // The tree island -- portal 01, the Gallery. Projects to screen x 1012
  // against a portal that ends at 955: clear of it, and on surface measured
  // at 1.51.
  { island: "left-tree", portal: "01", position: [-18.9, 1.51, -10.24], rotationY: 1.2 },

  // The moon island -- portal 02, the globe. Screen x 1029 against a portal
  // ending at 936, on a shelf measured at 5.42 -- above the portal's own
  // base, so the torch stands in front of the frame's buried lower half.
  { island: "moon-island", portal: "02", position: [9.6, 5.42, -19.51], rotationY: -0.6 },

  // The big upper island -- portal 03, the mini-game. Screen x 1088 against
  // a portal ending at 858.
  //
  // 11.26, NOT THE 13.69 THE SCAN LIKED BEST. I picked 13.69 first on the
  // reasoning that two neighbouring cells agreeing to the centimetre meant a
  // flat rock rather than a treetop -- which is wrong, because two
  // neighbouring samples of the SAME TREE agree just as exactly. The torch
  // came out hanging two metres above the grass, plainly, in a screenshot.
  // The island here carries a stand of trees; 11.2 is the band three cells
  // agree on BELOW them (11.17, 11.26, 11.18) and is the ground.
  { island: "upper", portal: "03", position: [-8.58, 11.26, -12.23], rotationY: 0.5 },
]
