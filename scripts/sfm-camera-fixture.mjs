/** Turn the rendered sequence into a video, so the LIVE path can be tested.
 *
 *  Run:  NEXT_DIST_DIR=.next-verify npx next build && \
 *        NEXT_DIST_DIR=.next-verify npx next start -p 3111 &
 *        node scripts/sfm-camera-fixture.mjs
 *
 *  WHY THIS EXISTS. "Point a camera at a room" is not a repeatable test. The
 *  rendered demo is repeatable and its camera poses are KNOWN, so if those
 *  exact frames can be delivered through `getUserMedia` then the live path --
 *  permission, the frame pump, optical flow, the bootstrap, resection -- can
 *  be asserted against ground truth exactly as the offline path already is,
 *  with nothing stubbed.
 *
 *  Chrome takes `--use-file-for-fake-video-capture=<file>.y4m` and serves it
 *  to getUserMedia as a real camera, looping when it runs out. Playwright
 *  drives real Chrome for Testing, so the flag is available.
 *
 *  The frames are harvested by scrubbing the demo's own canvas with
 *  `?overlay=0`, which draws the frame without the keypoint markers -- those
 *  are not in the scene and the tracker would follow them.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const BASE = process.env.PROBE_URL ?? "http://localhost:3111"
/** NOT under a dist directory. It was `.next-verify/fixture` and `next build`
 *  cleans that, so the next build silently deleted the fixture and the camera
 *  test failed with "No camera found" -- Chrome's way of saying it could not
 *  open the file it was pointed at. */
const OUT = process.env.FIXTURE_DIR ?? join(process.cwd(), ".fixtures", "camera")
/** Chrome loops the file, but a longer clip means fewer seams. */
const REPEATS = Number(process.env.FIXTURE_REPEATS ?? 6)

const require_ = createRequire(`${execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim()}/`)
const { chromium } = require_("@playwright/test")

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()

await page.goto(`${BASE}/detection?overlay=0`, { waitUntil: "domcontentloaded" })
console.log("  waiting for the rendered sequence…")
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(2000)
  const step = await page.evaluate(() => document.querySelector(".sfm-step")?.textContent ?? "")
  if (/^reconstruction$|^failed$/.test(step)) break
}

const total = await page.evaluate(() => Number(document.querySelector(".sfm-scrub")?.max ?? 0) + 1)
if (!total) {
  console.error("  no frames to harvest -- did the demo finish?")
  process.exit(1)
}
console.log(`  harvesting ${total} frames`)

let written = 0
for (let i = 0; i < total; i++) {
  await page.evaluate((frame) => {
    const r = document.querySelector(".sfm-scrub")
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set
    setter.call(r, String(frame))
    r.dispatchEvent(new Event("input", { bubbles: true }))
    r.dispatchEvent(new Event("change", { bubbles: true }))
  }, i)
  await page.waitForTimeout(90)
  const dataUrl = await page.evaluate(() => document.querySelector(".sfm-canvas")?.toDataURL("image/png"))
  if (!dataUrl) continue
  writeFileSync(join(OUT, `f${String(written).padStart(4, "0")}.png`), Buffer.from(dataUrl.split(",")[1], "base64"))
  written++
}
await browser.close()
console.log(`  wrote ${written} frames to ${OUT}`)

// Repeat the sweep so the clip is long enough to initialise in comfortably,
// and so a loop seam is not the first thing the tracker sees.
let n = written
for (let r = 1; r < REPEATS; r++) {
  for (let i = 0; i < written; i++) {
    // Alternate direction, so the camera sweeps back and forth rather than
    // teleporting to the start -- a jump cut breaks optical flow completely.
    const src = r % 2 === 1 ? written - 1 - i : i
    execFileSync("cp", [join(OUT, `f${String(src).padStart(4, "0")}.png`), join(OUT, `f${String(n).padStart(4, "0")}.png`)])
    n++
  }
}

const y4m = join(OUT, "camera.y4m")
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error",
  "-framerate", "15",
  "-i", join(OUT, "f%04d.png"),
  "-pix_fmt", "yuv420p",
  y4m,
])
console.log(`  wrote ${y4m} (${n} frames at 15fps)\n`)
console.log(`  feed it to Chrome with:\n    --use-file-for-fake-video-capture=${y4m}\n`)
