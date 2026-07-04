import { useGLTF } from '@react-three/drei'

export function Aku(props) {
  const { nodes, materials } = useGLTF('/models/aku.glb')
  return (
    <group {...props} dispose={null}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <group position={[-0.162, -0.092, -1.283]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh
            castShadow
            receiveShadow
            geometry={nodes['Nose_02_-_Default_0'].geometry}
            material={materials['02_-_Default']}
            position={[-0.282, -0.709, 0]}
          />
        </group>
        <group position={[-0.127, 0.096, -1.119]}>
          <mesh
            castShadow
            receiveShadow
            geometry={nodes['Head_05_-_Default_0'].geometry}
            material={materials['05_-_Default']}
            position={[0.043, 0, -2.327]}
          />
        </group>
        <group position={[-1.363, -0.239, 0.734]} scale={[1, 0.638, 1]}>
          <mesh
            castShadow
            receiveShadow
            geometry={nodes['Box001_02_-_Default_0'].geometry}
            material={materials['02_-_Default']}
            position={[0.366, 0, -1.296]}
          />
        </group>
        <group position={[0.99, -0.239, 0.57]} scale={[1, 0.644, 1]}>
          <mesh
            castShadow
            receiveShadow
            geometry={nodes['Box002_02_-_Default_0'].geometry}
            material={materials['02_-_Default']}
            position={[0.579, 0, -1.132]}
          />
        </group>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes['Eyes_04_-_Default_0'].geometry}
          material={materials['04_-_Default']}
          position={[-1.194, -0.125, -0.156]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes['Undereyes_03_-_Default_0'].geometry}
          material={materials['03_-_Default']}
          position={[-1.194, -0.125, 0.005]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes['Line005_03_-_Default_0'].geometry}
          material={materials['03_-_Default']}
          position={[-0.053, -0.266, -3.97]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes['Teeth_07_-_Default_0'].geometry}
          material={materials['07_-_Default']}
          position={[-0.927, -0.345, -2.417]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes['Box003_02_-_Default_0'].geometry}
          material={materials['02_-_Default']}
          position={[-0.056, 0.172, -3.2]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes['Line004_03_-_Default_0'].geometry}
          material={materials['03_-_Default']}
          position={[2.43, 0.146, 2.062]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Line003_LEaf_0.geometry}
          material={materials.LEaf}
          position={[0.858, 0.12, 2.988]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes['Line002_08_-_Default_0'].geometry}
          material={materials['08_-_Default']}
          position={[-0.976, 0.17, 2.97]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <mesh
          castShadow
          receiveShadow
          geometry={nodes['Line001_02_-_Default_0'].geometry}
          material={materials['02_-_Default']}
          position={[-2.461, 0.09, 2.347]}
          rotation={[Math.PI / 2, 0, 0]}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/models/aku.glb')