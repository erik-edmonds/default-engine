/** Frame timing, measured the only way that means anything in a headset.
 *
 *  MILLISECONDS, AND NEVER FPS. In a session the compositor is in charge:
 *  asynchronous timewarp re-projects the last good frame when the app misses
 *  one, so the displayed rate is pinned to a divisor of the panel rate — 72,
 *  36, 24 — and an app sitting at 13.95 ms reports "72fps" exactly like one
 *  sitting at 2 ms. The signal is in the distribution of frame durations,
 *  which FPS averages away by construction.
 *
 *  MEDIAN AND p95, NOT MEAN. A point cloud's cost is spiky: a node landing on
 *  the GPU, a shader link, a GC pause. The mean folds those into the baseline
 *  and reports a number the viewer never actually renders at. The median is
 *  what it feels like; p95 is what makes you sick.
 *
 *  Pure arithmetic over a ring buffer, with no renderer and no React, so a
 *  probe can feed it a known sequence and check the percentiles exactly.
 */

/** ~16 s at 72 Hz. Sized so one settled sample window fits whole — see
 *  SAMPLE_WINDOW_MS — rather than to any display property. */
const CAPACITY = 1200

export class FrameTimes {
  private buf = new Float32Array(CAPACITY)
  private scratch = new Float32Array(CAPACITY)
  /** Total pushes ever, not the count held. The ring needs both. */
  private seen = 0

  push(ms: number) {
    this.buf[this.seen % CAPACITY] = ms
    this.seen++
  }

  /** How many samples are actually available. */
  get count(): number {
    return Math.min(this.seen, CAPACITY)
  }

  /** The most recent `n` durations, newest last, into `this.scratch`.
   *
   *  Returns the number written, which is less than `n` early in a session.
   *  Reuses one scratch array because this runs at 4 Hz inside a frame
   *  callback and a fresh 1200-float allocation four times a second is exactly
   *  the kind of thing that shows up in the p95 it is trying to measure. */
  private take(n: number): number {
    const k = Math.min(n, this.count)
    const start = this.seen - k
    for (let i = 0; i < k; i++) this.scratch[i] = this.buf[(start + i) % CAPACITY]
    return k
  }

  /** Nearest-rank percentile over the last `n` frames. `p` in 0..1.
   *
   *  Nearest-rank rather than interpolated: these are observed frame
   *  durations, and the honest answer to "what is the 95th percentile" is one
   *  of the frames that actually happened. */
  percentile(p: number, n = CAPACITY): number {
    const k = this.take(n)
    if (k === 0) return 0
    const slice = this.scratch.subarray(0, k)
    slice.sort()
    const rank = Math.min(k - 1, Math.max(0, Math.ceil(p * k) - 1))
    return slice[rank]
  }

  /** Frames in the last `n` that took longer than `thresholdMs`.
   *
   *  "Dropped" is a judgement, not a measurement — the runtime does not tell
   *  us. This counts frames that overran their slot, which is the thing we
   *  can see and the thing the compositor reacts to. */
  droppedAbove(thresholdMs: number, n = CAPACITY): number {
    const k = this.take(n)
    let dropped = 0
    for (let i = 0; i < k; i++) if (this.scratch[i] > thresholdMs) dropped++
    return dropped
  }

  /** Wall time covered by the last `n` frames, in ms. */
  spanMs(n = CAPACITY): number {
    const k = this.take(n)
    let total = 0
    for (let i = 0; i < k; i++) total += this.scratch[i]
    return total
  }

  reset() {
    this.seen = 0
  }
}

/** The frame budget at a given refresh rate, in ms. */
export const frameBudgetMs = (hz: number) => 1000 / hz

/** What counts as an overrun.
 *
 *  1.5x the slot rather than 1.0x: a frame that takes 14.1 ms at 72 Hz has
 *  missed its slot, but a threshold at exactly the slot width would count
 *  measurement jitter as a drop and report 40% dropped on a viewer that looks
 *  perfect. At 1.5x a counted frame has definitely cost the compositor a
 *  re-projection. */
export const DROP_FACTOR = 1.5
