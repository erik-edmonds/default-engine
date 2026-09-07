import fs from 'fs'; import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
const TMP='/private/tmp/claude-501/-Users-erikedmonds-Repositories-Javascript-avatar/b3d8cf12-64e2-4083-b2cd-ce504d1fa953/scratchpad/geo'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })
const show = async (f, label) => {
  const r = (await io.read(f)).getRoot()
  console.log(`\n${label}: ${r.listTextures().length} texture(s), ${r.listMaterials().length} material(s)`)
  for (const m of r.listMaterials()) {
    const slots = ['BaseColor','Normal','Emissive','MetallicRoughness','Occlusion'].filter(s => m[`get${s}Texture`]?.call(m))
    console.log(`  ${(m.getName()||'?').padEnd(20)} baseFactor=[${m.getBaseColorFactor().map(x=>+x.toFixed(2))}] textures=[${slots}]`)
  }
}
fs.writeFileSync(`${TMP}/im.o.glb`, execFileSync('git',['show','HEAD:public/models/island_motion.glb'],{maxBuffer:1<<28}))
await show(`${TMP}/im.o.glb`, 'island_motion ORIGINAL')
await show('public/models/island_motion.glb', 'island_motion COMPRESSED')
