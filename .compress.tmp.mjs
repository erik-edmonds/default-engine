import fs from 'fs'; import path from 'path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, textureCompress } from '@gltf-transform/functions'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const ROOT = '/Users/erikedmonds/Repositories/Javascript/avatar'
const OUT = '/private/tmp/claude-501/-Users-erikedmonds-Repositories-Javascript-avatar/b3d8cf12-64e2-4083-b2cd-ce504d1fa953/scratchpad/compressed'
fs.mkdirSync(OUT, { recursive: true })

// Draco is applied by gltf-pipeline (already a dependency, bundles its own
// encoder) rather than by gltf-transform, which would need draco3dgltf added.
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const GLTF_PIPELINE = path.join(ROOT, 'node_modules/.bin/gltf-pipeline')

// Everything the home route reaches that isn't already compressed.
// tea/orange/pickles are already Draco+WebP, so they're left alone.
const TARGETS = [
  ['models/Base/GLB/base.glb', 1024],
  ['models/merged.glb', 2048],
  ['models/Avatars/dragonite.glb', 1024],
  ['models/Avatars/scuba.glb', 1024],
  ['models/palmtree.glb', 1024],
  ['models/charizard.glb', 1024],
  ['models/island_motion.glb', 1024],
  ['models/pokeball.glb', 1024],
  ['models/moon.glb', 1024],
  ['models/gull.glb', 512],
  ['models/green_tree.glb', 512],
  ['models/gear.glb', 512],
  ['models/brown_tree.glb', 512],
  ['models/cluster_tree.glb', 512],
  ['models/seagull.glb', 512],
  ['models/campfire.glb', 512],
  ['models/sun.glb', 512],
  ['models/speaker.glb', 512],
  ['models/guitarra.glb', 512],
  ['models/cloud.glb', 512],
]

const rows = []
for (const [rel, maxTex] of TARGETS) {
  const src = path.join(ROOT, 'public', rel)
  if (!fs.existsSync(src)) { console.log(`SKIP (missing) ${rel}`); continue }
  const before = fs.statSync(src).size
  try {
    const doc = await io.read(src)
    await doc.transform(
      // Accessors ONLY. Deduping materials merged IsleGround.001 into its
      // identical twin -- but gltfjsx looks materials up BY NAME
      // (materials['IsleGround.001']), so the merge left that lookup
      // undefined and three fell back to its default white material. The
      // island rock behind the avatar rendered flat white. Accessors are
      // never referenced by name, so they are safe to merge.
      dedup({ propertyTypes: ['Accessor'] }),
      // prune() is deliberately absent for the same reason: it deleted the
      // node names Lamp, Lamp.001 and Sketchfab_model.003, and stripped
      // TEXCOORD_0 from 166 primitives. Every gltfjsx component in this repo
      // addresses nodes and materials by name, so anything that removes a
      // name is a latent white-mesh bug. It only saved a fully-black emissive
      // texture; not worth the class of failure.
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex] }),
    )
    const stage1 = path.join(OUT, 'stage1-' + path.basename(rel))
    const outPath = path.join(OUT, path.basename(rel))
    await io.write(stage1, doc)
    // Conservative quantization: the defaults are what keep skinned characters
    // from visibly wobbling. Compression level is free at load time.
    execFileSync(GLTF_PIPELINE, ['-i', stage1, '-o', outPath, '-d',
      '--draco.compressionLevel', '7',
      '--draco.quantizePositionBits', '14',
      '--draco.quantizeNormalBits', '10',
      '--draco.quantizeTexcoordBits', '12'], { stdio: 'pipe' })
    fs.unlinkSync(stage1)
    const after = fs.statSync(outPath).size
    rows.push({ rel, before, after })
    console.log(`${String(before).padStart(9)} -> ${String(after).padStart(8)}  (${(100 - after/before*100).toFixed(1)}% off)  ${rel}`)
  } catch (e) {
    console.log(`FAIL ${rel}: ${String(e).slice(0, 200)}`)
  }
}
const b = rows.reduce((s,r) => s + r.before, 0), a = rows.reduce((s,r) => s + r.after, 0)
console.log(`\nTOTAL ${b} -> ${a} bytes  (${(b/1048576).toFixed(1)} MiB -> ${(a/1048576).toFixed(1)} MiB, ${(100-a/b*100).toFixed(1)}% off)`)
