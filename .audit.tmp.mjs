import fs from 'fs'; import { execFileSync } from 'node:child_process'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
const TMP='/private/tmp/claude-501/-Users-erikedmonds-Repositories-Javascript-avatar/b3d8cf12-64e2-4083-b2cd-ce504d1fa953/scratchpad/geo'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() })
const uvs = async (f) => { const r=(await io.read(f)).getRoot(); let n=0,tex=0
  for (const s of r.listScenes()) s.traverse(o=>{const m=o.getMesh(); if(!m)return
    for(const p of m.listPrimitives()){ if(p.getAttribute('TEXCOORD_0'))n++
      const mt=p.getMaterial(); if(mt&&mt.getBaseColorTexture())tex++ }})
  return {uv:n, texturedPrims:tex} }
const LIST = ['models/Base/GLB/base.glb','models/merged.glb','models/island_motion.glb','models/Avatars/dragonite.glb',
 'models/Avatars/scuba.glb','models/palmtree.glb','models/charizard.glb','models/pokeball.glb','models/moon.glb',
 'models/gull.glb','models/green_tree.glb','models/gear.glb','models/brown_tree.glb','models/cluster_tree.glb',
 'models/seagull.glb','models/campfire.glb','models/sun.glb','models/speaker.glb','models/guitarra.glb','models/cloud.glb']
console.log('model                        UV prims (before -> after)   textured prims   VERDICT')
for (const rel of LIST) {
  const base = rel.split('/').pop()
  const o = `${TMP}/aud-${base}`
  try { fs.writeFileSync(o, execFileSync('git',['show',`HEAD:public/${rel}`],{maxBuffer:1<<28})) }
  catch { console.log(`${base.padEnd(22)} (not in git -- base.glb was untracked)`); continue }
  const a = await uvs(o), b = await uvs(`public/${rel}`)
  const broken = b.texturedPrims > 0 && b.uv < a.uv
  console.log(`${base.padEnd(28)} ${String(a.uv).padStart(4)} -> ${String(b.uv).padEnd(6)} ${String(b.texturedPrims).padStart(6)}          ${broken ? '*** BROKEN ***' : (a.uv!==b.uv ? 'uv lost (untextured, harmless)' : 'ok')}`)
}
