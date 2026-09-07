import fs from 'fs'; import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
const TMP='/private/tmp/claude-501/-Users-erikedmonds-Repositories-Javascript-avatar/b3d8cf12-64e2-4083-b2cd-ce504d1fa953/scratchpad/geo'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })
const names = async (f) => {
  const r = (await io.read(f)).getRoot()
  return { mats: r.listMaterials().map(m=>m.getName()||'(unnamed)'),
           nodes: r.listNodes().map(n=>n.getName()||'(unnamed)') }
}
fs.writeFileSync(`${TMP}/m.o.glb`, execFileSync('git',['show','HEAD:public/models/merged.glb'],{maxBuffer:1<<28}))
const o = await names(`${TMP}/m.o.glb`), c = await names('public/models/merged.glb')
const lostM = o.mats.filter(n => !c.mats.includes(n))
const lostN = o.nodes.filter(n => !c.nodes.includes(n))
console.log(`materials ${o.mats.length} -> ${c.mats.length}`)
console.log('MATERIAL NAMES LOST:', lostM.length ? lostM.join(', ') : 'none')
console.log(`nodes ${o.nodes.length} -> ${c.nodes.length}`)
console.log('NODE NAMES LOST:', lostN.length ? lostN.slice(0,30).join(', ') : 'none')
