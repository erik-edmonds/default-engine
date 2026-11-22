/** What the survey finds.
 *
 *  THE SHAPE IS THE POINT. An entry is a class, a label and a way to find the
 *  thing -- which is what a real detector emits. When CV output replaces this
 *  table, the source of the list changes and nothing downstream does:
 *  DetectionBrackets measures whatever node it is handed and knows nothing
 *  about where the list came from.
 *
 *  FOUND BY NAME, because the island has two coordinate regimes and name
 *  lookup is blind to both. Props placed in Scene.tsx are already world-space;
 *  anything inside merged.glb sits under
 *  `translate(0,-5.5,0) . rotateY(100deg) . scale(3)` (see config/positions.ts
 *  for why). helpers/orientedBounds.ts reads matrixWorld, so the chain applies
 *  itself and this table never has to care which regime a target is in. */

export type OpticsClass =
  /** The one person. */
  | "avatar"
  /** Things that are alive and move under their own power. */
  | "animal"
  /** Everything else -- props, terrain, weather. */
  | "object"

/** Three tones, every one of them a colour the site already uses. A single
 *  accent across fifty-nine boxes reads as a mesh laid over the scene; by
 *  class it reads as classification. */
export const OPTICS_CLASS_COLOR: Record<OpticsClass, string> = {
  /** The site accent: hotspot hover, scene hints, sound toggle, name stamp. */
  avatar: "#d25a1a",
  /** The beacon's own blue, already in the scene ten times over. */
  animal: "#1fb2f5",
  /** The green from JourneyPath.tsx's route overlay -- the only green the
   *  repo already owns, and far enough from the blue to separate at a
   *  glance. */
  object: "#3ad1a0",
}

export type OpticsTarget = {
  /** Stable key. */
  id: string
  cls: OpticsClass
  /** Drawn above the box, uppercased. OPTIONAL: a target with no label still
   *  gets a box. Used where several of a kind sit close enough together that
   *  three captions would collide -- the palms -- and for the two GROUP
   *  entries, where the one label goes to a single instance rather than all
   *  forty-two. */
  label?: string

  // --- exactly one of these three says how to find it ---

  /** A single named node. */
  node?: string
  /** SEVERAL named nodes that together are one thing, unioned into the first
   *  one's frame. The floating islands need this: gltfjsx laid them out as
   *  flat siblings and there is no wrapper to point at. */
  nodes?: string[]
  /** Expanded at scan time into one target per live instance. */
  group?: "clouds" | "birds"

  /** An AUTHORED box in the node's own local space, used instead of
   *  measuring. */
  box?: { min: [number, number, number]; max: [number, number, number] }
  /** Extra world-space padding around the measured box, for silhouettes
   *  bigger than their geometry. */
  pad?: number
}

/** A cloud, from cloud.glb's own `Cloud_0` extents.
 *
 *  AUTHORED BECAUSE IT CANNOT BE MEASURED. drei's <Instance> is a
 *  `PositionMesh extends THREE.Group`, so both `isMesh` and `isSkinnedMesh`
 *  are undefined on it and orientedBounds' walk takes neither branch -- it
 *  returns an empty box and the cloud is silently skipped. The real geometry
 *  lives on the parent <Instances> mesh, which is ONE mesh for all 24, so
 *  measuring that would give a single box around the whole ring. */
const CLOUD_BOX = {
  min: [-2.689, -1.16, -1.095] as [number, number, number],
  max: [2.491, 1.164, 1.91] as [number, number, number],
}

/** One palm, in PalmTree's local frame.
 *
 *  AUTHORED, not measured, and for a reason worth knowing: a palm mounts
 *  EIGHTEEN skinned meshes, not the ten the JSX names. The <primitive> for
 *  `GLTF_created_2_rootJoint` drags a nested second armature into the bone
 *  chain, carrying eight more meshes that appear nowhere in PalmTree.tsx. A
 *  walk finds them all, which is correct but slow for three trees that are
 *  the same tree.
 *
 *  These are the real post-fix extents over all 843 vertices, so the box is
 *  measured even though it is written down. */
export const PALM_BOX = {
  min: [-2.413, -1.067, -0.965] as [number, number, number],
  max: [2.073, 7.922, 3.022] as [number, number, number],
}

/** Sizes the instance buffer. Worst case is 1 avatar + 1 Charizard + 6 birds
 *  + 2 props + 3 portals + 4 islands + 42 clouds = 59; the headroom is for a
 *  cloud-count change in config/store.ts. */
export const OPTICS_MAX_TARGETS = 64

export const OPTICS_TARGETS: OpticsTarget[] = [
  { id: "avatar", cls: "avatar", label: "Erik Edmonds", node: "avatar-root" },

  // --- alive ---
  { id: "charizard", cls: "animal", label: "Charizard", node: "charizard" },
  // Five seagulls plus the one gull on the pier. The flock's children are
  // unnamed, so they are reached positionally; the flock also UNMOUNTS at
  // night, leaving the named group childless, which resolves to nothing and
  // is skipped without a special case.
  { id: "birds", cls: "animal", label: "Bird", group: "birds" },

  // --- props on the beach ---
  { id: "ball", cls: "object", label: "Beach ball", node: "group1945116984" },
  // The one target where an axis-aligned box would be visibly wrong: a thin
  // slab at a compound tilt, whose world AABB is half again too wide.
  { id: "surfboard", cls: "object", label: "Surfboard", node: "Sketchfab_model002" },

  // --- the palms, boxable at last ---
  //
  // They were excluded for three rounds because PalmTree.tsx added the rig's
  // own baked offset a second time, so a palm's group was not where the palm
  // was and no measurement could fix a transform applied twice. That is fixed
  // at the source now; see the note on Armature001_61 in PalmTree.tsx.
  //
  // Authored boxes rather than measured ones: each palm mounts eighteen
  // skinned meshes once the nested armature is counted, and all three are the
  // same tree.
  //
  // ONE LABEL BETWEEN THEM. They stand in a cluster alongside the avatar, the
  // ball and the surfboard, where the captions already crowd each other --
  // three more reading PALM would be a pile. The portals and the island get
  // one each because they are far apart; these are not.
  { id: "palm-near", cls: "object", label: "Palm", node: "palm-near", box: PALM_BOX },
  { id: "palm-left", cls: "object", node: "palm-left", box: PALM_BOX },
  { id: "palm-right", cls: "object", node: "palm-right", box: PALM_BOX },

  // --- the portals, each labelled: there are only three and they are far
  //     apart, so the labels cannot collide the way the beach props' do ---
  { id: "portal-01", cls: "object", label: "Portal", node: "portal-01" },
  { id: "portal-02", cls: "object", label: "Portal", node: "portal-02" },
  { id: "portal-03", cls: "object", label: "Portal", node: "portal-03" },

  // --- the four floating islands ---
  //
  // THE NAMES HAVE NO DOTS. gltfjsx stripped them, so the GLB's
  // `Icosphere.002_13` is `Icosphere002_13` in the JSX and in the live graph.
  // Looking up the dotted form returns undefined and fails silently, which is
  // exactly what the first draft of this table did.
  //
  // Each is a union because there is no per-island wrapper -- they are flat
  // siblings under GLTF_SceneRootNode, which also holds about twenty-five
  // unrelated props.
  // ONE ISLAND, NOT FOUR. All four were boxed at first and it was too much:
  // they are 13 to 26 units across, so their wireframes spanned most of the
  // frame and crossed everything else in it. The moon island -- the one the
  // Reconstruction portal belongs to -- is the one that stays.
  //
  // The other three are left here, commented, because the names are the
  // awkward part and they were hard-won: gltfjsx STRIPS THE DOTS, so the
  // GLB's `Icosphere.002_13` is `Icosphere002_13` live, and the dotted form
  // returns undefined with no error at all.
  //
  //   upper:  ["Icosphere_27"]   -- and NOT Plane001_0, which is the pond ON
  //           it, a plane at scale 8.295 that is most of the island's
  //           measured 26 x 20 x 27
  //   left:   ["Icosphere002_13", "BigTree_8", "RockTree_28"]
  //   fourth: ["Icosphere004_15"]
  { id: "island-moon", cls: "object", label: "Island", nodes: ["Icosphere003_14", "RockTree001_29"] },

  // --- weather ---
  // Forty-two of them, one label. Labelling some but not all would read as
  // instances having been missed; labelling all of them would add forty-odd
  // transparent draw calls to a scene the codebase repeatedly calls
  // fill-bound. One reads as a legend.
  { id: "clouds", cls: "object", label: "Cloud", group: "clouds", box: CLOUD_BOX },
]
