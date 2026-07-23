const REDUCED_MOTION_SCALE = 0.05
const MIN_DURATION = 0.05

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

// Scales a GSAP tween's duration down (never to exactly 0 -- GSAP treats
// that as a distinct "apply instantly" case) when the OS-level
// prefers-reduced-motion setting is on, so choreographed sequences
// (CameraController/AvatarController) still move through the same
// positions/easing, just much faster, instead of needing a separate
// reduced-motion code path.
export function tweenDuration(seconds: number) {
  return prefersReducedMotion() ? Math.max(seconds * REDUCED_MOTION_SCALE, MIN_DURATION) : seconds
}
