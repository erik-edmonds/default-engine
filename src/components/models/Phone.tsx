import { useRef } from "react"
import type * as THREE from "three"
import type { ThreeElements } from "@react-three/fiber"
// The project's typed wrapper, not drei's -- see next.config.ts on why
// `nodes.Foo.geometry` off drei's Object3D type was 216 errors and the reason
// `ignoreBuildErrors` had to stay on. Every other gltfjsx component in this
// folder goes through it, and until this file was rewritten it was the one
// that did not: it shipped as raw gltfjsx output with `props` implicitly any
// and `useRef()` called with no argument, and it was **84 of the 84 type
// errors in the repo** -- i.e. `next build` was broken by this file alone.
import { useGLTF } from "@/helpers/useGLTF"

/** The phone, as the one rig the model actually shows.
 *
 *  THIS IS NOT THE FILE GLTFJSX WROTE, and the difference is the whole point.
 *  `public/models/phone.glb` arrived at 10.02 MB holding SIXTEEN sibling rigs
 *  of which fifteen sat at `scale={0}` -- a Blender scroll-reveal whose clip
 *  this project does not play. Collapsed to nothing they still cost download,
 *  parse and GPU upload, and the generated component dutifully rendered all
 *  sixteen.
 *
 *  `scripts/trim-model.mjs` drops them from the untouched original in
 *  `sources/phone.original.glb`, so this is reproducible rather than a file
 *  somebody hand-edited once:
 *
 *    node scripts/trim-model.mjs sources/phone.original.glb \
 *      public/models/phone.glb Armature --drop-animations --simplify 0.25
 *
 *    10.02 MB -> 0.57 MB   (94.4% smaller)
 *    45,097 -> 12,238 vertices, 8 primitives, all 8 materials intact
 *
 *  NO `useAnimations`, DELIBERATELY. The trimmed file has no clips, because
 *  the one it had ended on `scale 0 0 0` for this very rig -- the reveal wound
 *  the phone away to nothing at the end of its 445 keyframes. A turntable that
 *  played it would make the phone vanish. `Earth.tsx` keeps an `actions` it
 *  never uses; there is no reason to keep the import here at all.
 *
 *  ONE NAME CHANGED when the siblings went. The bone was `Bone_9` in the
 *  generated file -- three had disambiguated it against the other fifteen
 *  `Bone`s -- and is simply `Bone` now. It is also an empty `Object3D` with no
 *  skin attached to anything (the trim reported 16 skins pruned to 0), so it
 *  is not rendered here. That is the trap a regenerated gltfjsx file would
 *  reintroduce.
 */

/** The lens and screen meshes, by the name three gives them.
 *
 *  Exported so the string lives in one place: `PhoneInterior` needs the lens
 *  to emanate a camera frustum from, and the screen to paint frames onto, and
 *  both are found with `getObjectByName` AFTER the Box3 auto-fit has moved and
 *  scaled the model -- so their positions cannot be constants here.
 *
 *  Measured, for reference, in the trimmed file's own units: the screen is a
 *  flat 14-vertex quad at a constant z of +0.092, and the lens cluster spans
 *  z -0.148..+0.083 at the top right. They face OPPOSITE WAYS -- screen front,
 *  camera back -- which is why the interior turns the phone rather than
 *  parking it: there is no single angle that shows both. */
export const PHONE_SCREEN_MESH = "Plane008_7"
export const PHONE_LENS_MESH = "Plane008_6"

export function Phone({
  screenMaterial,
  ...props
}: ThreeElements["group"] & {
  /** Replaces the screen's own material.
   *
   *  A PROP RATHER THAN A MUTATION OF `materials.purple_screen`. drei caches
   *  one parsed glTF per URL and hands every caller the same material
   *  instances, so assigning a map onto that object would reach every other
   *  user of this model -- and the stock asset ships a 450x338 PowerPoint
   *  template as its base colour, which is exactly the thing we are replacing.
   *  Overriding at the mesh keeps the cache clean. */
  screenMaterial?: THREE.Material
}) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials } = useGLTF("/models/phone.glb")

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene">
        <group name="Armature" position={[0.095, 0, -0.373]}>
          <group name="Plane008" position={[0.005, 2.397, 0.003]}>
            <mesh
              name="Plane008_1"
              castShadow
              receiveShadow
              geometry={nodes.Plane008_1.geometry}
              material={materials["Color 1"]}
            />
            <mesh
              name="Plane008_2"
              castShadow
              receiveShadow
              geometry={nodes.Plane008_2.geometry}
              material={materials.Black}
            />
            <mesh
              name="Plane008_3"
              castShadow
              receiveShadow
              geometry={nodes.Plane008_3.geometry}
              material={materials["Color 2"]}
            />
            <mesh
              name="Plane008_4"
              castShadow
              receiveShadow
              geometry={nodes.Plane008_4.geometry}
              material={materials["Black 3"]}
            />
            <mesh
              name="Plane008_5"
              castShadow
              receiveShadow
              geometry={nodes.Plane008_5.geometry}
              material={materials["Black 2"]}
            />
            <mesh
              name={PHONE_LENS_MESH}
              castShadow
              receiveShadow
              geometry={nodes.Plane008_6.geometry}
              material={materials["Camera Lens"]}
            />
            <mesh
              name={PHONE_SCREEN_MESH}
              castShadow
              receiveShadow
              geometry={nodes.Plane008_7.geometry}
              material={screenMaterial ?? materials.purple_screen}
            />
            <mesh
              name="Plane008_8"
              castShadow
              receiveShadow
              geometry={nodes.Plane008_8.geometry}
              material={materials.white}
            />
          </group>
        </group>
      </group>
    </group>
  )
}

// NOT PRELOADED AT MODULE SCOPE, unlike every other model in this folder.
//
// `WaterInterior.tsx` documents the trap: a module-scope `useGLTF.preload`
// fires the moment anything imports the file, so a preload here would pull
// 0.57 MB into the island's first paint for a prop that lives behind a portal
// nobody has opened. `PhoneInterior` is reached through `React.lazy`, and the
// fetch should start with it.
