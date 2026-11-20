/** Drop the rigs a glTF never shows, then prune what that orphans.
 *
 *  WHY THIS EXISTS, AND WHY IT IS NOT compress-model.mjs:
 *  public/models/phone.glb arrived at 10.02 MB. Its three textures total
 *  **38 KB**, so the texture pass that took vr.glb from 16.12 MB to 265 KB
 *  would have saved nothing measurable here. The weight is geometry --
 *  9.88 MB of accessors -- spread across SIXTEEN sibling rigs of which
 *  exactly one is visible:
 *
 *    Armature        scale 1 1 1   Plane.008   8 prims   45,097 verts
 *    phone2/3/4      scale 0 0 0               8 prims   45,420 verts  each
 *    Armature.001-012 scale 0 0 0              1-11 prims              each
 *
 *  It is a Blender scroll-animation rig: the fifteen collapsed siblings are
 *  revealed by an animation clip this project does not play. Collapsed to
 *  scale 0 they draw nothing and still cost download, parse and GPU upload.
 *
 *  KEEPING IT A SCRIPT RATHER THAN DOING IT IN BLENDER is the point. The
 *  result is reproducible from the untouched original in sources/, the numbers
 *  below are checkable, and the next model that arrives like this needs no
 *  mouse.
 *
 *  ANIMATIONS GO ONLY IF NOTHING KEPT IS ANIMATED, and the script says which
 *  channels it dropped and why. A clip that still drives a kept node is a clip
 *  this cannot safely remove, so it refuses -- unless you pass
 *  --drop-animations, which makes losing it a decision somebody typed rather
 *  than a silent side effect.
 *
 *  For phone.glb that flag is correct and the refusal is the useful part: the
 *  clip's 445 keyframes on the kept rig dolly it from z -0.37 to z -1.81 and
 *  end on **scale 0 0 0**, i.e. the scroll reveal collapses the main phone
 *  too. A turntable that played this would wind the phone away to nothing, so
 *  the clip is dropped and `useAnimations` is left with nothing to play --
 *  which is what Earth.tsx already does with its own empty `actions`.
 *
 *  --simplify <ratio> THEN TAKES THE REMAINING GEOMETRY DOWN. meshoptimizer
 *  is already a dependency and @gltf-transform/functions exports the binding,
 *  so unlike draco this costs no runtime decoder and no CDN fetch -- the
 *  objection compress-model.mjs raises against draco does not apply, because
 *  simplification happens here and ships as ordinary vertices.
 *
 *  `error: 0.001` is the real guard, not the ratio: meshopt stops early rather
 *  than deviate more than 0.1% of the mesh extent, which on a 4.8-unit phone
 *  is about 5 thousandths of a unit. `lockBorder` keeps `purple_screen` (14
 *  verts) and `white` (4 verts) exactly as they are -- the screen is a flat
 *  quad a CanvasTexture is mapped onto, and rewriting it would move the UVs.
 *
 *  Measured on phone.glb: 45,097 verts -> 12,238 at ratio 0.25, 1.75 MB ->
 *  0.56 MB, with all eight materials and both small prims intact.
 *
 *  WRITES A SEPARATE FILE and leaves the input alone, so the two can be
 *  compared rather than the result trusted -- the same rule
 *  compress-model.mjs follows.
 *
 *  Run:  node scripts/trim-model.mjs <in.glb> <out.glb> <KeepNode[,...]>
 *                 [--drop-animations] [--simplify <ratio>]
 *  e.g.  node scripts/trim-model.mjs sources/phone.original.glb \
 *          public/models/phone.glb Armature --drop-animations --simplify 0.25
 */
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { prune, simplify, weld } from "@gltf-transform/functions"
import { MeshoptSimplifier } from "meshoptimizer/simplifier"
import { statSync } from "node:fs"

const args = process.argv.slice(2)
const DROP_ANIMATIONS = args.includes("--drop-animations")
const simplifyAt = args.indexOf("--simplify")
/** Null means "leave the geometry alone", which is the default. */
const SIMPLIFY = simplifyAt === -1 ? null : Number(args[simplifyAt + 1])
/** Relative to the mesh extent, and the reason the ratio above is safe. */
const SIMPLIFY_ERROR = 0.001
const positional = args.filter((a, i) => !a.startsWith("--") && !(simplifyAt !== -1 && i === simplifyAt + 1))
const [IN, OUT, KEEP_ARG] = positional
const KEEP = (KEEP_ARG ?? "").split(",").filter(Boolean)

if (!IN || !OUT || KEEP.length === 0) {
  console.error("usage: node scripts/trim-model.mjs <in.glb> <out.glb> <KeepNode[,...]> [--drop-animations]")
  process.exit(1)
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(IN)
const root = doc.getRoot()
const scene = root.listScenes()[0]

const before = statSync(IN).size
const countAccessorBytes = () =>
  root.listAccessors().reduce((a, x) => a + (x.getArray()?.byteLength ?? 0), 0)

console.log(`\n  ${IN} — ${(before / 1e6).toFixed(2)} MB`)
console.log(`    accessors ${(countAccessorBytes() / 1e6).toFixed(2)} MB · ${root.listMeshes().length} meshes · ${root.listMaterials().length} materials · ${root.listSkins().length} skins · ${root.listAnimations().length} animations`)

// --- 1. Which top-level rigs survive -------------------------------------
const children = scene.listChildren()
const kept = children.filter((n) => KEEP.includes(n.getName()))
const dropped = children.filter((n) => !KEEP.includes(n.getName()))

if (kept.length !== KEEP.length) {
  const found = kept.map((n) => n.getName())
  console.error(`\n  refusing: these names are not scene children -- ${KEEP.filter((k) => !found.includes(k)).join(", ")}`)
  console.error(`  available: ${children.map((n) => n.getName()).join(", ")}`)
  process.exit(1)
}

// Every node in a kept subtree, so the animation check below can tell a
// channel that matters from one that does not.
const keptNodes = new Set()
const collect = (n) => {
  keptNodes.add(n)
  for (const c of n.listChildren()) collect(c)
}
for (const n of kept) collect(n)

console.log(`\n  keeping ${kept.length}: ${kept.map((n) => n.getName()).join(", ")}`)
console.log(`  dropping ${dropped.length}: ${dropped.map((n) => n.getName()).join(", ")}`)

// --- 2. Animations, but only if they touch nothing kept ------------------
for (const anim of root.listAnimations()) {
  const live = anim.listChannels().filter((ch) => keptNodes.has(ch.getTargetNode()))
  if (live.length > 0 && !DROP_ANIMATIONS) {
    console.error(
      `\n  refusing: animation ${JSON.stringify(anim.getName())} still drives ${live.length} kept node(s) -- ` +
        `${[...new Set(live.map((ch) => ch.getTargetNode()?.getName()))].join(", ")}`,
    )
    console.error("  pass --drop-animations to lose it on purpose, trim it in Blender, or widen the keep list.")
    process.exit(1)
  }
  if (live.length > 0) {
    console.log(
      `  dropping animation ${JSON.stringify(anim.getName())} ON PURPOSE (--drop-animations) — ` +
        `${live.length} of its ${anim.listChannels().length} channels drove kept nodes ` +
        `(${[...new Set(live.map((ch) => ch.getTargetNode()?.getName()))].join(", ")})`,
    )
    anim.dispose()
    continue
  }
  console.log(`  dropping animation ${JSON.stringify(anim.getName())} — all ${anim.listChannels().length} channels target dropped rigs`)
  anim.dispose()
}

// --- 3. Detach the dropped rigs, then let prune() take the orphans -------
// `dispose()` on a Node detaches it and its own properties; the meshes,
// accessors, materials and skins it was the only user of become unreachable,
// which is exactly what prune() is for. compress-model.mjs refuses prune()
// because it must preserve the names gltfjsx addresses meshes by -- here
// Phone.tsx is REGENERATED from this output, so there is nothing to preserve.
for (const n of dropped) {
  const subtree = []
  const walk = (x) => {
    subtree.push(x)
    for (const c of x.listChildren()) walk(c)
  }
  walk(n)
  for (const x of subtree.reverse()) x.dispose()
}

await doc.transform(prune())

// --- 3b. Simplify what is left, if asked ---------------------------------
// weld() first: simplification works on shared vertices, and an unwelded
// export has every triangle's corners duplicated, which leaves the simplifier
// nothing it is allowed to collapse.
if (SIMPLIFY !== null) {
  const vertsBefore = root
    .listMeshes()
    .reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getAttribute("POSITION")?.getCount() ?? 0), 0), 0)
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: SIMPLIFY, error: SIMPLIFY_ERROR, lockBorder: true }),
  )
  const vertsAfter = root
    .listMeshes()
    .reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getAttribute("POSITION")?.getCount() ?? 0), 0), 0)
  console.log(`  simplified at ratio ${SIMPLIFY}, error ${SIMPLIFY_ERROR} — ${vertsBefore.toLocaleString()} -> ${vertsAfter.toLocaleString()} vertices`)
}

// --- 4. Report ------------------------------------------------------------
await io.write(OUT, doc)
const after = statSync(OUT).size

console.log(`\n  ${OUT} — ${(after / 1e6).toFixed(2)} MB  (${(100 - (after / before) * 100).toFixed(1)}% smaller)`)
console.log(`    accessors ${(countAccessorBytes() / 1e6).toFixed(2)} MB · ${root.listMeshes().length} meshes · ${root.listMaterials().length} materials · ${root.listSkins().length} skins · ${root.listAnimations().length} animations`)
console.log(`    materials kept: ${root.listMaterials().map((m) => m.getName()).join(", ")}`)
const verts = root
  .listMeshes()
  .reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getAttribute("POSITION")?.getCount() ?? 0), 0), 0)
console.log(`    ${verts.toLocaleString()} vertices across ${root.listMeshes().reduce((a, m) => a + m.listPrimitives().length, 0)} primitives\n`)
