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

// NOT PRELOADED. This is the sky journey's subject and the journey is parked
// (see the note at the top of config/skyJourney.ts), so the only thing a
// module-scope preload did was fetch six megabytes on every island visit for
// a model that can no longer be reached. useGLTF still fetches it lazily if
// the component is ever rendered again, so re-enabling costs nothing.
// useGLTF.preload("/models/flying_dragonite.glb")
