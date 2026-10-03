# Credits

Third-party assets and code used in this project.

This file exists because there was no record anywhere in the repo of where the
3D assets came from, and one credit that *was* rendered on screen had drifted
onto the wrong model — see "A correction" below.

## Code

**[pmndrs/drei](https://github.com/pmndrs/drei) — "Portals" example.**
`src/components/canvas/Card.tsx` began as that example's `<Frame>` component:
the rounded-plane geometry, the `MeshPortalMaterial` blend, the `/item/:id`
wouter route and the double-click-to-enter behaviour are all from it. The
example's own props (`id`, `name`, `author`, `bg`, and the pickles / tea /
orange models) were carried over with it.

Other libraries are listed in `package.json` with their licences resolved by
npm: three, @react-three/fiber, @react-three/drei, @react-three/postprocessing,
gsap, jotai, howler, wouter, maath, d3.

## 3D models

Several models in `public/models/` are downloaded assets — identifiable by the
`Sketchfab_Scene` / `Sketchfab_model` wrapper nodes that Sketchfab's glTF export
leaves in the file, which survive in the gltfjsx output:

| component | file |
|---|---|
| `BrownTree` | `brown_tree.glb` |
| `Campfire` / `DeadCampfire` | `campfire.glb` |
| `ClusterTree` | `cluster_tree.glb` |
| `Earth` | `earth.glb` |
| `Gull` | `gull.glb` |
| `Palm` | `palm.glb` |
| `PalmTree` | `palmtree.glb` |
| `Pokeball` | `pokeball.glb` |
| `Seagull` | `seagull.glb` |
| the island cluster (`MergedScene`) | `merged.glb` |

**These are not yet individually attributed.** Each needs its original author,
source URL and licence recorded here before the site ships publicly — several
Sketchfab licences (CC-BY in particular) require visible attribution, and a
portfolio is exactly the context where that matters. Tracked as outstanding
rather than quietly omitted.

Pokémon designs (Poké Ball, Dragonite, Charizard, Ditto) are trademarks of
Nintendo / Creatures Inc. / GAME FREAK, used here decoratively and
non-commercially.

## Audio

`public/sound/` — `music.mp3`, `waves.mp3`, `tides.mp3`, `rain.mp3`,
`click.mp3`, `whoosh.mp3`, `boing.mp3`. Sources not yet recorded; same
outstanding action as the models above.

## A correction

Every one of the three portals on the island rendered the credit
**"Omar Faruq Tawsif"** on its face. That name came from the drei portals
example, where it credits the artist behind *that* example's pickles, tea and
orange models — none of which are still in the island scene. The portals had
since been swapped to `earth.glb`, so a real artist's name was being displayed,
publicly, over work that was not his.

The per-portal credit is now tied to what each portal actually contains.

## The mini-game

`/mini-game` is a port of **R3F-Car-Racing** by **DanieloM83** —
<https://github.com/DanieloM83/R3F-Car-Racing>. The track, car, ramp and
barrel models (`public/racing/models/`), the environment map and the ground
textures (`public/racing/textures/`) are from that project, as are every
handling constant in `src/components/racing/useWheels.ts` and the collider
placements in `Track.tsx`.

What changed in the port is recorded at each site: the input model
(`useControls.ts`), the car's loader (`Car.tsx`), the ground texture clone
(`Ground.tsx`) and the asset URLs (`paths.ts`).

**OUTSTANDING, AND BLOCKING FOR A PUBLIC SHIP.** The upstream repository
carries no LICENSE file and its README states no terms, so there is at
present no permission on record to redistribute either its code or its art.
This needs the author's explicit say-so — or the game needs replacing —
before the site goes public. It is listed here rather than quietly shipped
because that is the same mistake the correction below records.
