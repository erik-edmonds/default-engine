import React, { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function Merged(props) {
  const group = useRef()
  const { nodes, materials } = useGLTF('/models/merged.glb')
  const { animations } = useGLTF('/models/island_motion.glb')
  animations[0].name = "Shark"
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    actions["Shark"]?.reset().play()
  }, [])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene">
        {/* No rotation here (gltfjsx originally emitted [Math.PI/2, 0, 0],
            Armature's own rest-pose quaternion from merged.glb). The shark's
            swim-path animation comes from a *separate* file
            (island_motion.glb) applied via useAnimations by matching node
            names -- "Circle001" is the one bone name shared by both files,
            so it's the only track that actually binds (every other bone
            name differs by a numeric suffix between the two exports and
            silently fails to bind, per the "No target node found" warnings
            in the console). That static X rotation was composing with
            Circle001's own animated rotation and tipping the whole orbit
            into a vertical loop (shark rising high above the island and
            diving well below it) instead of a flat circle at a fixed depth.
            Removing it keeps the animated circle level, under the water. */}
        <group name="Armature" scale={0.025}>
          <group name="Shark">
            <skinnedMesh
              name="Mesh008"
              geometry={nodes.Mesh008.geometry}
              material={materials['10 - Default']}
              skeleton={nodes.Mesh008.skeleton}
            />
            <skinnedMesh
              name="Mesh008_1"
              geometry={nodes.Mesh008_1.geometry}
              material={materials['11 - Default']}
              skeleton={nodes.Mesh008_1.skeleton}
            />
            <skinnedMesh
              name="Mesh008_2"
              geometry={nodes.Mesh008_2.geometry}
              material={materials['06 - Default']}
              skeleton={nodes.Mesh008_2.skeleton}
            />
          </group>
          <primitive object={nodes.Circle001} />
          <primitive object={nodes.SheKPelvis} />
          <primitive object={nodes.SheKLLegPlatform} />
          <primitive object={nodes.SheKRLegPlatform} />
        </group>
        <mesh
          name="Island"
          castShadow
          receiveShadow
          geometry={nodes.Island.geometry}
          material={materials['01 - Default']}
          scale={0.025}
        />
        <mesh
          name="CoCoNut003"
          castShadow
          receiveShadow
          geometry={nodes.CoCoNut003.geometry}
          material={materials['05 - Default']}
          position={[0.944, 1.287, -0.012]}
          scale={0.01}
        />
        <mesh
          name="CoCoNut002"
          castShadow
          receiveShadow
          geometry={nodes.CoCoNut002.geometry}
          material={materials['05 - Default']}
          position={[0.209, 1.354, -0.978]}
          scale={0.01}
        />
        <mesh
          name="New_Water"
          castShadow
          receiveShadow
          geometry={nodes.New_Water.geometry}
          material={materials['04 - Default']}
          position={[-0.162, 0.687, 0.064]}
          scale={0.028}
        />
        <group
          name="Dock"
          position={[-1.824, 0.876, 0.415]}
          rotation={[Math.PI / 2, 0, Math.PI / 2]}
          scale={[0.025, 0.033, 0.025]}>
          <mesh
            name="Mesh003"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh003_1"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_1.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh003_2"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_2.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh003_3"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_3.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh003_4"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_4.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh003_5"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_5.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh003_6"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_6.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_7"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_7.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_8"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_8.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_9"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_9.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_10"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_10.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_11"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_11.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_12"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_12.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_13"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_13.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_14"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_14.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_15"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_15.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_16"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_16.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_17"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_17.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_18"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_18.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_19"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_19.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_20"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_20.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_21"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_21.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_22"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_22.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_23"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_23.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_24"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_24.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_25"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_25.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_26"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_26.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_27"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_27.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_28"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_28.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_29"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_29.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_30"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_30.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_31"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_31.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_32"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_32.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_33"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_33.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_34"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_34.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_35"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_35.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_36"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_36.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_37"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_37.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_38"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_38.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_39"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_39.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_40"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_40.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_41"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_41.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_42"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_42.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_43"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_43.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_44"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_44.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_45"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_45.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_46"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_46.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_47"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_47.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_48"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_48.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_49"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_49.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_50"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_50.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_51"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_51.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_52"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_52.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_53"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_53.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_54"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_54.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_55"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_55.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_56"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_56.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_57"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_57.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_58"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_58.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_59"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_59.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_60"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_60.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh003_61"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_61.geometry}
            material={materials['08 - Default']}
          />
        </group>
        <mesh
          name="CoCoNut001"
          castShadow
          receiveShadow
          geometry={nodes.CoCoNut001.geometry}
          material={materials['05 - Default']}
          position={[0.114, 1.348, -0.925]}
          scale={0.01}
        />
        <group
          name="Tree3"
          position={[0.999, 1.216, -0.112]}
          rotation={[0, -Math.PI / 9, 0]}
          scale={[0.004, 0.061, 0.004]}>
          <mesh
            name="Mesh002"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh002_1"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_1.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh002_2"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_2.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh002_3"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_3.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_4"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_4.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_5"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_5.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_6"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_6.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_7"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_7.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_8"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_8.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_9"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_9.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_10"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_10.geometry}
            material={materials['03 - Default']}
          />
        </group>
        <group
          name="Shack"
          position={[-0.037, 1.09, 0.707]}
          rotation={[0, -1.134, 0]}
          scale={0.031}>
          <mesh
            name="Mesh007"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh007_1"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_1.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_2"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_2.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_3"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_3.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_4"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_4.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_5"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_5.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_6"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_6.geometry}
            material={materials['08 - Default']}
          />
        </group>
        <group
          name="Tree2"
          position={[0.035, 1.281, -0.982]}
          rotation={[0, -0.96, 0]}
          scale={[0.004, 0.053, 0.004]}>
          <mesh
            name="Mesh001"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh001_1"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_1.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_2"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_2.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_3"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_3.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_4"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_4.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_5"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_5.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_6"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_6.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_7"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_7.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_8"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_8.geometry}
            material={materials['03 - Default']}
          />
        </group>
        <group
          name="Sketchfab_model"
          position={[7.324, 5.463, -2.3]}
          rotation={[-Math.PI / 2, 0, -1.426]}
          scale={0.376}>
          <group name="root">
            <group name="GLTF_SceneRootNode" rotation={[Math.PI / 2, 0, 0]}>
              <group
                name="BigTree_8"
                position={[-12.046, -8.677, 6.498]}
                rotation={[Math.PI, -1.112, Math.PI]}
                scale={0.146}>
                <group name="BigTreeLeafs_7" position={[11.837, 16.753, 1.752]} scale={6.837}>
                  <mesh
                    name="Object_26"
                    castShadow
                    receiveShadow
                    geometry={nodes.Object_26.geometry}
                    material={materials.TreeGreen}
                  />
                </group>
                <mesh
                  name="Object_24"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_24.geometry}
                  material={materials.TreeBrownPlus}
                />
              </group>
              <group name="Clouds_26" position={[-1.936, 8.104, -1.123]} scale={0.781} />
              <group name="Icosphere001_12" position={[0.382, 1.882, 1.249]} scale={0.309}>
                <mesh
                  name="Object_33"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_33.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_34"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_34.geometry}
                  material={materials['Material.004']}
                />
              </group>
              <group
                name="Icosphere002_13"
                position={[-8.801, -9.255, 7.355]}
                rotation={[0, 0.408, 0]}>
                <mesh
                  name="Object_36"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_36.geometry}
                  material={materials.IsleGround}
                />
                <mesh
                  name="Object_37"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_37.geometry}
                  material={materials.IsleGreen}
                />
              </group>
              <group
                name="Icosphere003_14"
                position={[5.84, -6.843, -5.808]}
                rotation={[-0.57, -0.314, -0.153]}>
                <mesh
                  name="Object_39"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_39.geometry}
                  material={materials.IsleGround}
                  position={[13.913, -4.131, 5.916]}
                />
                <mesh
                  name="Object_40"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_40.geometry}
                  material={materials.IsleGreen}
                  position={[13.913, -4.131, 5.916]}
                />
              </group>
              <group
                name="Icosphere004_15"
                position={[-1.107, -8.299, -6.856]}
                rotation={[0.104, -0.028, 0.393]}>
                <mesh
                  name="Object_42"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_42.geometry}
                  material={materials['IsleGround.001']}
                  position={[9.511, -2.713, 10.598]}
                />
              </group>
              <group name="Icosphere_27" scale={10}>
                <mesh
                  name="Object_75"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_75.geometry}
                  material={materials.IcoSphere_Material}
                />
              </group>
              <group name="Plane001_0" position={[-0.461, 0, 0]} scale={8.295}>
                <mesh
                  name="Object_4"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_4.geometry}
                  material={materials.Water_Material}
                />
              </group>
              <group
                name="Plane003_1"
                position={[-2.881, 1.609, -6.945]}
                rotation={[0.083, -0.03, 0.138]}
                scale={0.179}>
                <mesh
                  name="Object_6"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_6.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_7"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_7.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Plane004_2"
                position={[-3.436, 1.402, -6.611]}
                rotation={[0.037, -0.007, 0.077]}
                scale={0.165}>
                <mesh
                  name="Object_10"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_10.geometry}
                  material={materials['Material.006']}
                />
                <mesh
                  name="Object_9"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_9.geometry}
                  material={materials['Material.005']}
                />
              </group>
              <group
                name="Plane005_3"
                position={[-4.416, 0.958, -6.056]}
                rotation={[-0.05, 0.046, -0.039]}
                scale={0.199}>
                <mesh
                  name="Object_12"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_12.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_13"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_13.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Plane006_4"
                position={[-2.954, 0.74, -4.519]}
                rotation={[0.016, 0.032, -0.12]}
                scale={0.181}>
                <mesh
                  name="Object_15"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_15.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_16"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_16.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Plane007_5"
                position={[-7.019, 1.161, 2.91]}
                rotation={[-0.018, 0.06, 0.048]}
                scale={0.106}>
                <mesh
                  name="Object_18"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_18.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_19"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_19.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Plane008_6"
                position={[6.741, 1.416, -2.277]}
                rotation={[0.137, 0.09, -0.041]}
                scale={0.131}>
                <mesh
                  name="Object_21"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_21.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_22"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_22.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Rock001_17"
                position={[-0.496, 1.238, 6.849]}
                rotation={[-0.726, -0.185, -1.653]}
                scale={[0.661, 0.648, 0.778]}>
                <mesh
                  name="Object_46"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_46.geometry}
                  material={materials.Rock}
                />
              </group>
              <group
                name="Rock002_18"
                position={[8.043, -1.566, 4.396]}
                rotation={[-1.579, -0.154, -0.134]}
                scale={[1.826, 2.348, 1.826]}>
                <mesh
                  name="Object_48"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_48.geometry}
                  material={materials.Rock}
                />
              </group>
              <group
                name="Rock003_19"
                position={[2.338, -5.177, -7.975]}
                rotation={[-1.089, 0.065, -0.039]}
                scale={[3.973, 3.192, 3.629]}>
                <mesh
                  name="Object_50"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_50.geometry}
                  material={materials.Rock}
                  position={[2.688, -3.062, 1.655]}
                />
              </group>
              <group
                name="Rock004_20"
                position={[-5.456, 3.06, -2.726]}
                rotation={[-1.839, -0.188, -0.319]}
                scale={[2.478, 1.991, 2.263]}>
                <mesh
                  name="Object_52"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_52.geometry}
                  material={materials.Rock}
                />
              </group>
              <group
                name="Rock005_21"
                position={[5.769, 1.566, 6.338]}
                rotation={[0.049, 0.883, 0.089]}
                scale={[0.658, 1.241, 0.999]}>
                <mesh
                  name="Object_54"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_54.geometry}
                  material={materials.Rock}
                />
              </group>
              <group
                name="Rock006_22"
                position={[6.565, 1.381, 5.744]}
                rotation={[0.058, -0.998, 0.176]}
                scale={[0.661, 1.52, 0.999]}>
                <mesh
                  name="Object_56"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_56.geometry}
                  material={materials.Rock}
                />
              </group>
              <group
                name="Rock_16"
                position={[6.244, 2.286, 5.913]}
                rotation={[0.191, 0.701, 1.385]}
                scale={[0.661, 1.692, 1.013]}>
                <mesh
                  name="Object_44"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_44.geometry}
                  material={materials.Rock}
                />
              </group>
              <group
                name="RockTree001_29"
                position={[4.718, -5.735, -7.473]}
                rotation={[-0.009, 1.129, -0.225]}
                scale={[0.364, 0.291, 0.305]}>
                <mesh
                  name="Object_79"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_79.geometry}
                  material={materials.Rock}
                  position={[-15.564, -4.832, 47.639]}
                />
              </group>
              <group
                name="RockTree_28"
                position={[-8.361, -7.07, 6.931]}
                rotation={[0.099, 1.152, -0.244]}
                scale={[0.597, 0.476, 0.5]}>
                <mesh
                  name="Object_77"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_77.geometry}
                  material={materials.Rock}
                />
              </group>
              <group
                name="Tree001_11"
                position={[8.017, 1.063, 4.262]}
                rotation={[Math.PI, -0.455, Math.PI]}
                scale={0.14}>
                <mesh
                  name="Object_28"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_28.geometry}
                  material={materials.TreeBrown}
                />
                <mesh
                  name="Object_29"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_29.geometry}
                  material={materials.TreeBrownPlus}
                />
                <mesh
                  name="Object_30"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_30.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_31"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_31.geometry}
                  material={materials['Material.004']}
                />
              </group>
              <group
                name="Tree002_23"
                position={[-2.099, 0.748, 6.783]}
                rotation={[0.268, -0.973, 0.241]}
                scale={0.099}>
                <mesh
                  name="Object_58"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_58.geometry}
                  material={materials.TreeBrown}
                />
                <mesh
                  name="Object_59"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_59.geometry}
                  material={materials.TreeBrownPlus}
                />
                <mesh
                  name="Object_60"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_60.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_61"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_61.geometry}
                  material={materials['Material.004']}
                />
              </group>
              <group
                name="Tree003_24"
                position={[1.888, 0.415, 1.841]}
                rotation={[2.8, 0.867, -2.794]}
                scale={0.115}>
                <mesh
                  name="Object_63"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_63.geometry}
                  material={materials.TreeBrown}
                />
                <mesh
                  name="Object_64"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_64.geometry}
                  material={materials.TreeBrownPlus}
                />
                <mesh
                  name="Object_65"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_65.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_66"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_66.geometry}
                  material={materials['Material.004']}
                />
              </group>
              <group
                name="Tree004_25"
                position={[8.072, -1.182, -4.815]}
                rotation={[-2.646, -0.997, -1.917]}
                scale={0.14}>
                <mesh
                  name="Object_68"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_68.geometry}
                  material={materials.TreeBrown}
                />
                <mesh
                  name="Object_69"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_69.geometry}
                  material={materials.TreeBrownPlus}
                />
                <mesh
                  name="Object_70"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_70.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_71"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_71.geometry}
                  material={materials['Material.004']}
                />
              </group>
            </group>
          </group>
        </group>
        <group
          name="Sketchfab_model001"
          position={[0.958, 1.529, -1.118]}
          rotation={[-1.618, 0.059, -2.723]}
          scale={0.022}>
          <group
            name="e21c40cc12934092bee76191c3ab0ce8fbx"
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.01}>
            <group name="RootNode" position={[0, 0, 0.001]}>
              <group
                name="Empty"
                position={[2338.5, -515.885, -983.755]}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={-3276.075}>
                <group
                  name="Cube"
                  position={[0.103, 0.284, -0.157]}
                  rotation={[0, 0.773, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube001"
                  position={[0.103, 0.317, -0.157]}
                  rotation={[0, -0.846, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube001_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube001_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube002"
                  position={[0.45, -0.027, 0.212]}
                  rotation={[0.033, -0.823, 1.595]}
                  scale={[-0.033, -0.018, -0.029]}>
                  <mesh
                    name="Cube002_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube002_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube003"
                  position={[-0.353, -0.032, 0.213]}
                  rotation={[0.03, 0.727, 1.551]}
                  scale={[-0.031, -0.018, -0.029]}>
                  <mesh
                    name="Cube003_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube003_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube004"
                  position={[0.103, -0.333, -0.157]}
                  rotation={[0, 0.773, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube004_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube004_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube005"
                  position={[0.103, -0.364, -0.157]}
                  rotation={[0, -0.846, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube005_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube005_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube006"
                  position={[-0.536, 0.251, 0.004]}
                  rotation={[0, -0.026, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube006_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube006_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube007"
                  position={[-0.536, -0.3, 0.004]}
                  rotation={[0, -0.026, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube007_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube007_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube008"
                  position={[-0.473, -0.028, 0]}
                  rotation={[1.586, 1.548, -0.015]}
                  scale={[-0.027, -0.018, -0.029]}>
                  <mesh
                    name="Cube008_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube008_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube009"
                  position={[0.359, -0.028, -0.424]}
                  rotation={[3.108, 0.825, -1.546]}
                  scale={[-0.031, -0.018, -0.029]}>
                  <mesh
                    name="Cube009_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube009_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cylinder"
                  position={[0.089, 0.312, -0.177]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.027]}>
                  <mesh
                    name="Cylinder_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder001"
                  position={[0.089, -0.358, -0.177]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.027]}>
                  <mesh
                    name="Cylinder001_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder001_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder002"
                  position={[-0.473, 0.248, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.022]}>
                  <mesh
                    name="Cylinder002_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder002_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder003"
                  position={[-0.473, -0.299, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.022]}>
                  <mesh
                    name="Cylinder003_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder003_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder004"
                  position={[0.452, 0.312, 0.213]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.027]}>
                  <mesh
                    name="Cylinder004_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder004_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder005"
                  position={[0.452, -0.358, 0.213]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.027]}>
                  <mesh
                    name="Cylinder005_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder005_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group name="Plane" position={[-0.241, -0.029, 0]} scale={[-0.265, -0.251, -0.265]}>
                  <mesh
                    name="Plane_Material002_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Plane_Material002_0.geometry}
                    material={materials['Material.003']}
                  />
                  <mesh
                    name="Plane_Material003_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Plane_Material003_0.geometry}
                    material={materials['Material.008']}
                  />
                </group>
              </group>
            </group>
          </group>
        </group>
        <group
          name="Sketchfab_model002"
          position={[-0.586, 1.679, 0.898]}
          rotation={[-1.321, 0, 1.921]}
          scale={0.146}>
          <group name="Root">
            <group
              name="Cube010"
              position={[0, 0, 0.089]}
              rotation={[0, 0, Math.PI / 2]}
              scale={[1.376, 0.126, 4.396]}>
              <mesh
                name="Cube_0"
                castShadow
                receiveShadow
                geometry={nodes.Cube_0.geometry}
                material={materials['Material.009']}
              />
            </group>
            <group name="Lamp" position={[4.076, 1.005, 5.904]} rotation={[-0.268, 0.602, 1.931]}>
              <group name="Lamp001" />
            </group>
          </group>
        </group>
        <mesh
          name="Mesh_0"
          castShadow
          receiveShadow
          geometry={nodes.Mesh_0.geometry}
          material={materials.Material_0}
          position={[-0.108, 1.312, -1.041]}
          rotation={[0, -1.028, 0]}
          scale={0.082}
        />
        <group
          name="Sketchfab_model003"
          position={[-2.102, 1.061, 4.554]}
          rotation={[-Math.PI / 2, -0.477, -0.793]}
          scale={-0.234}>
          <group name="e78729edba7745e28b7154a01f7f8fe2objcleanermaterialmergergles" />
        </group>
        <group name="group1945116984" position={[-0.058, 1.446, 0.182]}>
          <mesh
            name="mesh1945116984"
            castShadow
            receiveShadow
            geometry={nodes.mesh1945116984.geometry}
            material={materials.mat21}
          />
          <mesh
            name="mesh1945116984_1"
            castShadow
            receiveShadow
            geometry={nodes.mesh1945116984_1.geometry}
            material={materials.mat12}
          />
          <mesh
            name="mesh1945116984_2"
            castShadow
            receiveShadow
            geometry={nodes.mesh1945116984_2.geometry}
            material={materials.mat8}
          />
          <mesh
            name="mesh1945116984_3"
            castShadow
            receiveShadow
            geometry={nodes.mesh1945116984_3.geometry}
            material={materials.mat5}
          />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/merged.glb')