import fs from 'fs'; import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
const TMP='/private/tmp/claude-501/-Users-erikedmonds-Repositories-Javascript-avatar/b3d8cf12-64e2-4083-b2cd-ce504d1fa953/scratchpad/geo'
fs.mkdirSync(TMP,{recursive:true})
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })

const profile = async (file) => {
  const r = (await io.read(file)).getRoot()
  const attrs = {}, mats = {}
  for (const s of r.listScenes()) s.traverse(n => {
    const m = n.getMesh(); if (!m) return
    for (const p of m.listPrimitives()) {
      for (const sem of p.listSemantics()) attrs[sem] = (attrs[sem]||0)+1
      const mat = p.getMaterial()
      const name = mat ? (mat.getName()||'(unnamed)') : '(none)'
      if (!mats[name]) mats[name] = { prims:0, base:null, factor:null, slots:[] }
      mats[name].prims++
      if (mat) {
        mats[name].base = !!mat.getBaseColorTexture()
        mats[name].factor = mat.getBaseColorFactor().map(x=>+x.toFixed(3)).join(',')
        mats[name].slots = ['BaseColor','Normal','Emissive','MetallicRoughness','Occlusion']
          .filter(sl => mat[`get${sl}Texture`]?.call(mat))
      }
    }
  })
  return { attrs, mats }
}
for (const rel of ['models/merged.glb','models/island_motion.glb']) {
  const orig = `${TMP}/${rel.split('/').pop()}.o.glb`
  fs.writeFileSync(orig, execFileSync('git',['show',`HEAD:public/${rel}`],{maxBuffer:1<<28}))
  const o = await profile(orig), c = await profile(`public/${rel}`)
  console.log(`\n===== ${rel} =====`)
  console.log('attributes  BEFORE:', JSON.stringify(o.attrs))
  console.log('attributes  AFTER :', JSON.stringify(c.attrs))
  const lostAttrs = Object.keys(o.attrs).filter(k => !c.attrs[k])
  if (lostAttrs.length) console.log('*** LOST ATTRIBUTES:', lostAttrs.join(', '))
  const names = new Set([...Object.keys(o.mats), ...Object.keys(c.mats)])
  for (const n of names) {
    const a = o.mats[n], b = c.mats[n]
    if (!b) { console.log(`  material GONE: ${n}  (was on ${a.prims} prim(s), slots=[${a.slots}])`); continue }
    if (!a) { console.log(`  material NEW: ${n}`); continue }
    if (a.base !== b.base || a.factor !== b.factor || a.slots.join()!==b.slots.join())
      console.log(`  CHANGED ${n}: baseTex ${a.base}->${b.base}, factor ${a.factor}->${b.factor}, slots [${a.slots}]->[${b.slots}], prims ${a.prims}->${b.prims}`)
  }
}
