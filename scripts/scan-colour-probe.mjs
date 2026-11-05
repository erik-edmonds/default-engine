/** COLOUR MODES IN A REAL BROWSER, AND WHETHER THE SHADER COMPILES AT ALL.
 *
 *  Run:  npx next build && npx next start -p 3111
 *        node scripts/scan-colour-probe.mjs            # needs Playwright
 *
 *  IN THE REPO, NOT IN A TEMP DIRECTORY, and that is the point of this header.
 *  Every browser probe this project has written has lived in a scratch dir and
 *  been lost when it was cleaned -- twice now. The arithmetic suite
 *  (xr-measure-test.ts) and the decoder oracle (copc-golden.ts) survived
 *  precisely because they are committed. A regression test that does not
 *  outlive the session that wrote it is a one-off check wearing a test's
 *  clothes.
 *
 *  WHAT IT GUARDS. Phase 2 replaced `<pointsMaterial>` with a raw
 *  ShaderMaterial so the annotation can be seen: by ASPRS class, by height
 *  above ground, or the file's own RGB. That swap is the riskiest edit on this
 *  route, because a ShaderMaterial that fails to compile does not throw
 *  anywhere a user would see -- three logs to the console and draws nothing,
 *  which looks exactly like "the point cloud stopped rendering".
 *
 *  That specific regression has already cost this project two rounds, once
 *  from a near-plane change and once from a 537-metre uikit panel. So the
 *  first and last questions here are both "are there still points on screen",
 *  and the ones in between ask whether switching modes does what it claims:
 *  one uniform write, no new geometry, no new program.
 *
 *  Playwright is resolved from a global install rather than being a
 *  devDependency -- it is a 300MB browser download and this is the only thing
 *  in the project that needs it. `--use-angle=metal` reaches the real GPU;
 *  SwiftShader runs at ~4fps and makes nothing measurable.
 */
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const BASE = process.env.PROBE_URL ?? 'http://localhost:3111'

function loadChromium() {
  const candidates = []
  try {
    candidates.push(execSync('npm root -g', { encoding: 'utf8' }).trim())
  } catch {
    // npm not on PATH; the explicit env var below is the fallback.
  }
  if (process.env.PLAYWRIGHT_PATH) candidates.unshift(process.env.PLAYWRIGHT_PATH)
  for (const root of candidates) {
    try {
      return createRequire(`${root}/`)('@playwright/test').chromium
    } catch {
      continue
    }
  }
  console.error(
    'Playwright not found. Install it globally:\n' +
      '  npm i -g @playwright/test && npx playwright install chromium\n' +
      'or set PLAYWRIGHT_PATH to the directory containing @playwright/test.',
  )
  process.exit(2)
}

const chromium = loadChromium()
const res = []
const check = (n, ok, d = '') => {
  res.push(ok)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  -- ' + d : ''}`)
}

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal'] })
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage()
const errs = []
const glErrs = []
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)))
// THE IMPORTANT LISTENER. A GLSL compile failure arrives as a console error
// from three, never as a page error, so without this the probe would pass with
// a completely broken shader and an empty screen.
page.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' && /shader|glsl|compile|program|WebGL/i.test(t)) glErrs.push(t.slice(0, 400))
})

await page.addInitScript(() => {
  window.__pairs = []
  window.__THREE_DEVTOOLS__ = new EventTarget()
  window.__THREE_DEVTOOLS__.addEventListener('observe', (e) => {
    const r = e.detail
    if (!r || !r.isWebGLRenderer || r.__p) return
    r.__p = true
    window.__gl = r
    const o = r.render.bind(r)
    r.render = function (s, c) {
      if (s?.isScene && c?.isCamera && !window.__pairs.some((p) => p.scene === s)) {
        window.__pairs.push({ scene: s, camera: c })
      }
      return o(s, c)
    }
  })
  window.__points = () => {
    const out = []
    for (const p of window.__pairs) p.scene.traverse((o) => { if (o.isPoints) out.push(o) })
    return out
  }
})

await page.goto(`${BASE}/scan/autzen`, { waitUntil: 'load', timeout: 180000 })
// Wait for real nodes, not merely for a canvas.
await page.waitForFunction(() => (window.__gl?.info.render.points ?? 0) > 100000, null, { timeout: 120000 })
await page.waitForTimeout(6000)

// --- it renders at all --------------------------------------------------
const base = await page.evaluate(() => ({
  points: window.__gl.info.render.points,
  calls: window.__gl.info.render.calls,
  programs: window.__gl.info.programs.length,
  nodes: window.__points().length,
}))
check('the point cloud renders through the new ShaderMaterial',
  base.points > 100_000,
  `${base.points.toLocaleString()} points in ${base.calls} draw calls across ${base.nodes} nodes -- the regression that has cost two rounds already`)
check('no shader compiled with an error',
  glErrs.length === 0,
  glErrs[0] ?? 'no GLSL/program errors on the console -- a compile failure here draws nothing and throws nowhere')
check('one program serves every node',
  base.programs <= 2,
  `${base.programs} program(s) for ${base.nodes} nodes -- the per-node material differs only in a uniform, so three's cache must dedupe it`)

// --- the attributes the annotation needs --------------------------------
const attrs = await page.evaluate(() => {
  const pts = window.__points()
  const names = pts.map((p) => Object.keys(p.geometry.attributes).sort().join(','))
  const cls = pts[0]?.geometry.attributes.classification
  return {
    unique: [...new Set(names)],
    itemSize: cls?.itemSize,
    normalized: cls?.normalized,
    type: cls?.array?.constructor?.name,
    distinct: cls ? new Set(Array.from(cls.array.slice(0, 20000))).size : 0,
  }
})
check('every node carries a classification attribute',
  attrs.unique.length === 1 && attrs.unique[0].includes('classification'),
  `attributes: ${attrs.unique.join(' | ')} -- it has crossed the worker boundary since the decoder was written and was being dropped at toGeometry`)
check('and it is a non-normalized byte, so it can index the palette',
  attrs.itemSize === 1 && attrs.normalized === false && attrs.type === 'Uint8Array',
  `itemSize ${attrs.itemSize}, normalized ${attrs.normalized}, ${attrs.type} -- normalizing would divide every ASPRS code by 255`)
check('the classified sample really carries several classes',
  attrs.distinct > 1,
  `${attrs.distinct} distinct codes in the first 20k points -- a single value would mean the byte is read at the wrong offset`)
check('the un-annotated source file has no height attribute, and that is fine',
  !attrs.unique[0].includes('hag'),
  `attributes: ${attrs.unique[0]} -- autzen has not been through the pipeline, so HAS_HAG is undefined and the shader never reads it`)

// --- per-node point size, finally off the floor -------------------------
const sizes = await page.evaluate(() => {
  const u = window.__points().map((p) => p.material.uniforms.uSize.value)
  return { min: Math.min(...u), max: Math.max(...u), distinct: new Set(u).size }
})
check('point size is computed per node, not one constant for the file',
  sizes.distinct > 1,
  `${sizes.distinct} distinct sizes from ${sizes.min.toFixed(1)} to ${sizes.max.toFixed(1)} px -- a COPC octree halves its spacing every level`)
check('and nothing is drawn under the 3px shimmer floor',
  sizes.min >= 3,
  `smallest is ${sizes.min.toFixed(2)} px, against the flat 1.6 this replaced -- which was 1.6 DEVICE px worn, under the floor`)

// --- shared by reference where it must be -------------------------------
const sharing = await page.evaluate(() => {
  const pts = window.__points()
  const first = pts[0].material.uniforms
  return {
    mode: pts.every((p) => p.material.uniforms.uColorMode === first.uColorMode),
    palette: pts.every((p) => p.material.uniforms.uClassPalette === first.uClassPalette),
    sizes: new Set(pts.map((p) => p.material.uniforms.uSize)).size === pts.length,
  }
})
check('every node shares ONE uColorMode uniform object',
  sharing.mode && sharing.palette,
  'so a mode switch is a single assignment -- no traversal of the resident set, no re-upload, no React commit')
check('while each node keeps its OWN size uniform',
  sharing.sizes,
  'shared by reference where it must be, per-node where it must be')

// --- switching mode is a uniform write, not a rebuild -------------------
//
// The colour-mode store is a module, not something on `window`, so this drives
// the shared uniform exactly as `setColorMode` does and asserts the observable
// consequences. The store's own three lines are covered by the arithmetic suite.
const switching = await page.evaluate(async () => {
  const pts = window.__points()
  const geomBefore = pts.map((p) => p.geometry.uuid).join()
  const progBefore = window.__gl.info.programs.length
  const callsBefore = window.__gl.info.render.calls
  const u = pts[0].material.uniforms.uColorMode

  const seen = []
  for (const v of [1, 2, 0]) {
    u.value = v
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
    seen.push({
      mode: v,
      applied: pts.every((p) => p.material.uniforms.uColorMode.value === v),
      points: window.__gl.info.render.points,
    })
  }
  return {
    seen,
    geomStable: pts.map((p) => p.geometry.uuid).join() === geomBefore,
    programsStable: window.__gl.info.programs.length === progBefore,
    programs: window.__gl.info.programs.length,
    callsBefore,
    callsAfter: window.__gl.info.render.calls,
  }
})
check('one write reaches every node, in all three modes',
  switching.seen.every((s) => s.applied),
  switching.seen.map((s) => `mode ${s.mode}: ${s.applied ? 'all' : 'NOT all'}`).join(', '))
check('the cloud keeps rendering in EVERY colour mode',
  switching.seen.every((s) => s.points > 100_000),
  switching.seen.map((s) => `mode ${s.mode}: ${s.points.toLocaleString()} pts`).join(', ') +
    ' -- asserted directly, because a mode that draws nothing is the failure this route keeps having')
check('switching mode allocates no geometry',
  switching.geomStable,
  'every node kept its geometry uuid -- the whole point of putting the mode in a uniform')
check('and compiles no new program',
  switching.programsStable,
  `${switching.programs} program(s) throughout -- a define-per-mode would have recompiled instead`)
check('and does not change the draw-call count',
  Math.abs(switching.callsAfter - switching.callsBefore) <= 2,
  `${switching.callsBefore} -> ${switching.callsAfter} draw calls`)

// --- the picture is actually different ----------------------------------
//
// The uniform being set proves plumbing, not rendering. Reading pixels proves
// the shader branch is reached and produces a different image.
const pixels = await page.evaluate(async () => {
  const pts = window.__points()
  const u = pts[0].material.uniforms.uColorMode
  const canvas = window.__gl.domElement
  const shot = async (v) => {
    u.value = v
    for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r))
    const gl = window.__gl.getContext()
    const w = canvas.width
    const h = canvas.height
    const buf = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
    let r = 0, g = 0, b = 0, lit = 0
    for (let i = 0; i < buf.length; i += 4) {
      if (buf[i] + buf[i + 1] + buf[i + 2] > 24) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; lit++ }
    }
    return lit ? { r: Math.round(r / lit), g: Math.round(g / lit), b: Math.round(b / lit), lit } : { r: 0, g: 0, b: 0, lit: 0 }
  }
  const rgb = await shot(0)
  const cls = await shot(1)
  const hag = await shot(2)
  u.value = 0
  return { rgb, cls, hag }
})
const far = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)
check('all three modes put lit pixels on screen',
  pixels.rgb.lit > 1000 && pixels.cls.lit > 1000 && pixels.hag.lit > 1000,
  `lit pixels: rgb ${pixels.rgb.lit}, class ${pixels.cls.lit}, height ${pixels.hag.lit}`)
check('true colour and class colour are visibly different pictures',
  far(pixels.rgb, pixels.cls) > 20,
  `rgb(${pixels.rgb.r},${pixels.rgb.g},${pixels.rgb.b}) against class(${pixels.cls.r},${pixels.cls.g},${pixels.cls.b}) -- distance ${far(pixels.rgb, pixels.cls)}`)
check('the height mode on a file with no height draws the flat grey it promises',
  Math.abs(pixels.hag.r - pixels.hag.g) < 12 && Math.abs(pixels.hag.g - pixels.hag.b) < 12,
  `height(${pixels.hag.r},${pixels.hag.g},${pixels.hag.b}) -- neutral, because autzen has no hag attribute and the shader says so rather than implying zero height everywhere`)

check('nothing threw', errs.length === 0, errs[0] ?? 'no page errors')
await browser.close()
console.log(`\n  ${res.filter(Boolean).length}/${res.length} passed`)
process.exit(res.every(Boolean) ? 0 : 1)
