import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'

export function Chair(props) {
  const { nodes, materials } = useGLTF('/models/chair.glb')
  return (
    <group {...props} dispose={null}>
      <group scale={0.01}>
        <group
          position={[2338.5, -515.885, -983.755]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[-3276.075, 3276.075, 3276.075]}>
          <group
            position={[-0.241, -0.029, 0]}
            rotation={[Math.PI, 0, 0]}
            scale={[-0.265, 0.251, 0.265]}>
            <mesh
              castShadow
              receiveShadow
              geometry={nodes.Plane_Material002_0.geometry}
              material={materials['Material.002']}
            />
            <mesh
              castShadow
              receiveShadow
              geometry={nodes.Plane_Material003_0.geometry}
              material={materials['Material.003']}
            />
          </group>
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube_Material004_0.geometry}
            material={materials['Material.004']}
            position={[0.103, 0.284, -0.157]}
            rotation={[Math.PI, -0.773, 0]}
            scale={[-0.031, 0.015, 0.031]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube001_Material004_0.geometry}
            material={materials['Material.004']}
            position={[0.103, 0.317, -0.157]}
            rotation={[Math.PI, 0.846, 0]}
            scale={[-0.031, 0.015, 0.031]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube002_Material004_0.geometry}
            material={materials['Material.004']}
            position={[0.45, -0.027, 0.212]}
            rotation={[-3.108, 0.823, -1.595]}
            scale={[-0.033, 0.018, 0.029]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube003_Material004_0.geometry}
            material={materials['Material.004']}
            position={[-0.353, -0.032, 0.213]}
            rotation={[-3.111, -0.727, -1.551]}
            scale={[-0.031, 0.018, 0.029]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube004_Material004_0.geometry}
            material={materials['Material.004']}
            position={[0.103, -0.333, -0.157]}
            rotation={[Math.PI, -0.773, 0]}
            scale={[-0.031, 0.015, 0.031]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube005_Material004_0.geometry}
            material={materials['Material.004']}
            position={[0.103, -0.364, -0.157]}
            rotation={[Math.PI, 0.846, 0]}
            scale={[-0.031, 0.015, 0.031]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube006_Material004_0.geometry}
            material={materials['Material.004']}
            position={[-0.536, 0.251, 0.004]}
            rotation={[Math.PI, 0.026, 0]}
            scale={[-0.031, 0.015, 0.031]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube007_Material004_0.geometry}
            material={materials['Material.004']}
            position={[-0.536, -0.3, 0.004]}
            rotation={[Math.PI, 0.026, 0]}
            scale={[-0.031, 0.015, 0.031]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube008_Material004_0.geometry}
            material={materials['Material.004']}
            position={[-0.473, -0.028, 0]}
            rotation={[-1.556, -1.548, 0.015]}
            scale={[-0.027, 0.018, 0.029]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cylinder_Material005_0.geometry}
            material={materials['Material.005']}
            position={[0.089, 0.312, -0.177]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[-0.009, 0.009, 0.027]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cylinder001_Material005_0.geometry}
            material={materials['Material.005']}
            position={[0.089, -0.358, -0.177]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[-0.009, 0.009, 0.027]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cylinder002_Material005_0.geometry}
            material={materials['Material.005']}
            position={[-0.473, 0.248, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[-0.009, 0.009, 0.022]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cylinder003_Material005_0.geometry}
            material={materials['Material.005']}
            position={[-0.473, -0.299, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[-0.009, 0.009, 0.022]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cylinder004_Material005_0.geometry}
            material={materials['Material.005']}
            position={[0.452, 0.312, 0.213]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[-0.009, 0.009, 0.027]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cylinder005_Material005_0.geometry}
            material={materials['Material.005']}
            position={[0.452, -0.358, 0.213]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[-0.009, 0.009, 0.027]}
          />
          <mesh
            castShadow
            receiveShadow
            geometry={nodes.Cube009_Material004_0.geometry}
            material={materials['Material.004']}
            position={[0.359, -0.028, -0.424]}
            rotation={[-0.034, -0.825, 1.546]}
            scale={[-0.031, 0.018, 0.029]}
          />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/chair.glb')