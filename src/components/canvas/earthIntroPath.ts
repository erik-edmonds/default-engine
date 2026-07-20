import * as THREE from "three"

// Single source of truth for the Earth-intro flight path: the intro's
// starting camera position and Earth's world position are both placed
// directly behind ISLAND_CAMERA_POSITION along the island camera's own
// forward vector, at different distances. That makes them collinear by
// construction, so a straight-line camera move from EARTH_CAMERA_POSITION
// to ISLAND_CAMERA_POSITION passes through/near Earth partway through and
// lands exactly on the island's resting shot -- no rotation tween needed
// at all, since the camera already faces this direction from frame one.

// The homepage's resting shot (the Canvas's original static camera prop,
// and CameraController.revealIsland()'s tween target).
export const ISLAND_CAMERA_POSITION = new THREE.Vector3(-4.928243225199323, 2.4125281238269634, 12.519669594882314)
export const ISLAND_CAMERA_ROTATION = new THREE.Euler(-0.19036563694483571, -0.36883975963262605, -0.06936299235827743)

const FORWARD = new THREE.Vector3(0, 0, -1).applyEuler(ISLAND_CAMERA_ROTATION)

// Earth's original, comfortable satellite-view framing. Growing Earth to
// try to out-occlude the island made rendering too expensive (a camera-
// close, screen-filling Earth took the headless test environment's
// software-rendered frame time from seconds to minutes) and put the camera
// uncomfortably close to the surface. Two other fixes were tried and
// abandoned: scaling the island scene down around the resting camera
// position left parts of the terrain within/near the near-clipping plane
// (visibly broken geometry); a separate occluding backdrop placed on the
// camera's flight path is fundamentally boxed in -- the camera passes
// through every point on that path during the reveal, so any backdrop
// sized enough to help either hides Earth at the start, swallows the
// camera before it reaches rest, or both. See the conversation with the
// user for where this landed.
export const EARTH_WORLD_SCALE = 3
const EARTH_DISTANCE = 40
const START_DISTANCE = 70

export const EARTH_WORLD_POSITION = ISLAND_CAMERA_POSITION.clone().addScaledVector(FORWARD, -EARTH_DISTANCE)
export const EARTH_CAMERA_POSITION = ISLAND_CAMERA_POSITION.clone().addScaledVector(FORWARD, -START_DISTANCE)
