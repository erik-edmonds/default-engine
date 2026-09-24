import { useGLTF } from "@/helpers/useGLTF"

/** The Dragonite as a flat cardboard cutout, for the paper sky.
 *
 *  The sky's subject is this rather than the 3D Dragonite: everything else up
 *  there is a paper cutout on a string, and a fully shaded character standing
 *  among them reads as belonging to a different world.
 *
 *  Its material is unnamed in the file, so there is no `materials.X` to reach
 *  it by -- r3f keys that record by material name and an unnamed one lands
 *  under "". It comes off the node instead, exactly as CardboardStar does.
 *
 *  The repo's useGLTF, not drei's, for the same reason every other model here
 *  uses it: the shared cache and the typing that lets `nodes.mesh_0.geometry`
 *  resolve. Imported from drei this file did not compile. */
export function CardboardDragonite(props: React.ComponentProps<"group">) {
  const { nodes } = useGLTF("/models/cardboard_dragonite.glb")
  return (
    <group {...props} dispose={null}>
      <mesh castShadow receiveShadow geometry={nodes.mesh_0.geometry} material={nodes.mesh_0.material} />
    </group>
  )
}

useGLTF.preload("/models/cardboard_dragonite.glb")
