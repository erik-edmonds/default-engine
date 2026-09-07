import fs from 'fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })
const SLOTS = ['BaseColor','Normal','Emissive','MetallicRoughness','Occlusion']
const walk = (d, out=[]) => { for (const e of fs.readdirSync(d,{withFileTypes:true})) {
  const p = `${d}/${e.name}`; e.isDirectory() ? walk(p,out) : (p.endsWith('.glb') && out.push(p)) } return out }
let bad = 0
for (const f of walk('public/models')) {
  try {
    const r = (await io.read(f)).getRoot()
    for (const s of r.listScenes()) s.traverse(o => { const m = o.getMesh(); if (!m) return
      for (const p of m.listPrimitives()) {
        const mt = p.getMaterial(); if (!mt) continue
        const slots = SLOTS.filter(sl => mt[`get${sl}Texture`]?.call(mt))
        if (slots.length && !p.getAttribute('TEXCOORD_0')) {
          bad++
          console.log(`*** ${f}  node=${o.getName()||'?'} mat=${mt.getName()||'?'} textures=[${slots}] -- NO UVs, will render flat`)
        }
      } })
  } catch (e) { console.log(`(skip ${f}: ${String(e).slice(0,60)})`) }
}
console.log(bad ? `\n${bad} broken primitive(s)` : '\nNo primitive has a texture without UVs -- textures are not the cause.')
