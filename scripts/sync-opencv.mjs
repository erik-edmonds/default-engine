/** Copy the installed opencv.js into public/wasm/, where it is served from.
 *
 *  WHY IT IS NOT IMPORTED. `@techstark/opencv-js` ships ONE 10.87 MB file with
 *  the WebAssembly embedded in it. Importing that from a worker would push it
 *  through Turbopack, which would parse and re-emit eleven megabytes of
 *  Emscripten output on every build to produce a chunk whose contents are
 *  already final. Serving it as a static asset and pulling it in with
 *  `importScripts` skips the bundler entirely.
 *
 *  WHY public/wasm/ SPECIFICALLY. next.config.ts's headers() rule names
 *  `wasm` among the directories cached for a year with revalidation. A new
 *  directory would be served max-age=0 and refetched on every visit --
 *  public/racing/ is the standing proof of that, as that rule's own comment
 *  says. laz-perf.wasm is already there for the same reason.
 *
 *  SINGLE FILE, SO NO locateFile. The decoder worker has to tell Emscripten
 *  where its .wasm lives (see src/lib/copc/decode.worker.ts); this build has
 *  nothing separate to find, so that whole class of path bug does not apply.
 *
 *  Run after changing the pinned version:  node scripts/sync-opencv.mjs
 */
import { copyFileSync, mkdirSync, statSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = join(root, "node_modules/@techstark/opencv-js/dist/opencv.js")
const dest = join(root, "public/wasm/opencv.js")

const version = JSON.parse(
  readFileSync(join(root, "node_modules/@techstark/opencv-js/package.json"), "utf8"),
).version

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)

console.log(`\n  @techstark/opencv-js ${version}`)
console.log(`  ${src.replace(root + "/", "")}`)
console.log(`  -> ${dest.replace(root + "/", "")}  (${(statSync(dest).size / 1e6).toFixed(2)} MB)\n`)
