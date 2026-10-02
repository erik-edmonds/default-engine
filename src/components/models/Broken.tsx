import type { ThreeElements } from '@react-three/fiber'
// The project's typed wrapper, not drei's -- see next.config.ts on why
// `nodes.Foo.geometry` off drei's Object3D type was 216 errors and the
// reason `ignoreBuildErrors` had to stay on. Every other gltfjsx component
// in this folder goes through it.
import { useGLTF } from '@/helpers/useGLTF'

export function Broken(props: ThreeElements['group']) {
  const { nodes, materials } = useGLTF('/models/broken.glb')
  return (
    <group {...props} dispose={null}>
      <group position={[0.024, -0.134, -0.523]} rotation={[-0.315, -0.147, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpolySurface5_blinn1_0.geometry}
          material={materials.blinn1}
          position={[0.524, 0.557, 0.257]}
          rotation={[0.168, -0.117, -0.115]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpolySurface6_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpolySurface7_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpolySurface8_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpolySurface9_blinn2_0.geometry}
          material={materials.blinn2}
        />
      </group>
      <group
        position={[-1.149, -2.778, 1.423]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.403, 1.037, 0.403]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCylinder13_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCylinder13_blinn1_0.geometry}
          material={materials.blinn1}
        />
      </group>
      <group
        position={[1.215, -2.778, 1.394]}
        rotation={[Math.PI / 2, 0, -0.214]}
        scale={[0.403, 1.037, 0.403]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCylinder14_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCylinder14_blinn1_0.geometry}
          material={materials.blinn1}
        />
      </group>
      <group position={[-0.015, -0.102, -0.056]} rotation={[0.339, -0.115, -0.11]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface5_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface5_lambert8_0.geometry}
          material={materials.lambert8}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface6_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface7_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface7_lambert8_0.geometry}
          material={materials.lambert8}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface8_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface9_blinn3_0.geometry}
          material={materials.blinn3}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface10_blinn4_0.geometry}
          material={materials.blinn4}
        />
      </group>
      <group
        position={[-1.154, -2.49, 3.194]}
        rotation={[0, 0.014, 0]}
        scale={[0.746, 1.357, 0.49]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube9_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube9_blinn1_0.geometry}
          material={materials.blinn1}
        />
      </group>
      <group
        position={[1.615, -2.478, 3.142]}
        rotation={[0, 0.225, 0]}
        scale={[0.746, 1.357, 0.49]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube10_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube10_blinn1_0.geometry}
          material={materials.blinn1}
        />
      </group>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenpolySurface4_lambert1_0.geometry}
        material={materials.lambert1}
        position={[5.854, -6.037, -5.923]}
        rotation={[1.219, -0.041, -0.128]}
      />
      <group position={[0.653, -0.009, -1.02]} rotation={[0, -0.224, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface11_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface12_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface13_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface14_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface15_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface16_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface17_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface18_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface19_blinn2_0.geometry}
          material={materials.blinn2}
        />
      </group>
      <group
        position={[3.789, -2.92, 0.522]}
        rotation={[0, -0.913, 0]}
        scale={[1.798, 0.132, 1.034]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube39_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube39_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube39_lambert2_0.geometry}
          material={materials.lambert2}
        />
      </group>
      <group position={[3.887, -1.832, 12.502]} rotation={[3.066, -0.952, 3.141]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpPipe14_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpPipe14_blinn6_0.geometry}
          material={materials.blinn6}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpPipe14_blinn1_0.geometry}
          material={materials.blinn1}
        />
      </group>
      <group position={[-17.284, -11.659, 11.069]} rotation={[-0.646, 0.569, -0.936]} scale={3.172}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenGearpolySurface1_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenGearpolySurface1_blinn2_0.geometry}
          material={materials.blinn2}
        />
      </group>
      <group
        position={[-0.105, -3.116, 4.724]}
        rotation={[1.575, -0.005, -1.276]}
        scale={[0.97, 0.085, 0.085]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube47_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenBrokenpCube47_blinn2_0.geometry}
          material={materials.blinn2}
        />
      </group>
      <group position={[0, 0, 1.174]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface2_blinn7_0.geometry}
          material={materials.blinn7}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.BrokenpolySurface2_lambert6_0.geometry}
          material={materials.lambert6}
        />
      </group>
      <group
        position={[-4.796, -2.92, 0.522]}
        rotation={[0, 0.492, 0]}
        scale={[1.798, 0.132, 1.034]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube39_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube39_blinn2_0.geometry}
          material={materials.blinn2}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube39_lambert2_0.geometry}
          material={materials.lambert2}
        />
      </group>
      <group
        position={[1.839, -3.116, 4.724]}
        rotation={[1.575, -0.005, -0.805]}
        scale={[0.97, 0.085, 0.085]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube47_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube47_blinn2_0.geometry}
          material={materials.blinn2}
        />
      </group>
      <group
        position={[1.725, -3.116, 4.211]}
        rotation={[1.575, -0.005, 1.706]}
        scale={[0.97, 0.085, 0.085]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube48_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube48_blinn2_0.geometry}
          material={materials.blinn2}
        />
      </group>
      <group
        position={[1.839, -3.116, 5.768]}
        rotation={[1.575, -0.005, -2.694]}
        scale={[0.97, 0.085, 0.085]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube49_blinn1_0.geometry}
          material={materials.blinn1}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.pCube49_blinn2_0.geometry}
          material={materials.blinn2}
        />
      </group>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.polySurface4_lambert5_0.geometry}
        material={materials.lambert5}
        position={[-3.021, 0, 2.627]}
        rotation={[0, -0.242, 0]}
      />
      <group position={[5.379, -4.09, 0.292]} rotation={[1.006, 0, 0]}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.polySurface2_blinn7_0.geometry}
          material={materials.blinn7}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.polySurface2_lambert6_0.geometry}
          material={materials.lambert6}
        />
      </group>
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder7_blinn2_0.geometry}
        material={materials.blinn2}
        position={[0, -0.145, 0]}
        scale={[0.48, 0.346, 0.48]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube2_blinn1_0.geometry}
        material={materials.blinn1}
        position={[0, -1.786, 0]}
        scale={[2.074, 2.768, 1.935]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder8_blinn2_0.geometry}
        material={materials.blinn2}
        position={[-0.958, -0.968, 0.005]}
        rotation={[Math.PI / 2, 0, Math.PI / 2]}
        scale={0.339}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpSphere2_blinn2_0.geometry}
        material={materials.blinn2}
        position={[1.174, -0.978, 0.038]}
        rotation={[-0.744, 0, 0]}
        scale={0.32}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube4_blinn2_0.geometry}
        material={materials.blinn2}
        position={[-0.547, -0.573, 2.702]}
        rotation={[-0.42, -1.331, -0.35]}
        scale={[0.158, 0.158, 0.613]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube5_blinn2_0.geometry}
        material={materials.blinn2}
        position={[-0.398, -0.636, 2.88]}
        rotation={[0.36, -1.325, 0.409]}
        scale={[0.158, 0.158, 0.613]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube6_blinn2_0.geometry}
        material={materials.blinn2}
        position={[-0.193, -0.631, 3.044]}
        rotation={[0.449, -1.204, 0.5]}
        scale={[0.158, 0.158, 0.613]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube7_blinn2_0.geometry}
        material={materials.blinn2}
        position={[-0.205, -0.622, 2.435]}
        rotation={[-3.102, -0.965, -1.709]}
        scale={[0.158, 0.158, 0.613]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpPipe9_blinn5_0.geometry}
        material={materials.blinn5}
        position={[0.543, -2.982, 0.183]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={0.426}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpPipe10_blinn5_0.geometry}
        material={materials.blinn5}
        position={[-0.059, -1.285, 0.075]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.224, 0.02, 0.224]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpPipe11_blinn5_0.geometry}
        material={materials.blinn5}
        position={[-0.303, -1.75, 0.344]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.289, 0.025, 0.289]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpPipe12_blinn5_0.geometry}
        material={materials.blinn5}
        position={[0.07, -3.358, 0.643]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={0.426}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder16_blinn2_0.geometry}
        material={materials.blinn2}
        position={[-1.164, -2.959, 2.741]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.105, 0.234, 0.105]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder17_blinn2_0.geometry}
        material={materials.blinn2}
        position={[1.506, -2.959, 2.754]}
        rotation={[Math.PI / 2, 0, -0.192]}
        scale={[0.105, 0.234, 0.105]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube11_blinn9_0.geometry}
        material={materials.blinn9}
        position={[-1.475, -0.783, 0]}
        scale={[0.588, 0.052, 0.052]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube12_blinn9_0.geometry}
        material={materials.blinn9}
        position={[-1.401, -0.951, 0.189]}
        rotation={[1.166, 0, 0]}
        scale={[0.588, 0.052, 0.052]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube13_blinn9_0.geometry}
        material={materials.blinn9}
        position={[-1.359, -0.909, -0.173]}
        rotation={[-Math.PI, 0.233, -Math.PI]}
        scale={[0.588, 0.038, 0.029]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube14_blinn9_0.geometry}
        material={materials.blinn9}
        position={[-1.279, -1.092, 0.049]}
        rotation={[2.48, 0.185, -2.999]}
        scale={[0.588, 0.038, 0.029]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube15_blinn9_0.geometry}
        material={materials.blinn9}
        position={[-1.279, -0.931, 0.116]}
        rotation={[1.916, -0.158, -2.869]}
        scale={[0.588, 0.038, 0.029]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder25_blinn5_0.geometry}
        material={materials.blinn5}
        position={[0.737, -2.688, 0.793]}
        scale={0.487}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpPlane1_bckgd_0.geometry}
        material={materials.bckgd}
        position={[0, -3.225, 0]}
        scale={28.623}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube16_lambert4_0.geometry}
        material={materials.lambert4}
        position={[-1.701, -2.459, 6.999]}
        scale={1.479}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube17_lambert5_0.geometry}
        material={materials.lambert5}
        position={[1.664, -2.676, 8.088]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube18_lambert5_0.geometry}
        material={materials.lambert5}
        position={[-4.377, -2.694, 7.574]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube19_lambert5_0.geometry}
        material={materials.lambert5}
        position={[-5.338, -2.991, 6.9]}
        rotation={[0, 1.188, 0]}
        scale={0.423}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube20_lambert5_0.geometry}
        material={materials.lambert5}
        position={[-5.247, -2.692, 4.701]}
        rotation={[-Math.PI, -0.865, -Math.PI]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder26_blinn5_0.geometry}
        material={materials.blinn5}
        position={[-1.289, -3.111, -3.17]}
        rotation={[0, 0, Math.PI]}
        scale={0.168}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder27_blinn5_0.geometry}
        material={materials.blinn5}
        position={[-2.124, -3.011, -3.9]}
        rotation={[1.976, 0, -Math.PI]}
        scale={0.168}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder28_blinn5_0.geometry}
        material={materials.blinn5}
        position={[3.869, -3.111, 3.513]}
        rotation={[0, 0, Math.PI]}
        scale={0.168}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder29_blinn5_0.geometry}
        material={materials.blinn5}
        position={[0.591, -3.011, 5.731]}
        rotation={[-1.976, 0, -Math.PI]}
        scale={0.168}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCylinder30_blinn5_0.geometry}
        material={materials.blinn5}
        position={[3.014, -2.879, 1.074]}
        scale={0.254}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpSphere4_blinn2_0.geometry}
        material={materials.blinn2}
        position={[-0.432, -2.855, -1.78]}
        rotation={[0.947, 0.244, 1.107]}
        scale={0.32}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube22_lambert5_0.geometry}
        material={materials.lambert5}
        position={[7.09, -1.989, 5.311]}
        rotation={[0, 1.157, 0]}
        scale={2.493}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube23_lambert4_0.geometry}
        material={materials.lambert4}
        position={[3.798, -2.997, 5.984]}
        rotation={[0, -0.02, 0]}
        scale={0.388}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube24_lambert1_0.geometry}
        material={materials.lambert1}
        position={[6.15, -2.905, 8.877]}
        rotation={[0, 1.186, 0]}
        scale={0.609}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube25_lambert4_0.geometry}
        material={materials.lambert4}
        position={[-7.17, -1.989, -6.662]}
        rotation={[0, 1.157, 0]}
        scale={2.493}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube27_lambert4_0.geometry}
        material={materials.lambert4}
        position={[-7.732, -2.927, -3.075]}
        rotation={[0, -0.02, 0]}
        scale={0.388}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube28_lambert4_0.geometry}
        material={materials.lambert4}
        position={[7.941, -2.533, 1.612]}
        rotation={[-Math.PI, -1.339, -Math.PI]}
        scale={1.388}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube29_lambert5_0.geometry}
        material={materials.lambert5}
        position={[-4.155, -2.732, -7.021]}
        rotation={[0, 0.865, 0]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube31_lambert5_0.geometry}
        material={materials.lambert5}
        position={[6.763, -2.694, -2.352]}
        rotation={[-Math.PI, 0.508, -Math.PI]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube32_lambert5_0.geometry}
        material={materials.lambert5}
        position={[5.802, -2.991, -3.026]}
        rotation={[-Math.PI, -0.68, -Math.PI]}
        scale={0.423}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube33_lambert4_0.geometry}
        material={materials.lambert4}
        position={[7.358, -2.692, -0.877]}
        rotation={[0, 0.357, 0]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube44_lambert4_0.geometry}
        material={materials.lambert4}
        position={[5.375, -2.106, -5.644]}
        rotation={[0, 0.455, 0]}
        scale={2.681}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube45_lambert4_0.geometry}
        material={materials.lambert4}
        position={[-9.475, -1.989, 1.416]}
        rotation={[-Math.PI, -1.283, -Math.PI]}
        scale={2.493}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpCube46_lambert4_0.geometry}
        material={materials.lambert4}
        position={[-7.931, -2.459, 4.782]}
        rotation={[-Math.PI, -0.441, -Math.PI]}
        scale={1.479}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenBrokenpHelix1_blinn5_0.geometry}
        material={materials.blinn5}
        position={[-2.822, -3.065, -1.846]}
        rotation={[0.713, 1.328, -0.176]}
        scale={0.099}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenpCube29_lambert5_0.geometry}
        material={materials.lambert5}
        position={[3.594, -2.732, -2.974]}
        rotation={[0, -0.801, 0]}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.BrokenpCube27_lambert4_0.geometry}
        material={materials.lambert4}
        position={[-3.361, -2.927, -6.202]}
        rotation={[0, -0.02, 0]}
        scale={0.388}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere1_lambert1_0.geometry}
        material={materials.lambert1}
        position={[0.548, 2.517, 1.153]}
        scale={0.299}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere2_lambert1_0.geometry}
        material={materials.lambert1}
        position={[0.474, 2.654, 1.067]}
        scale={0.187}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere3_lambert1_0.geometry}
        material={materials.lambert1}
        position={[0.396, 2.281, 1.067]}
        scale={0.187}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere4_lambert1_0.geometry}
        material={materials.lambert1}
        position={[0.136, 2.727, 0.927]}
        scale={0.124}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere5_lambert1_0.geometry}
        material={materials.lambert1}
        position={[0.136, 3.421, 0.811]}
        scale={0.187}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere6_lambert1_0.geometry}
        material={materials.lambert1}
        position={[0.21, 3.012, 0.898]}
        scale={0.214}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere7_lambert1_0.geometry}
        material={materials.lambert1}
        position={[0.063, 2.39, 0.898]}
        scale={0.245}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere8_lambert1_0.geometry}
        material={materials.lambert1}
        position={[0.474, 2.965, 0.928]}
        scale={0.187}
      />
      <mesh
        castShadow
        receiveShadow
        geometry={nodes.pSphere19_surfaceShader1_0.geometry}
        material={materials.surfaceShader1}
      />
    </group>
  )
}

useGLTF.preload('/models/broken.glb')