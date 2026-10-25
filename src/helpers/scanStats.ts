import type { CloudStats } from "@/components/scan/PointCloud"

import { FrameTimes } from "@/helpers/frameStats"

/** The live numbers, published to a module object instead of React state.
 *
 *  WHY NOT useState. `PointCloud` recomputes its selection on an interval and
 *  calls `onStats` each time — about six times a second. On the desktop that
 *  is a cheap DOM update and completely fine. In a session it is six React
 *  renders a second, each committing to a DOM nobody can see, on the main
 *  thread that is also building troika geometry and issuing draw calls for
 *  two eyes. The readout is the one thing that must not perturb the
 *  measurement it exists to report.
 *
 *  So: writers mutate, readers poll on their own schedule. The same pattern
 *  as `xrRenderer` and `xrGate` in helpers/xr.ts, for the same reason — a
 *  value that crosses the React boundary in the wrong direction.
 *
 *  Module scope, not a context: there is exactly one scan canvas per page,
 *  and a context would have to be read during render, which is the thing
 *  being avoided.
 */
export const scanStats: {
  /** Last published cloud state. */
  cloud: CloudStats
  /** Points allowed on screen, as it stands — walkable in-headset. */
  budget: number
  /** "table" or "life". */
  scaleMode: "table" | "life"
  /** 710 means 1:710, as the RIG placed it. */
  ratio: number
  /** What the wearer's hands have done to it since: 1 is untouched, 4 is four
   *  times the size the rig chose. Kept apart from `ratio` so the readout can
   *  report the scale actually on the table rather than the one it started
   *  at -- grabbing with both hands and pulling them apart changes what you
   *  are looking at, and a panel that keeps saying 1:709 is lying. */
  userScale: number
  /** Frame durations, in ms. Fed by FrameMeter. */
  frames: FrameTimes
  /** Refresh rate the runtime actually granted, 0 when unknown. */
  hz: number
  /** Eye framebuffer, as three sized it. [0, 0] outside a session. */
  framebuffer: [number, number]
  /** What three's WebXRManager reports, not what we asked for. */
  foveation: number
  /** renderer.info at the last panel tick. */
  drawCalls: number
  programs: number
  /** `pointsMaterial.size`, in CSS pixels, as the cloud sets it. */
  pointSize: number
  /** `gl.getPixelRatio()`. THREE MULTIPLIES THE TWO: the shader's
   *  `gl_PointSize` is `size * pixelRatio`, and three sets the ratio to 1 for
   *  a session, so the worn size is not the desktop one. The panel shows the
   *  product, which is the only number that means anything. */
  pixelRatio: number
} = {
  cloud: { points: 0, nodes: 0, bytes: 0, requests: 0, loading: 0, ready: false },
  budget: 0,
  scaleMode: "table",
  ratio: 1,
  userScale: 1,
  frames: new FrameTimes(),
  hz: 0,
  framebuffer: [0, 0],
  foveation: 0,
  drawCalls: 0,
  programs: 0,
  pointSize: 0,
  pixelRatio: 1,
}
