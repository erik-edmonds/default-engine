import * as THREE from "three"

// Single source of truth for the intro's straight-line camera path: the
// loading screen's Earth model and the camera's starting (hold) position are
// both placed directly behind ISLAND_CAMERA_POSITION along the island
// camera's own forward vector, at different distances. That makes them
// collinear by construction, so once loading finishes and "Enter" is
// clicked, a straight-line camera move from INTRO_CAMERA_POSITION to
// ISLAND_CAMERA_POSITION passes through the Earth partway through and lands
// exactly on the island's resting shot -- reading as a satellite zooming
// into a spot on Earth and flying past it, not a separate cut. No rotation
// tween needed -- the camera already faces this direction from frame one,
// and never turns.

// The homepage's resting shot (the Canvas's original static camera prop,
// and CameraController.revealIsland()'s tween target).
export const ISLAND_CAMERA_POSITION = new THREE.Vector3(-4.607673525253576, 1.7341116509862307, 19.91558734132968)
export const ISLAND_CAMERA_ROTATION = new THREE.Euler(-0.026670116897649598, -0.19209102169139866, -0.005092805496596532)

const FORWARD = new THREE.Vector3(0, 0, -1).applyEuler(ISLAND_CAMERA_ROTATION)

// World-space scale of the Earth model (see EarthIntro.tsx) -- tuned
// together with the two distances below so it reads as a comfortable,
// mostly-frame-filling circle from the intro camera's starting position.
// The model's raw geometry is a ~1-unit-radius sphere, its own baked node
// scale is ~3.586 (see EarthIntro.tsx), and the camera sits 7 units from
// it (INTRO_CAMERA_DISTANCE - EARTH_DISTANCE) with a 45deg FOV -- this
// keeps the sphere's subtended half-angle safely under the camera's
// 22.5deg half-FOV instead of overflowing the frame.
export const EARTH_WORLD_SCALE = 0.46
const EARTH_DISTANCE = 15
const INTRO_CAMERA_DISTANCE = 22

export const FLAT_EARTH_POSITION = ISLAND_CAMERA_POSITION.clone().addScaledVector(FORWARD, -EARTH_DISTANCE)
export const INTRO_CAMERA_POSITION = ISLAND_CAMERA_POSITION.clone().addScaledVector(FORWARD, -INTRO_CAMERA_DISTANCE)

// How far through the INTRO_CAMERA_POSITION -> ISLAND_CAMERA_POSITION dolly
// (as a fraction of total distance travelled, not tween time -- see
// CameraController.revealIsland, which measures the camera's actual live
// position rather than the eased tween-time fraction, since those two
// diverge under a non-linear ease) the camera reaches the Earth's near
// surface and would start rendering its inside. (EARTH_DISTANCE / INTRO_CAMERA_DISTANCE
// is where the camera reaches the Earth's *center*; this is nudged earlier
// by roughly the sphere's own world-space radius so the swap to the island
// scene happens right as the surface fills the frame, not partway through it.)
export const EARTH_CROSS_FRACTION = 0.24
