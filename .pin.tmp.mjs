import fs from 'fs'; import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
const TMP='/private/tmp/claude-501/-Users-erikedmonds-Repositories-Javascript-avatar/b3d8cf12-64e2-4083-b2cd-ce504d1fa953/scratchpad/geo'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })
const SLOTS = ['BaseColor','Normal','Emissive','MetallicRoughness','Occlusion']
const scan = async (f, label) => {
  const r = (await io.read(f)).getRoot(); const rows = []
  for (const s of r.listScenes()) s.traverse(o => { const m = o.getMesh(); if (!m) return
    for (const p of m.listPrimitives()) {
      const mt = p.getMaterial(); if (!mt) continue
      const slots = SLOTS.filter(sl => mt[`get${sl}Texture`]?.call(mt))
      if (!slots.length) continue
      const tri = (p.getIndices()?p.getIndices().getCount():p.getAttribute('POSITION').getCount())/3
      rows.push({ node:o.getName()||'?', mat:mt.getName()||'?', slots:slots.join('+'), uv:!!p.getAttribute('TEXCOORD_0'), tri:Math.round(tri) })
    } })
  console.log(`\n--- ${label}: ${rows.length} textured primitive(s) ---`)
  for (const r2 of rows) console.log(`  ${r2.uv?'UV ':'NO-UV'}  ${String(r2.tri).padStart(6)} tris  ${r2.mat.padEnd(16)} [${r2.slots}]  node=${r2.node}`)
  return rows
}
const orig = `${TMP}/merged.o.glb`
fs.writeFileSync(orig, execFileSync('git',['show','HEAD:public/models/merged.glb'],{maxBuffer:1<<28}))
const o = await scan(orig, 'merged.glb ORIGINAL')
const c = await scan('public/models/merged.glb', 'merged.glb COMPRESSED')
const broke = c.filter(x => !x.uv)
console.log(`\n>>> textured primitives now missing UVs: ${broke.length}`)
for (const b of broke) console.log(`    ${b.mat} on ${b.node} (${b.tri} tris) -- renders flat baseColorFactor`)
