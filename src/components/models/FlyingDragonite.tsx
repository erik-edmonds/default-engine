import { useGLTF } from "@/helpers/useGLTF"

/** The Dragonite in flight.
 *
 *  Not mounted anywhere yet -- added alongside the models it will be used with.
 *
 *  The repo's useGLTF rather than drei's, for the same reason every other model
 *  here uses it: the shared cache, and the typing that lets `nodes.Mesh_0`
 *  resolve. Imported straight from drei this file did not compile, which breaks
 *  `next build` for the whole app since tsc runs inside it. */
export function FlyingDragonite(props: React.ComponentProps<"group">) {
  const { nodes, materials } = useGLTF("/models/flying_dragonite.glb")
  return (
    <group {...props} dispose={null}>
      <mesh castShadow receiveShadow geometry={nodes.Mesh_0.geometry} material={materials.Material_0} />
    </group>
  )
}

useGLTF.preload("/models/flying_dragonite.glb")
