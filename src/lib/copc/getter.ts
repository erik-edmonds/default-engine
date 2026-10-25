/** An abortable range reader for a COPC file over HTTP.
 *
 *  copc.js ships `Getter.http`, and this exists because that one cannot be
 *  cancelled. A head turn invalidates a dozen in-flight node requests at
 *  ~1.8MB each; without an AbortController those keep downloading and keep
 *  the connection pool busy while the nodes you now want queue behind them.
 *
 *  THE URL IS REUSED, NEVER RE-SIGNED PER REQUEST. `Range` is not a
 *  CORS-safelisted header, so every cross-origin ranged fetch is preceded by
 *  an OPTIONS preflight -- and Chromium caches that result keyed on the URL.
 *  One stable URL means one preflight for the whole session (the sample file
 *  returns `Access-Control-Max-Age: 3000`); a URL that changes per request
 *  means a preflight per node, doubling the request count and adding a full
 *  round trip to every fetch. When these become presigned S3 URLs, they must
 *  still be minted once per session and reused, not per node. */

export interface GetterOptions {
  /** Aborted together with everything else this signal governs -- the
   *  traversal passes one per node so a node leaving the frustum takes its
   *  download with it. */
  signal?: AbortSignal
}

export type RangeGetter = ((begin: number, end: number, options?: GetterOptions) => Promise<Uint8Array>) & {
  /** Bytes actually fetched, for the budget readout. */
  readonly bytesFetched: number
  /** Range requests issued. The first paint should cost exactly two. */
  readonly requestCount: number
}

export function createRangeGetter(url: string): RangeGetter {
  let bytesFetched = 0
  let requestCount = 0

  const getter = async (begin: number, end: number, options: GetterOptions = {}) => {
    if (begin < 0 || end < 0 || begin > end) throw new Error(`invalid range ${begin}-${end}`)
    requestCount++
    const response = await fetch(url, {
      // end is EXCLUSIVE here but HTTP's range is inclusive, so the -1 is
      // load-bearing. copc.js's own getter does the same; getting it wrong
      // reads one byte too many into the next point record and the node
      // decodes to nonsense rather than failing.
      headers: { Range: `bytes=${begin}-${end - 1}` },
      signal: options.signal,
    })
    if (!response.ok) throw new Error(`range ${begin}-${end} failed: ${response.status}`)
    const buffer = await response.arrayBuffer()
    bytesFetched += buffer.byteLength
    return new Uint8Array(buffer)
  }

  return Object.defineProperties(getter as RangeGetter, {
    bytesFetched: { get: () => bytesFetched },
    requestCount: { get: () => requestCount },
  }) as RangeGetter
}
