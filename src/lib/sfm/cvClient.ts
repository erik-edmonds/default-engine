"use client"

import type { CvRequest, CvResponse } from "@/lib/sfm/cv.worker"

/** The main thread's handle on the OpenCV worker.
 *
 *  The same shape as src/lib/copc/pool.ts -- an id-keyed map of pending
 *  promises, in-band errors, lazy construction -- but ONE worker rather than a
 *  pool. The pool exists because point-cloud nodes decode independently and
 *  arrive in bursts; these stages are strictly sequential (frame N's pose
 *  depends on frame N-1's), and each OpenCV instance carries its own ~11 MB
 *  heap, so a second would buy nothing and cost a lot.
 *
 *  LAZY, and that is the whole payload story. Constructing this is what
 *  fetches /wasm/opencv.js, so nothing outside /detection ever pays for it.
 */
export class CvClient {
  private worker: Worker | undefined
  private readonly pending = new Map<number, { resolve: (r: CvResponse) => void; reject: (e: Error) => void }>()
  private nextId = 1
  private disposed = false

  private ensure(): Worker {
    if (this.disposed) throw new Error("CvClient disposed")
    if (!this.worker) {
      // NO { type: "module" }. The worker calls importScripts, which a module
      // worker may not -- see the header of cv.worker.ts for why it has to.
      //
      // `new URL(..., import.meta.url)` is the form every bundler recognises
      // statically; a bare string would be left as a runtime URL and 404.
      this.worker = new Worker(new URL("./cv.worker.ts", import.meta.url))
      this.worker.addEventListener("message", (event: MessageEvent) => {
        const res = event.data as CvResponse
        const slot = this.pending.get(res.id)
        if (!slot) return
        this.pending.delete(res.id)
        if (res.error) slot.reject(new Error(res.error))
        else slot.resolve(res)
      })
      this.worker.addEventListener("error", (event) => {
        // A worker that fails to boot -- a bad importScripts path, a syntax
        // error -- would otherwise hang every queued job forever with no
        // diagnostic. The decoder pool records the same hazard.
        const error = new Error(`opencv worker failed: ${event.message}`)
        for (const [id, slot] of this.pending) {
          slot.reject(error)
          this.pending.delete(id)
        }
      })
    }
    return this.worker
  }

  private send(request: CvRequest, transfer: Transferable[] = []): Promise<CvResponse> {
    const worker = this.ensure()
    return new Promise<CvResponse>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject })
      worker.postMessage(request, transfer)
    })
  }

  /** Stands the runtime up and reports what it is. Loading eleven megabytes
   *  takes a moment, and a caller needs something to show while it does. */
  async ping(): Promise<string> {
    const res = await this.send({ id: this.nextId++, kind: "ping" })
    return res.build ?? "OpenCV"
  }

  /** ORB keypoints and descriptors for one frame.
   *
   *  `pixels` is TRANSFERRED, so the caller's ImageData is detached on return
   *  -- grab anything else you need from it first. */
  async features(
    pixels: ArrayBuffer,
    width: number,
    height: number,
    maxFeatures?: number,
  ): Promise<{ points: Float32Array; descriptors: Uint8Array; cols: number; count: number; ms: number }> {
    const res = await this.send(
      { id: this.nextId++, kind: "features", pixels, width, height, maxFeatures },
      [pixels],
    )
    return {
      points: res.points as Float32Array,
      descriptors: res.descriptors as Uint8Array,
      cols: res.descriptorCols ?? 32,
      count: res.count ?? 0,
      ms: res.ms ?? 0,
    }
  }

  /** Lowe-ratio-filtered matches between two descriptor blocks.
   *
   *  Both buffers are TRANSFERRED, so pass copies if the descriptors are
   *  needed again -- and in a sequential reconstruction they are, because
   *  frame N's descriptors get matched again against frame N+1. */
  async match(
    a: ArrayBuffer,
    b: ArrayBuffer,
    rowsA: number,
    rowsB: number,
    cols: number,
    ratio?: number,
  ): Promise<{ pairs: Int32Array; proposed: number; ms: number }> {
    const res = await this.send(
      { id: this.nextId++, kind: "match", descriptorsA: a, descriptorsB: b, rowsA, rowsB, cols, ratio },
      [a, b],
    )
    return { pairs: res.pairs ?? new Int32Array(0), proposed: res.proposed ?? 0, ms: res.ms ?? 0 }
  }

  /** Resection one frame against known 3D points. */
  async pnp(
    objectPoints: Float64Array,
    imagePoints: Float64Array,
    k: { fx: number; fy: number; cx: number; cy: number },
  ): Promise<{ R: number[][]; t: [number, number, number]; inliers: Int32Array } | null> {
    const res = await this.send({
      id: this.nextId++,
      kind: "pnp",
      objectPoints,
      imagePoints,
      k,
    })
    if (!res.R || !res.t) return null
    const r = res.R
    return {
      R: [
        [r[0], r[1], r[2]],
        [r[3], r[4], r[5]],
        [r[6], r[7], r[8]],
      ],
      t: [res.t[0], res.t[1], res.t[2]],
      inliers: res.pnpInliers ?? new Int32Array(0),
    }
  }

  /** Start (or top up) sparse optical-flow tracking on this frame.
   *
   *  `keep` tops up around the points already being followed instead of
   *  starting over, which is what a keyframe does when tracking has bled
   *  points. `pixels` is transferred. */
  async kltSeed(
    pixels: ArrayBuffer,
    width: number,
    height: number,
    options: { maxCorners?: number; minDistance?: number; keep?: boolean } = {},
  ): Promise<{ points: Float32Array; ids: Int32Array; before: number; ms: number }> {
    const res = await this.send(
      { id: this.nextId++, kind: "kltSeed", pixels, width, height, ...options },
      [pixels],
    )
    return {
      points: res.tracked ?? new Float32Array(0),
      ids: res.ids ?? new Int32Array(0),
      before: res.before ?? 0,
      ms: res.ms ?? 0,
    }
  }

  /** Follow the tracked points one frame forward. `pixels` is transferred. */
  async kltStep(
    pixels: ArrayBuffer,
    width: number,
    height: number,
  ): Promise<{ points: Float32Array; ids: Int32Array; before: number; ms: number }> {
    const res = await this.send(
      { id: this.nextId++, kind: "kltStep", pixels, width, height },
      [pixels],
    )
    return {
      points: res.tracked ?? new Float32Array(0),
      ids: res.ids ?? new Int32Array(0),
      before: res.before ?? 0,
      ms: res.ms ?? 0,
    }
  }

  dispose(): void {
    this.disposed = true
    for (const [, slot] of this.pending) slot.reject(new Error("CvClient disposed"))
    this.pending.clear()
    this.worker?.terminate()
    this.worker = undefined
  }
}
