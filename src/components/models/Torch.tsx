import { useEffect, useRef } from 'react'
import type * as THREE from 'three'
import type { ThreeElements } from '@react-three/fiber'
import { useAnimations } from '@react-three/drei'
import { useGLTF } from '@/helpers/useGLTF'

/** Typed the same way Earth.tsx was, and for the same three reasons -- this
 *  is raw gltfjsx output and it arrives with all of them:
 *
 *   - `props` was implicitly any; ThreeElements['group'] is what a <group>
 *     spread actually accepts.
 *   - `useRef()` with no argument is an error under this tsconfig, and the
 *     ref has to be typed for useAnimations to accept it.
 *   - drei's own useGLTF is swapped for the project's helper, which is what
 *     every other model here loads through.
 *
 *  The clip is NOT renamed. gltfjsx emitted `animations[0].name = "Flame"`
 *  so the action could be looked up by a friendly name, and that is a write
 *  to a value returned from a hook -- useGLTF caches one parsed glTF per
 *  URL, so the rename reaches every other user of the same file. It is also
 *  exactly what react-hooks/immutability rejects. The file's own clip is
 *  called "Take 01"; playing it by its real name needs no mutation. */
export function Torch({ lit = true, ...props }: ThreeElements['group'] & { lit?: boolean }) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials, animations } = useGLTF('/models/torch.glb')
  const { actions } = useAnimations(animations, group)

  // Whatever the file's first clip is called, rather than a name of our
  // own. One clip here, "Take 01".
  const clip = animations[0]?.name
  useEffect(() => {
    if (clip) actions[clip]?.reset().play()
  }, [actions, clip])
  return (
    <group ref={group} {...props} dispose={null}>
      {/* THE MODEL'S ORIGIN IS NOT THE TORCH, SO THIS MOVES IT THERE.
          
          Inside the file the torch sits at a local [-3.77, -6.58, -0.35]
          with a 1.65 scale on top -- the group's origin is several units
          away from the thing you see. That makes `position` on this
          component a lie, and worse, a lie that changes with `scale`:
          measured, going from 0.17 to 0.6 slid every torch up to 4.4 world
          units off its island.
          
          Cancelling it here means the component's origin is the foot of the
          torch, so a site position puts the torch there at any scale. The
          numbers are the measured offset divided back out of the scale it
          was measured at. */}
      <group position={TORCH_ORIGIN_FIX}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
          <group name="Root">
            {/* ONLY THE TORCH AND ITS FLAME.
                
                torch.glb is a multi-character asset: it also carries Lady,
                Monk, Peasant, Knight, imp and Baba Yaga armatures, parked
                out at x -36 to -46 where gltfjsx dutifully reproduced them.
                Rendering the whole file put six skinned figures forty units
                off the side of every island. */}
            <group
              name="torch"
              position={[-3.766, -6.575, -0.351]}
              rotation={[-0.167, 0.132, -0.108]}
              scale={1.65}>
              <mesh
                name="torch_0"
                castShadow
                receiveShadow
                geometry={nodes.torch_0.geometry}
                material={materials.Metal_1_mat}
              />
            </group>
            {/* The flame, hidden by day. Its own group so the metal stays
                visible when the fire is out -- an unlit torch is still a
                torch, which is the same reasoning behind the campfire's
                lit/dead model pair. */}
            <group visible={lit}>
              <group name="fire" position={[-3.494, -6.245, 1.506]} scale={[0.556, 0.556, 0.929]}>
                <mesh
                  name="fire_0"
                  castShadow
                  receiveShadow
                  geometry={nodes.fire_0.geometry}
                  material={materials.fire_mat}
                  morphTargetDictionary={nodes.fire_0.morphTargetDictionary}
                  morphTargetInfluences={nodes.fire_0.morphTargetInfluences}
                />
              </group>
              <group
                name="fire006"
                position={[-3.552, -6.233, 1.364]}
                rotation={[0.146, 0.196, -0.061]}
                scale={[0.489, 0.489, 0.817]}>
                <mesh
                  name="fire006_0"
                  castShadow
                  receiveShadow
                  geometry={nodes.fire006_0.geometry}
                  material={materials.fire_mat}
                  morphTargetDictionary={nodes.fire006_0.morphTargetDictionary}
                  morphTargetInfluences={nodes.fire006_0.morphTargetInfluences}
                />
              </group>
            </group>
          </group>
        </group>
      </group>
      </group>
    </group>
  )
}

/** Shifts the model so its own origin lands on the foot of the torch.
 *
 *  COMPOSED FROM THE FILE, NOT INFERRED FROM TWO SAMPLES. The first attempt
 *  estimated this by placing a torch twice at different scales and dividing
 *  out the difference; it got the z roughly right and the x wrong by three
 *  units, which left a torch hanging off the side of its island.
 *
 *  These come from walking the same transform chain the JSX builds -- the
 *  -90 degree X rotation on `Sketchfab_model`, then the torch group's
 *  [-3.766, -6.575, -0.351] with its 1.65 scale -- against the mesh's own
 *  accessor bounds. That puts the torch's bounding box centre at
 *  [-3.628, 0.700, 6.405] with its base at y -0.455, so these are the
 *  negation: x and z centre it on the origin, y stands it on the ground. */
const TORCH_ORIGIN_FIX: [number, number, number] = [3.628, 0.455, -6.405]

useGLTF.preload('/models/torch.glb')
