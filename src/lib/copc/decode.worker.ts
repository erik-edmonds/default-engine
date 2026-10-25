/** Decodes one COPC node: LAZ chunk in, typed arrays out.
 *
 *  THE FIRST WORKER IN THIS REPO. Two notes for whoever writes the second.
 *
 *  1. It imports `laz-perf` and NOTHING else from node_modules. Deliberately:
 *     `copc` pulls in `cross-fetch`, which pulls in `node-fetch`, and none of
 *     that belongs in a worker whose only job is to turn bytes into floats.
 *     The ~20 lines of `decompressChunk` below are a direct transcription of
 *     copc's own (lib/las/point-data.js) so the behaviour is identical.
 *
 *  2. There is no `/// <reference lib="webworker" />`. Adding it alongside
 *     tsconfig's "dom" lib produces a wall of duplicate-identifier errors,
 *     and `next build` type-checks for real -- `ignoreBuildErrors` was
 *     deliberately removed from next.config.ts. The minimal interface below
 *     plus one cast is the whole workaround, and it costs nothing.
 *
 *  Why decode here at all: at 72Hz the frame budget is 13.7ms, and a
 *  100,000-point node takes tens of milliseconds to inflate. On the main
 *  thread that is a guaranteed dropped frame every time a node lands.
 */
import { createLazPerf } from "laz-perf"

import { decodeRecords, type Scaling } from "./records"

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: "message", fn: (event: MessageEvent) => void): void
}
const ctx = globalThis as unknown as WorkerScope

export interface DecodeRequest {
  id: number
  /** The raw LAZ chunk for this node, transferred in. */
  compressed: ArrayBuffer
  pointCount: number
  pointDataRecordFormat: number
  pointDataRecordLength: number
  scaling: Scaling
  origin: [number, number, number]
}

export interface DecodeResponse {
  id: number
  position?: Float32Array
  color?: Float32Array
  classification?: Uint8Array
  pointCount?: number
  error?: string
}

/** One instance for the life of the worker. Emscripten modules are expensive
 *  to stand up and entirely reusable. */
let lazPerfPromise: ReturnType<typeof createLazPerf> | undefined

function getLazPerf() {
  if (!lazPerfPromise) {
    // SERVED FROM OUR OWN ORIGIN, not guessed relative to the bundled chunk.
    // Emscripten's default resolution looks for laz-perf.wasm next to the JS
    // that loaded it, which under Turbopack is a hashed chunk path that does
    // not exist. public/wasm/ is the copy, and next.config.ts's headers()
    // rule names `wasm` so it is cached for a year rather than refetched on
    // every visit.
    lazPerfPromise = createLazPerf({ locateFile: () => "/wasm/laz-perf.wasm" })
  }
  return lazPerfPromise
}

/** Transcribed from copc's lib/las/point-data.js. The malloc/free pair and
 *  the `finally` matter: the Emscripten heap is not garbage collected, and a
 *  throw partway through a node would otherwise leak a megabyte per failure. */
async function decompressChunk(
  compressed: Uint8Array,
  pointCount: number,
  pointDataRecordFormat: number,
  pointDataRecordLength: number,
): Promise<Uint8Array> {
  const lazPerf = await getLazPerf()
  const out = new Uint8Array(pointCount * pointDataRecordLength)
  let blobPointer = 0
  let dataPointer = 0
  let decoder: InstanceType<Awaited<ReturnType<typeof createLazPerf>>["ChunkDecoder"]> | undefined
  try {
    blobPointer = lazPerf._malloc(compressed.byteLength)
    dataPointer = lazPerf._malloc(pointDataRecordLength)
    const chunk = new lazPerf.ChunkDecoder()
    decoder = chunk
    lazPerf.HEAPU8.set(compressed, blobPointer)
    chunk.open(pointDataRecordFormat, pointDataRecordLength, blobPointer)
    for (let i = 0; i < pointCount; i++) {
      chunk.getPoint(dataPointer)
      out.set(
        new Uint8Array(lazPerf.HEAPU8.buffer, dataPointer, pointDataRecordLength),
        i * pointDataRecordLength,
      )
    }
  } finally {
    lazPerf._free(blobPointer)
    lazPerf._free(dataPointer)
    decoder?.delete()
  }
  return out
}

ctx.addEventListener("message", (event: MessageEvent) => {
  const job = event.data as DecodeRequest
  void (async () => {
    try {
      const records = await decompressChunk(
        new Uint8Array(job.compressed),
        job.pointCount,
        job.pointDataRecordFormat,
        job.pointDataRecordLength,
      )
      const decoded = decodeRecords(
        records,
        job.pointCount,
        job.pointDataRecordLength,
        job.pointDataRecordFormat,
        job.scaling,
        job.origin,
      )
      const response: DecodeResponse = {
        id: job.id,
        position: decoded.position,
        color: decoded.color,
        classification: decoded.classification,
        pointCount: decoded.pointCount,
      }
      // Transferred, not copied -- these are the only reference the main
      // thread will hold, and a megabyte per node adds up fast otherwise.
      ctx.postMessage(response, [
        decoded.position.buffer,
        decoded.color.buffer,
        decoded.classification.buffer,
      ])
    } catch (error) {
      const response: DecodeResponse = {
        id: job.id,
        error: error instanceof Error ? error.message : String(error),
      }
      ctx.postMessage(response)
    }
  })()
})
