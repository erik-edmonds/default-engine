import React, { useRef, useEffect, useMemo } from 'react'
import { useAnimations } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import type * as THREE from 'three'
// The project's typed wrapper, not drei's. drei types the graph as
// `nodes: { [name: string]: THREE.Object3D }`, and `geometry` is not on
// Object3D -- so every one of the 114 `nodes.Circle001_0.geometry` reads below
// was a type error. This file was the LAST component in this folder still
// importing useGLTF straight from drei, and it was 117 of the repo's 118
// type errors on its own. See src/helpers/useGLTF.ts.
import { useGLTF } from '@/helpers/useGLTF'

export function Base(props: ThreeElements['group']) {
  const group = useRef<THREE.Group>(null)
  const { nodes, materials, animations } = useGLTF('/models/base.glb')
  // CLONED, NOT RENAMED IN PLACE. `useGLTF` caches per URL and hands every
  // caller the same clip objects, so `animations[0].name = "Circles"` was
  // writing into that shared cache -- harmless only because it happens to
  // rewrite the same string every time. Cloning keeps the rename local, and
  // the memo holds the clip identities steady so useAnimations does not
  // rebuild its mixer on every render.
  const clips = useMemo(() => {
    const copy = animations.map((clip) => clip.clone())
    if (copy[0]) copy[0].name = "Circles"
    return copy
  }, [animations])
  const { actions } = useAnimations(clips, group)
  useEffect(() => {
    actions["Circles"]?.reset().play()
  }, [])
  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]} scale={0.467}>
          <group name="Root">
            <group name="Circle001" position={[0, 0, 0.422]} scale={[0.892, 0.892, 1]}>
              <mesh
                name="Circle001_0"
                castShadow
                receiveShadow
                geometry={nodes.Circle001_0.geometry}>
                <meshStandardMaterial
                  color="#1fb2f5"
                  emissive="#1fb2f5"
                  emissiveIntensity={10}
                  toneMapped={false}/>
              </mesh>
            </group>
            <group name="Circle002" position={[0, 0, 0.422]}>
              <mesh
                name="Circle002_0"
                castShadow
                receiveShadow
                geometry={nodes.Circle002_0.geometry}
                material={materials.EmitTrans}>
                <meshStandardMaterial
                  color="#1fb2f5"
                  emissive="#1fb2f5"
                  emissiveIntensity={10}
                  toneMapped={false}/>
              </mesh>
            </group>
            <group name="Cylinder" position={[0, 0, 0.087]}>
              <mesh
                name="Cylinder_0"
                castShadow
                receiveShadow
                geometry={nodes.Cylinder_0.geometry}
                material={materials.Base}>
                <meshStandardMaterial
                  color="#1fb2f5"
                  emissive="#1fb2f5"
                  emissiveIntensity={10}
                  toneMapped={false}/>
              </mesh>
              <mesh
                name="Cylinder_1"
                castShadow
                receiveShadow
                geometry={nodes.Cylinder_1.geometry}
                material={materials.Emit}>
                <meshStandardMaterial
                  color="#1fb2f5"
                  emissive="#1fb2f5"
                  emissiveIntensity={10}
                  toneMapped={false}/>
              </mesh>
            </group>
            <group
              name="Empty002"
              position={[0, 0, 3.272]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={0.232}>
              <group
                name="star01"
                position={[0, 0, -0.065]}
                rotation={[0, 0, 0.052]}
                scale={0.365}
              />
              <group name="star01002" position={[0, 0, -0.065]} scale={0.365} />
              <group name="Text" position={[0, 0, -0.108]} scale={0.888} />
            </group>
            <group name="Lamp001" position={[4.076, 3.91, 5.904]} rotation={[-0.268, 0.602, 1.931]}>
              <group name="Lamp002" />
            </group>
            <group
              name="LG001"
              position={[0, 2.291, 0.276]}
              rotation={[-0.413, 0, 0]}
              scale={3.939}>
              <group name="Beam001">
                <mesh
                  name="Beam001_0"
                  castShadow
                  receiveShadow
                  geometry={nodes.Beam001_0.geometry}
                  material={materials.Beam}
                />
              </group>
              <mesh
                name="LG001_0"
                castShadow
                receiveShadow
                geometry={nodes.LG001_0.geometry}
                material={materials.Frame}
              />
              <mesh
                name="LG001_1"
                castShadow
                receiveShadow
                geometry={nodes.LG001_1.geometry}
                material={materials.glass}>
                <meshStandardMaterial
                  color="white"
                  emissive="white"
                  emissiveIntensity={7}
                  toneMapped={false}/>
              </mesh>
            </group>
            <group
              name="LG002"
              position={[1.984, -1.145, 0.276]}
              rotation={[0.216, 0.355, -2.133]}
              scale={3.939}>
              <group name="Beam002">
                <mesh
                  name="Beam002_0"
                  castShadow
                  receiveShadow
                  geometry={nodes.Beam002_0.geometry}
                  material={materials.Beam}
                />
              </group>
              <mesh
                name="LG002_0"
                castShadow
                receiveShadow
                geometry={nodes.LG002_0.geometry}
                material={materials.Frame}
              />
              <mesh
                name="LG002_1"
                castShadow
                receiveShadow
                geometry={nodes.LG002_1.geometry}
                material={materials.glass}>
                <meshStandardMaterial
                  color="white"
                  emissive="white"
                  emissiveIntensity={7}
                  toneMapped={false}/>
              </mesh>
            </group>
            <group
              name="LG003"
              position={[-1.984, -1.145, 0.276]}
              rotation={[0.216, -0.355, 2.133]}
              scale={3.939}>
              <group name="Beam003">
                <mesh
                  name="Beam003_0"
                  castShadow
                  receiveShadow
                  geometry={nodes.Beam003_0.geometry}
                  material={materials.Beam}
                />
              </group>
              <mesh
                name="LG003_0"
                castShadow
                receiveShadow
                geometry={nodes.LG003_0.geometry}
                material={materials.Frame}
              />
              <mesh
                name="LG003_1"
                castShadow
                receiveShadow
                geometry={nodes.LG003_1.geometry}
                material={materials.glass}>
                <meshStandardMaterial
                  color="white"
                  emissive="white"
                  emissiveIntensity={7}
                  toneMapped={false}/>
              </mesh>
            </group>
            <group
              name="particle000"
              position={[0.063, 0.495, 1.256]}
              rotation={[1.128, 0.481, -1.618]}
              scale={0.398}>
              <mesh
                name="particle000_0"
                castShadow
                receiveShadow
                geometry={nodes.particle000_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle001"
              position={[0.385, 0.489, 1.38]}
              rotation={[0.382, 0.419, 0.948]}
              scale={0.382}>
              <mesh
                name="particle001_0"
                castShadow
                receiveShadow
                geometry={nodes.particle001_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle002"
              position={[-0.64, -0.162, 1.544]}
              rotation={[0.078, 0.579, -2.823]}
              scale={0.366}>
              <mesh
                name="particle002_0"
                castShadow
                receiveShadow
                geometry={nodes.particle002_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle003"
              position={[-0.17, -0.42, 1.203]}
              rotation={[-1.855, -0.693, -1.935]}
              scale={0.35}>
              <mesh
                name="particle003_0"
                castShadow
                receiveShadow
                geometry={nodes.particle003_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle004"
              position={[0.174, 0.785, 1.864]}
              rotation={[1.114, 1.122, -1.469]}
              scale={0.335}>
              <mesh
                name="particle004_0"
                castShadow
                receiveShadow
                geometry={nodes.particle004_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle005"
              position={[-0.252, -0.164, 0.94]}
              rotation={[-0.051, -0.16, 1.271]}
              scale={0.319}>
              <mesh
                name="particle005_0"
                castShadow
                receiveShadow
                geometry={nodes.particle005_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle006"
              position={[-0.406, -0.35, 1.323]}
              rotation={[-1.092, 0.115, -1.484]}
              scale={0.303}>
              <mesh
                name="particle006_0"
                castShadow
                receiveShadow
                geometry={nodes.particle006_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle007"
              position={[-0.801, -0.389, 2.045]}
              rotation={[0.716, -0.079, -2.169]}
              scale={0.287}>
              <mesh
                name="particle007_0"
                castShadow
                receiveShadow
                geometry={nodes.particle007_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle008"
              position={[0.528, 0.439, 1.564]}
              rotation={[1.124, 1.011, -0.691]}
              scale={0.271}>
              <mesh
                name="particle008_0"
                castShadow
                receiveShadow
                geometry={nodes.particle008_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle009"
              position={[0.05, 0.602, 1.46]}
              rotation={[-0.918, -0.38, 2.679]}
              scale={0.255}>
              <mesh
                name="particle009_0"
                castShadow
                receiveShadow
                geometry={nodes.particle009_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle010"
              position={[-0.65, -0.701, 2.074]}
              rotation={[2.096, 1.209, 0.861]}
              scale={0.239}>
              <mesh
                name="particle010_0"
                castShadow
                receiveShadow
                geometry={nodes.particle010_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle011"
              position={[-0.363, -0.769, 1.949]}
              rotation={[0.693, -0.442, -1.612]}
              scale={0.223}>
              <mesh
                name="particle011_0"
                castShadow
                receiveShadow
                geometry={nodes.particle011_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle012"
              position={[0.479, -0.674, 1.942]}
              rotation={[2.566, -1.013, 2.27]}
              scale={0.207}>
              <mesh
                name="particle012_0"
                castShadow
                receiveShadow
                geometry={nodes.particle012_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle013"
              position={[-0.096, 0.772, 1.786]}
              rotation={[1.343, -0.901, -1.708]}
              scale={0.191}>
              <mesh
                name="particle013_0"
                castShadow
                receiveShadow
                geometry={nodes.particle013_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle014"
              position={[0.405, -0.061, 1.055]}
              rotation={[-0.148, 0.653, 0.13]}
              scale={0.175}>
              <mesh
                name="particle014_0"
                castShadow
                receiveShadow
                geometry={nodes.particle014_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle015"
              position={[-0.44, -0.738, 1.984]}
              rotation={[-0.688, 0.319, 1.965]}
              scale={0.159}>
              <mesh
                name="particle015_0"
                castShadow
                receiveShadow
                geometry={nodes.particle015_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle016"
              position={[-0.478, 0.333, 1.399]}
              rotation={[-0.303, -1.206, 2.664]}
              scale={0.143}>
              <mesh
                name="particle016_0"
                castShadow
                receiveShadow
                geometry={nodes.particle016_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle017"
              position={[0.664, 0.293, 1.728]}
              rotation={[-1.606, 0.303, 2.539]}
              scale={0.127}>
              <mesh
                name="particle017_0"
                castShadow
                receiveShadow
                geometry={nodes.particle017_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle018"
              position={[-0.071, 0.39, 1.039]}
              rotation={[-0.631, 0.559, 2.363]}
              scale={0.112}>
              <mesh
                name="particle018_0"
                castShadow
                receiveShadow
                geometry={nodes.particle018_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle019"
              position={[-0.108, -0.401, 1.099]}
              rotation={[-0.101, 0.298, -3.089]}
              scale={0.096}>
              <mesh
                name="particle019_0"
                castShadow
                receiveShadow
                geometry={nodes.particle019_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle020"
              position={[-0.547, 0.695, 2.012]}
              rotation={[2.233, -0.741, 2.801]}
              scale={0.08}>
              <mesh
                name="particle020_0"
                castShadow
                receiveShadow
                geometry={nodes.particle020_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle021"
              position={[-0.964, -0.058, 2.105]}
              rotation={[0.875, -0.553, -1.588]}
              scale={0.064}>
              <mesh
                name="particle021_0"
                castShadow
                receiveShadow
                geometry={nodes.particle021_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle022"
              position={[-0.132, -0.848, 1.968]}
              rotation={[-1.52, 1.368, 2.418]}
              scale={0.048}>
              <mesh
                name="particle022_0"
                castShadow
                receiveShadow
                geometry={nodes.particle022_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle023"
              position={[0.623, 0.51, 1.837]}
              rotation={[-0.964, 0.375, 2.093]}
              scale={0.032}>
              <mesh
                name="particle023_0"
                castShadow
                receiveShadow
                geometry={nodes.particle023_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group
              name="particle024"
              position={[-0.136, 0.008, 0.542]}
              rotation={[1.122, 1.174, 2.092]}
              scale={0.016}>
              <mesh
                name="particle024_0"
                castShadow
                receiveShadow
                geometry={nodes.particle024_0.geometry}
                material={materials.EmitCube}
              />
            </group>
            <group name="particle025" position={[-0.444, 0.59, 1.723]} scale={0}>
              <mesh
                name="particle025_0"
                castShadow
                receiveShadow
                geometry={nodes.particle025_0.geometry}
                material={materials.EmitCube}
                position={[2, 0, 0]}
                scale={0}
              />
            </group>
            <group name="particle026" position={[-0.406, -0.009, 1.044]} scale={0}>
              <mesh
                name="particle026_0"
                castShadow
                receiveShadow
                geometry={nodes.particle026_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle027" position={[0.689, -0.659, 2.071]} scale={0}>
              <mesh
                name="particle027_0"
                castShadow
                receiveShadow
                geometry={nodes.particle027_0.geometry}
                material={materials.EmitCube}
                position={[2, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle028" position={[0.849, 0.045, 1.897]} scale={0}>
              <mesh
                name="particle028_0"
                castShadow
                receiveShadow
                geometry={nodes.particle028_0.geometry}
                material={materials.EmitCube}
                position={[-4, 0, -0.125]}
                scale={0}
              />
            </group>
            <group name="particle029" position={[-0.749, -0.175, 1.811]} scale={0}>
              <mesh
                name="particle029_0"
                castShadow
                receiveShadow
                geometry={nodes.particle029_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle030" position={[0.637, 0.634, 1.955]} scale={0}>
              <mesh
                name="particle030_0"
                castShadow
                receiveShadow
                geometry={nodes.particle030_0.geometry}
                material={materials.EmitCube}
                position={[0, -8, 2]}
                scale={0}
              />
            </group>
            <group name="particle031" position={[-0.494, -0.318, 1.442]} scale={0}>
              <mesh
                name="particle031_0"
                castShadow
                receiveShadow
                geometry={nodes.particle031_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle032" position={[-0.723, -0.005, 1.642]} scale={0}>
              <mesh
                name="particle032_0"
                castShadow
                receiveShadow
                geometry={nodes.particle032_0.geometry}
                material={materials.EmitCube}
                position={[-4, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle033" position={[-0.575, -0.106, 1.436]} scale={0}>
              <mesh
                name="particle033_0"
                castShadow
                receiveShadow
                geometry={nodes.particle033_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle034" position={[-0.032, 0.837, 1.868]} scale={0}>
              <mesh
                name="particle034_0"
                castShadow
                receiveShadow
                geometry={nodes.particle034_0.geometry}
                material={materials.EmitCube}
                position={[-0.125, 0, 0]}
                scale={0}
              />
            </group>
            <group name="particle035" position={[-0.499, 0.678, 1.938]} scale={0}>
              <mesh
                name="particle035_0"
                castShadow
                receiveShadow
                geometry={nodes.particle035_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, -2]}
                scale={0}
              />
            </group>
            <group name="particle036" position={[0.006, -0.756, 1.685]} scale={0}>
              <mesh
                name="particle036_0"
                castShadow
                receiveShadow
                geometry={nodes.particle036_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle037" position={[-0.197, 0.435, 1.238]} scale={0}>
              <mesh
                name="particle037_0"
                castShadow
                receiveShadow
                geometry={nodes.particle037_0.geometry}
                material={materials.EmitCube}
                position={[0, 0, -2]}
                scale={0}
              />
            </group>
            <group name="particle038" position={[0.339, 0.581, 1.621]} scale={0}>
              <mesh
                name="particle038_0"
                castShadow
                receiveShadow
                geometry={nodes.particle038_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle039" position={[0.387, -0.673, 1.835]} scale={0}>
              <mesh
                name="particle039_0"
                castShadow
                receiveShadow
                geometry={nodes.particle039_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle040" position={[-0.027, -0.521, 1.272]} scale={0}>
              <mesh
                name="particle040_0"
                castShadow
                receiveShadow
                geometry={nodes.particle040_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle041" position={[0.008, 0.571, 1.35]} scale={0}>
              <mesh
                name="particle041_0"
                castShadow
                receiveShadow
                geometry={nodes.particle041_0.geometry}
                material={materials.EmitCube}
                position={[0.031, 4, -2]}
                scale={0}
              />
            </group>
            <group name="particle042" position={[0.487, 0.221, 1.358]} scale={0}>
              <mesh
                name="particle042_0"
                castShadow
                receiveShadow
                geometry={nodes.particle042_0.geometry}
                material={materials.EmitCube}
                position={[2, 4, -1]}
                scale={0}
              />
            </group>
            <group name="particle043" position={[-0.376, 0.04, 0.747]} scale={0}>
              <mesh
                name="particle043_0"
                castShadow
                receiveShadow
                geometry={nodes.particle043_0.geometry}
                material={materials.EmitCube}
                position={[0, 0, -0.125]}
                scale={0}
              />
            </group>
            <group name="particle044" position={[0.562, 0.114, 1.061]} scale={0}>
              <mesh
                name="particle044_0"
                castShadow
                receiveShadow
                geometry={nodes.particle044_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle045" position={[0.965, -0.681, 1.761]} scale={0}>
              <mesh
                name="particle045_0"
                castShadow
                receiveShadow
                geometry={nodes.particle045_0.geometry}
                material={materials.EmitCube}
                position={[4, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle046" position={[0.743, -0.365, 1.264]} scale={0}>
              <mesh
                name="particle046_0"
                castShadow
                receiveShadow
                geometry={nodes.particle046_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle047" position={[0.565, -0.191, 1.014]} scale={0}>
              <mesh
                name="particle047_0"
                castShadow
                receiveShadow
                geometry={nodes.particle047_0.geometry}
                material={materials.EmitCube}
                position={[2, 0, 0]}
                scale={0}
              />
            </group>
            <group name="particle048" position={[-1.185, 0.359, 1.809]} scale={0}>
              <mesh
                name="particle048_0"
                castShadow
                receiveShadow
                geometry={nodes.particle048_0.geometry}
                material={materials.EmitCube}
                position={[-4, 0, -1]}
                scale={0}
              />
            </group>
            <group name="particle049" position={[0.222, -1.208, 2.054]} scale={0}>
              <mesh
                name="particle049_0"
                castShadow
                receiveShadow
                geometry={nodes.particle049_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle050" position={[0.385, -0.627, 1.272]} scale={0}>
              <mesh
                name="particle050_0"
                castShadow
                receiveShadow
                geometry={nodes.particle050_0.geometry}
                material={materials.EmitCube}
                position={[-2, -4, 0]}
                scale={0}
              />
            </group>
            <group name="particle051" position={[-0.044, 1.254, 1.874]} scale={0}>
              <mesh
                name="particle051_0"
                castShadow
                receiveShadow
                geometry={nodes.particle051_0.geometry}
                material={materials.EmitCube}
                position={[-0.125, 0, -8]}
                scale={0}
              />
            </group>
            <group name="particle052" position={[-0.014, 1.308, 2.119]} scale={0}>
              <mesh
                name="particle052_0"
                castShadow
                receiveShadow
                geometry={nodes.particle052_0.geometry}
                material={materials.EmitCube}
                position={[0, 0, -8]}
                scale={0}
              />
            </group>
            <group name="particle053" position={[-0.639, 0.459, 1.432]} scale={0}>
              <mesh
                name="particle053_0"
                castShadow
                receiveShadow
                geometry={nodes.particle053_0.geometry}
                material={materials.EmitCube}
                position={[0, 4, -2]}
                scale={0}
              />
            </group>
            <group name="particle054" position={[0.119, 0.857, 1.616]} scale={0}>
              <mesh
                name="particle054_0"
                castShadow
                receiveShadow
                geometry={nodes.particle054_0.geometry}
                material={materials.EmitCube}
                position={[0.5, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle055" position={[0.455, -0.103, 0.669]} scale={0}>
              <mesh
                name="particle055_0"
                castShadow
                receiveShadow
                geometry={nodes.particle055_0.geometry}
                material={materials.EmitCube}
                position={[2, 0, 0]}
                scale={0}
              />
            </group>
            <group name="particle056" position={[0.644, -1.106, 2.23]} scale={0}>
              <mesh
                name="particle056_0"
                castShadow
                receiveShadow
                geometry={nodes.particle056_0.geometry}
                material={materials.EmitCube}
                position={[2, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle057" position={[0.615, 0.477, 1.511]} scale={0}>
              <mesh
                name="particle057_0"
                castShadow
                receiveShadow
                geometry={nodes.particle057_0.geometry}
                material={materials.EmitCube}
                position={[-2, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle058" position={[-0.924, 0.697, 1.864]} scale={0}>
              <mesh
                name="particle058_0"
                castShadow
                receiveShadow
                geometry={nodes.particle058_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle059" position={[-0.006, -0.786, 1.584]} scale={0}>
              <mesh
                name="particle059_0"
                castShadow
                receiveShadow
                geometry={nodes.particle059_0.geometry}
                material={materials.EmitCube}
                position={[-0.031, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle060" position={[-0.054, -0.249, 0.583]} scale={0}>
              <mesh
                name="particle060_0"
                castShadow
                receiveShadow
                geometry={nodes.particle060_0.geometry}
                material={materials.EmitCube}
                position={[0, 0, 1]}
                scale={0}
              />
            </group>
            <group name="particle061" position={[0.104, -1.025, 1.788]} scale={0}>
              <mesh
                name="particle061_0"
                castShadow
                receiveShadow
                geometry={nodes.particle061_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, 4]}
                scale={0}
              />
            </group>
            <group name="particle062" position={[-0.616, 0.529, 1.614]} scale={0}>
              <mesh
                name="particle062_0"
                castShadow
                receiveShadow
                geometry={nodes.particle062_0.geometry}
                material={materials.EmitCube}
                position={[-2, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle063" position={[-0.836, -0.134, 1.639]} scale={0}>
              <mesh
                name="particle063_0"
                castShadow
                receiveShadow
                geometry={nodes.particle063_0.geometry}
                material={materials.EmitCube}
                position={[-4, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle064" position={[0.532, -0.844, 1.816]} scale={0}>
              <mesh
                name="particle064_0"
                castShadow
                receiveShadow
                geometry={nodes.particle064_0.geometry}
                material={materials.EmitCube}
                position={[2, -8, 0]}
                scale={0}
              />
            </group>
            <group name="particle065" position={[1.106, -0.43, 1.961]} scale={0}>
              <mesh
                name="particle065_0"
                castShadow
                receiveShadow
                geometry={nodes.particle065_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle066" position={[-0.682, -0.373, 1.682]} scale={0}>
              <mesh
                name="particle066_0"
                castShadow
                receiveShadow
                geometry={nodes.particle066_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle067" position={[0.517, 0.043, 0.955]} scale={0}>
              <mesh
                name="particle067_0"
                castShadow
                receiveShadow
                geometry={nodes.particle067_0.geometry}
                material={materials.EmitCube}
                position={[0, 4, -0.125]}
                scale={0}
              />
            </group>
            <group name="particle068" position={[1.143, 0.063, 1.976]} scale={0}>
              <mesh
                name="particle068_0"
                castShadow
                receiveShadow
                geometry={nodes.particle068_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, -0.25]}
                scale={0}
              />
            </group>
            <group name="particle069" position={[0.725, -0.427, 1.824]} scale={0}>
              <mesh
                name="particle069_0"
                castShadow
                receiveShadow
                geometry={nodes.particle069_0.geometry}
                material={materials.EmitCube}
                position={[0, 0, -2]}
                scale={0}
              />
            </group>
            <group name="particle070" position={[-0.597, -3.565, 1.598]} scale={0}>
              <mesh
                name="particle070_0"
                castShadow
                receiveShadow
                geometry={nodes.particle070_0.geometry}
                material={materials.EmitCube}
                position={[-2, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle071" position={[1.207, -1.574, 1.29]} scale={0}>
              <mesh
                name="particle071_0"
                castShadow
                receiveShadow
                geometry={nodes.particle071_0.geometry}
                material={materials.EmitCube}
                position={[4, 4, 0]}
                scale={0}
              />
            </group>
            <group name="particle072" position={[-1.674, -2.906, 1.879]} scale={0}>
              <mesh
                name="particle072_0"
                castShadow
                receiveShadow
                geometry={nodes.particle072_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle073" position={[-1.141, 1.6, 1.025]} scale={0}>
              <mesh
                name="particle073_0"
                castShadow
                receiveShadow
                geometry={nodes.particle073_0.geometry}
                material={materials.EmitCube}
                position={[-4, 4, 0]}
                scale={0}
              />
            </group>
            <group name="particle074" position={[-1.721, -3.45, 2.244]} scale={0}>
              <mesh
                name="particle074_0"
                castShadow
                receiveShadow
                geometry={nodes.particle074_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle075" position={[3.062, -0.277, 1.406]} scale={0}>
              <mesh
                name="particle075_0"
                castShadow
                receiveShadow
                geometry={nodes.particle075_0.geometry}
                material={materials.EmitCube}
                position={[0, 4, 0]}
                scale={0}
              />
            </group>
            <group name="particle076" position={[-1.297, -0.597, 1.006]} scale={0}>
              <mesh
                name="particle076_0"
                castShadow
                receiveShadow
                geometry={nodes.particle076_0.geometry}
                material={materials.EmitCube}
                position={[-4, 4, 0]}
                scale={0}
              />
            </group>
            <group name="particle077" position={[0.417, -1.317, 0.569]} scale={0}>
              <mesh
                name="particle077_0"
                castShadow
                receiveShadow
                geometry={nodes.particle077_0.geometry}
                material={materials.EmitCube}
                position={[2, 2, 8]}
                scale={0}
              />
            </group>
            <group name="particle078" position={[-3.265, 1.086, 1.646]} scale={0}>
              <mesh
                name="particle078_0"
                castShadow
                receiveShadow
                geometry={nodes.particle078_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle079" position={[-1.198, -2.103, 1.536]} scale={0}>
              <mesh
                name="particle079_0"
                castShadow
                receiveShadow
                geometry={nodes.particle079_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, 8]}
                scale={0}
              />
            </group>
            <group name="particle080" position={[1.492, 3.003, 1.889]} scale={0}>
              <mesh
                name="particle080_0"
                castShadow
                receiveShadow
                geometry={nodes.particle080_0.geometry}
                material={materials.EmitCube}
                position={[8, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle081" position={[1.915, 0.741, 1.35]} scale={0}>
              <mesh
                name="particle081_0"
                castShadow
                receiveShadow
                geometry={nodes.particle081_0.geometry}
                material={materials.EmitCube}
                position={[0, 4, 0]}
                scale={0}
              />
            </group>
            <group name="particle082" position={[0.772, -1.118, 0.579]} scale={0}>
              <mesh
                name="particle082_0"
                castShadow
                receiveShadow
                geometry={nodes.particle082_0.geometry}
                material={materials.EmitCube}
                position={[4, 2, 0]}
                scale={0}
              />
            </group>
            <group name="particle083" position={[1.654, 2.812, 1.654]} scale={0}>
              <mesh
                name="particle083_0"
                castShadow
                receiveShadow
                geometry={nodes.particle083_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle084" position={[-0.64, 2.79, 1.75]} scale={0}>
              <mesh
                name="particle084_0"
                castShadow
                receiveShadow
                geometry={nodes.particle084_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle085" position={[2.094, -0.116, 1.401]} scale={0}>
              <mesh
                name="particle085_0"
                castShadow
                receiveShadow
                geometry={nodes.particle085_0.geometry}
                material={materials.EmitCube}
                position={[8, 4, 0.5]}
                scale={0}
              />
            </group>
            <group name="particle086" position={[-0.984, 2.175, 1.629]} scale={0}>
              <mesh
                name="particle086_0"
                castShadow
                receiveShadow
                geometry={nodes.particle086_0.geometry}
                material={materials.EmitCube}
                position={[-4, 8, 0]}
                scale={0}
              />
            </group>
            <group name="particle087" position={[1.582, -1.645, 1.152]} scale={0}>
              <mesh
                name="particle087_0"
                castShadow
                receiveShadow
                geometry={nodes.particle087_0.geometry}
                material={materials.EmitCube}
                position={[8, 0, 8]}
                scale={0}
              />
            </group>
            <group name="particle088" position={[-3.093, -1.452, 2.241]} scale={0}>
              <mesh
                name="particle088_0"
                castShadow
                receiveShadow
                geometry={nodes.particle088_0.geometry}
                material={materials.EmitCube}
                position={[-16, 0, 0]}
                scale={0}
              />
            </group>
            <group name="particle089" position={[-3.336, 0.698, 2.144]} scale={0}>
              <mesh
                name="particle089_0"
                castShadow
                receiveShadow
                geometry={nodes.particle089_0.geometry}
                material={materials.EmitCube}
                position={[0, 0, -2]}
                scale={0}
              />
            </group>
            <group name="particle090" position={[1.551, 2.994, 1.848]} scale={0}>
              <mesh
                name="particle090_0"
                castShadow
                receiveShadow
                geometry={nodes.particle090_0.geometry}
                material={materials.EmitCube}
                position={[0, 8, -16]}
                scale={0}
              />
            </group>
            <group name="particle091" position={[1.386, 1.906, 1.267]} scale={0}>
              <mesh
                name="particle091_0"
                castShadow
                receiveShadow
                geometry={nodes.particle091_0.geometry}
                material={materials.EmitCube}
                position={[0, 0, -8]}
                scale={0}
              />
            </group>
            <group name="particle092" position={[-0.228, 1.818, 1.224]} scale={0}>
              <mesh
                name="particle092_0"
                castShadow
                receiveShadow
                geometry={nodes.particle092_0.geometry}
                material={materials.EmitCube}
                position={[0, 0, -8]}
                scale={0}
              />
            </group>
            <group name="particle093" position={[0.961, 0.661, 0.906]} scale={0}>
              <mesh
                name="particle093_0"
                castShadow
                receiveShadow
                geometry={nodes.particle093_0.geometry}
                material={materials.EmitCube}
                position={[0, 4, 0]}
                scale={0}
              />
            </group>
            <group name="particle094" position={[3.055, 0.395, 2.159]} scale={0}>
              <mesh
                name="particle094_0"
                castShadow
                receiveShadow
                geometry={nodes.particle094_0.geometry}
                material={materials.EmitCube}
                position={[16, 0, 0]}
                scale={0}
              />
            </group>
            <group name="particle095" position={[1.861, 2.388, 1.82]} scale={0}>
              <mesh
                name="particle095_0"
                castShadow
                receiveShadow
                geometry={nodes.particle095_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle096" position={[1.818, -2.132, 1.686]} scale={0}>
              <mesh
                name="particle096_0"
                castShadow
                receiveShadow
                geometry={nodes.particle096_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle097" position={[-1.221, 1.022, 1.259]} scale={0}>
              <mesh
                name="particle097_0"
                castShadow
                receiveShadow
                geometry={nodes.particle097_0.geometry}
                material={materials.EmitCube}
                position={[0, 4, 0]}
                scale={0}
              />
            </group>
            <group name="particle098" position={[-1.59, -0.444, 1.289]} scale={0}>
              <mesh
                name="particle098_0"
                castShadow
                receiveShadow
                geometry={nodes.particle098_0.geometry}
                material={materials.EmitCube}
                scale={0}
              />
            </group>
            <group name="particle099" position={[2.701, 1.206, 1.777]} scale={0}>
              <mesh
                name="particle099_0"
                castShadow
                receiveShadow
                geometry={nodes.particle099_0.geometry}
                material={materials.EmitCube}
                position={[8, 0, 0]}
                scale={0}
              />
            </group>
          </group>
        </group>
        <group name="Cube001" position={[0, 0.018, 0.032]} />
        <group name="Empty" position={[0, 0.018, -0.279]}>
          <group
            name="Letter"
            position={[0, 0, 0.312]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.919}
          />
          <group
            name="Letter005"
            position={[-0.004, -0.016, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.919}
          />
          <group
            name="Letter007"
            position={[0, 0, 0.312]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.919}
          />
        </group>
        <mesh
          name="Letter001_0"
          castShadow
          receiveShadow
          geometry={nodes.Letter001_0.geometry}
          material={materials.Emit}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/models/base.glb')