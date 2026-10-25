/** Shrink a glTF by recompressing its textures.
 *
 *  WHY THIS EXISTS: public/models/vr.glb arrived at 16.12 MB, of which
 *  12.91 MB is uncompressed PNG across six images (one of them 6.42 MB), on
 *  80,568 triangles. It loads on every island visit, and it is larger than
 *  everything detaching the water scene saved. The thing it is used for is a
 *  prop seen through a 512-square portal.
 *
 *  TEXTURES ONLY -- NO DRACO, DELIBERATELY. Textures are ~80% of the file, so
 *  they are where the win is. Draco would take the remaining geometry down
 *  too, but `src/helpers/useGLTF.ts` calls drei's `useGLTF(path)` with no
 *  draco argument, so drei would wire its default decoder -- fetched from a
 *  Google CDN at runtime. This project deliberately avoids runtime CDN
 *  fetches for assets (see the note on <Environment preset> in
 *  app/not-found.tsx). Adding one to save ~2 MB is a bad trade; meshopt,
 *  whose decoder three bundles, is the option to reach for next if this is
 *  not enough.
 *
 *  WEBP, NOT KTX2. KTX2 is the better format -- GPU-resident, so it saves
 *  video memory and not merely download -- but it needs a toktx binary this
 *  machine does not have. WebP needs only `sharp`, which is already present,
 *  and three's GLTFLoader reads EXT_texture_webp natively. Revisit if VRAM
 *  ever becomes the constraint rather than bytes on the wire.
 *
 *  WRITES A SEPARATE FILE and leaves the original alone, so the two can be
 *  compared rather than the result trusted.
 *
 *  Run:  node scripts/compress-model.mjs [in.glb] [out.glb]
 */
import { NodeIO } from "@gltf-transform/core"
import { EXTTextureWebP } from "@gltf-transform/extensions"
import { textureCompress } from "@gltf-transform/functions"
import sharp from "sharp"
import { statSync } from "node:fs"

const IN = process.argv[2] ?? "public/models/vr.glb"
const OUT = process.argv[3] ?? "public/models/vr.compressed.glb"

/** Nothing in this model is seen larger than a few hundred pixels on screen.
 *  4096-square source textures are a straight waste at that size. */
const MAX_TEXTURE = 1024
const QUALITY = 82

const io = new NodeIO().registerExtensions([EXTTextureWebP])
const doc = await io.read(IN)

const before = statSync(IN).size
const textures = doc.getRoot().listTextures()
console.log(`\n  ${IN} — ${(before / 1e6).toFixed(2)} MB`)
for (const t of textures) {
  const img = t.getImage()
  const size = t.getSize()
  console.log(
    `    ${(img?.byteLength ?? 0) / 1e6 >= 0.01 ? ((img?.byteLength ?? 0) / 1e6).toFixed(2) : "<0.01"} MB` +
      `  ${t.getMimeType()}  ${size ? `${size[0]}x${size[1]}` : "?"}  ${t.getName() || "(unnamed)"}`,
  )
}

// TEXTURES ONLY. NO dedup() AND NO prune().
//
// Both were here and both had to come out. They rewrite the node graph --
// prune reported "Removed types... Texture (2), Accessor (1)" -- and a
// gltfjsx component addresses its meshes by NAME (`nodes.defaultMaterial_7`).
// Collapse or rename one and the component throws "Cannot read properties of
// undefined (reading 'geometry')" the moment the portal wakes. Measured: the
// model vanished and the probe caught it.
//
// Anything that changes the graph has to be paired with regenerating the
// component against the output. That is a fine thing to do deliberately; it
// is a bad thing to do as a side effect of making a file smaller.
await doc.transform(
  textureCompress({
    encoder: sharp,
    targetFormat: "webp",
    resize: [MAX_TEXTURE, MAX_TEXTURE],
    quality: QUALITY,
  }),
)

await io.write(OUT, doc)

const after = statSync(OUT).size
console.log(`\n  ${OUT} — ${(after / 1e6).toFixed(2)} MB`)
for (const t of doc.getRoot().listTextures()) {
  const img = t.getImage()
  const size = t.getSize()
  console.log(
    `    ${((img?.byteLength ?? 0) / 1e6).toFixed(2)} MB  ${t.getMimeType()}` +
      `  ${size ? `${size[0]}x${size[1]}` : "?"}`,
  )
}
console.log(
  `\n  ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB` +
    `  (${(100 * (1 - after / before)).toFixed(0)}% smaller)\n`,
)
