import * as THREE from "three"

/** How far the island is turned about Y, and the reason half the constants in
 *  this file exist.
 *
 *  Scene.tsx renders the terrain as
 *  `<Merged scale={3} position={[0,-5.5,0]} rotation={[0, ISLAND_ROTATION_Y, 0]}/>`
 *  inside `<group name="island-terrain">`. Everything that stands ON the island
 *  -- the hotspot rings, the destination viewpoints, the portals derived from
 *  them, the torches in config/torches.ts -- is a world-space SIBLING of that
 *  group, not a child of it. They are hand-measured against the island as it
 *  stands and they do NOT follow when it turns.
 *
 *  THAT HAS ALREADY BITTEN ONCE. The island went from Math.PI/2 (90 deg) to
 *  Math.PI/1.8 (100 deg) and left every attached point behind by 10 degrees --
 *  0.87 units at the home ring, 6.10 at the left-tree viewpoint. The portals
 *  and torches hung off their islands in open air.
 *
 *  THE REPAIR IS A RIGID TRANSFORM, NOT A RE-SURVEY. The island is rigid, so
 *  rotating each attached point by the DIFFERENCE about the world Y axis puts
 *  it back on the rock it was measured on. The `position={[0,-5.5,0]}` is a Y
 *  offset only and a Y rotation is unaffected by a Y translation, so the pivot
 *  is the world Y axis and every height below is preserved exactly.
 *
 *  TO TURN THE ISLAND AGAIN: change this constant, then run
 *  `node scripts/rotate-island-props.mjs <oldDeg> <newDeg>` and paste what it
 *  prints into the three places it names. Positions go through applyAxisAngle;
 *  recorded camera Eulers go through quaternion composition, which is NOT the
 *  same as adding the delta to the Euler's Y component. */
export const ISLAND_ROTATION_Y = Math.PI / 1.8

/** The establishing shot, and the `home` destination.
 *
 *  DELIBERATELY NOT ROTATED WITH THE ISLAND. This is the observer, not
 *  something standing on the terrain: turning it with the island would frame
 *  the island exactly as before and undo the rotation on screen. The home
 *  hotspot RING does rotate -- it rests on the rock -- but the camera watching
 *  it stays where it is. */
export const ISLAND_CAMERA_POSITION = new THREE.Vector3(-3.664144209462056, -1.3328955326653973, 14.573847292787715)
export const ISLAND_CAMERA_ROTATION = new THREE.Euler(0.1425715380736859, -0.20031082545079631, 0.028554043959312565)
//-4.305272996829482, -0.9663852774488382, 14.446175552133592 : 0.09120431134238671, -0.24533080891137232, 0.02220942449251981
//-3.664144209462056, -1.3328955326653973, 14.573847292787715 : 0.1425715380736859, -0.20031082545079631, 0.028554043959312565

/** The three destination viewpoints: where the camera flies when you click a
 *  hotspot, and -- via `portalTransformFor` -- where that destination's portal
 *  hangs. The portal is placed PORTAL_VIEW_DISTANCE in front of the viewpoint
 *  along its own forward vector, so moving a viewpoint moves its portal with
 *  it and nothing else has to be touched.
 *
 *  ONE COPY, HERE, BECAUSE THERE USED TO BE TWO. IslandExperience.tsx owned
 *  these and config/journey.ts kept its own identical literals for the sky
 *  journey's stops. Nothing linked them, so rotating the island fixed the
 *  hotspots while the journey went on flying to the old, unrotated spots --
 *  the same destination framed two different ways depending on how you got
 *  there. Both now read these.
 *
 *  Rotated +10 degrees with the island; see ISLAND_ROTATION_Y above. */
export const UPPER_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(-16.89723485805785, 15.973606020841718, -25.92586314538039)
export const UPPER_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.796415022766344, -0.7073409748468277, -2.912054737215411)

export const LEFT_TREE_VIEWPOINT_POSITION = new THREE.Vector3(-32.7641641288276, 3.1939029441428497, -12.344836413979273)
export const LEFT_TREE_VIEWPOINT_ROTATION = new THREE.Euler(2.842485524524102, -1.381167490290896, 2.8475409479402063)

export const MOON_ISLAND_VIEWPOINT_POSITION = new THREE.Vector3(10.753882390370874, 6.795693566831701, -25.959456018690705)
export const MOON_ISLAND_VIEWPOINT_ROTATION = new THREE.Euler(-2.9397248864109176, 0.45495698796346024, 3.0519035400785604)

/** The rings you click, resting on the terrain itself. Rotated with the
 *  island, heights unchanged -- each one is still on the rock it was measured
 *  on. */
export const UPPER_ISLAND_HOTSPOT_POSITION: [number, number, number] = [-11.24, 12.97, -11.3]
export const LEFT_TREE_HOTSPOT_POSITION: [number, number, number] = [-16.71, 3.47, -10.19]
export const MOON_ISLAND_HOTSPOT_POSITION: [number, number, number] = [7.41, 5.57, -21.33]
export const HOME_HOTSPOT_POSITION: [number, number, number] = [-3.59, -1.8, 3.5]
