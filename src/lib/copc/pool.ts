import type { DecodeRequest, DecodeResponse } from "./decode.worker"
import type { DecodedNode } from "./records"

/** A small pool of decode workers.
 *
 *  Sized at 2 by default rather than `hardwareConcurrency`. Each worker
 *  stands up its own Emscripten instance with its own heap, so they are not
 *  free, and the work is bursty -- a head turn queues a dozen nodes and then
 *  nothing for seconds. Two keeps a node in flight while another decodes,
 *  which is all the parallelism the fetch side can feed anyway at 6-8
 *  concurrent range requests.
 *
 *  Not a generic utility. It knows it decodes point-cloud nodes, which keeps
 *  the message protocol a plain interface instead of a type parameter nobody
 *  else will ever instantiate. */
export class DecodePool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: DecodeRequest[] = []
  private pending = new Map<number, { resolve: (n: DecodedNode) => void; reject: (e: Error) => void }>()
  private nextId = 1
  private disposed = false

  constructor(private readonly size = 2) {}

  /** Lazily, so merely importing this module does not spawn threads -- and
   *  so construction happens on the client, never during SSR. */
  private ensure() {
    if (this.workers.length || this.disposed) return
    for (let i = 0; i < this.size; i++) {
      // `new URL(..., import.meta.url)` is the form every bundler recognises
      // statically; a string path would be left as a runtime URL and 404.
      const worker = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" })
      worker.addEventListener("message", (event: MessageEvent) => this.onDone(worker, event.data as DecodeResponse))
      worker.addEventListener("error", (event) => {
        // A worker that fails to boot (bad wasm path, syntax error) would
        // otherwise hang every queued job forever with no diagnostic.
        for (const [id, p] of this.pending) {
          p.reject(new Error(`decode worker failed: ${event.message}`))
          this.pending.delete(id)
        }
      })
      this.workers.push(worker)
      this.idle.push(worker)
    }
  }

  decode(job: Omit<DecodeRequest, "id">): Promise<DecodedNode> {
    this.ensure()
    const id = this.nextId++
    return new Promise<DecodedNode>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.dispatch({ ...job, id })
    })
  }

  private dispatch(request: DecodeRequest) {
    const worker = this.idle.pop()
    if (!worker) {
      this.queue.push(request)
      return
    }
    worker.postMessage(request, [request.compressed])
  }

  private onDone(worker: Worker, response: DecodeResponse) {
    const waiting = this.pending.get(response.id)
    this.pending.delete(response.id)
    const next = this.queue.shift()
    if (next) worker.postMessage(next, [next.compressed])
    else this.idle.push(worker)

    if (!waiting) return
    if (response.error || !response.position) {
      waiting.reject(new Error(response.error ?? "decode produced no points"))
      return
    }
    waiting.resolve({
      position: response.position,
      color: response.color ?? new Float32Array(0),
      classification: response.classification ?? new Uint8Array(0),
      pointCount: response.pointCount ?? 0,
    })
  }

  dispose() {
    this.disposed = true
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.idle = []
    this.queue = []
    for (const [, p] of this.pending) p.reject(new Error("decode pool disposed"))
    this.pending.clear()
  }
}
