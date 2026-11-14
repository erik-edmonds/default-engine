/** A static file server that honours `Range`, for testing COPC readers.
 *
 *     node scripts/range-server.mjs <file.copc.laz> [port]
 *
 *  WHY THIS IS IN THE REPOSITORY. scripts/copc-golden.ts fetches a cloud by
 *  byte range -- that is the whole point of the format -- so verifying a
 *  freshly produced derivative needs something to serve it. Node's built-in
 *  static servers and `python -m http.server` IGNORE `Range` and answer 200
 *  with the entire body, which does not fail: the decoder reads bytes from
 *  the wrong offset and reports a parser error. A tool whose absence produces
 *  a misleading failure belongs beside the test that needs it, not in a
 *  temporary directory -- this is the third time it has been rewritten after
 *  a scratch directory was cleared.
 *
 *  CORS is wide open and the file is read-only. It binds to localhost and is
 *  a development tool; nothing here is meant to face a network.
 */
import { createServer } from "node:http"
import { createReadStream, statSync } from "node:fs"
import { basename, resolve } from "node:path"

const file = resolve(process.argv[2] ?? "")
const port = Number(process.argv[3] ?? 8099)
const size = statSync(file).size

const server = createServer((request, response) => {
  // `Range` is not a CORS-safelisted header, so a browser preflights every
  // ranged request -- and `content-range` has to be exposed or the reader
  // cannot see how large the file is.
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "range",
    "access-control-expose-headers": "content-range,content-length,accept-ranges",
    "accept-ranges": "bytes",
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, cors).end()
    return
  }

  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.range ?? "")
  if (!range) {
    response.writeHead(200, { ...cors, "content-length": size, "content-type": "application/octet-stream" })
    createReadStream(file).pipe(response)
    return
  }

  // An open-ended range ("bytes=500-") runs to the end of the file; an
  // end-only range ("bytes=-500") is the last 500 bytes.
  let start = range[1] ? Number(range[1]) : 0
  let end = range[2] ? Number(range[2]) : size - 1
  if (!range[1] && range[2]) {
    start = Math.max(size - Number(range[2]), 0)
    end = size - 1
  }
  end = Math.min(end, size - 1)
  if (start > end) {
    response.writeHead(416, { ...cors, "content-range": `bytes */${size}` }).end()
    return
  }

  response.writeHead(206, {
    ...cors,
    "content-range": `bytes ${start}-${end}/${size}`,
    "content-length": end - start + 1,
    "content-type": "application/octet-stream",
  })
  createReadStream(file, { start, end }).pipe(response)
})

server.listen(port, "127.0.0.1", () => {
  console.log(`serving ${basename(file)} (${size.toLocaleString()} bytes) on http://127.0.0.1:${port}/`)
})
