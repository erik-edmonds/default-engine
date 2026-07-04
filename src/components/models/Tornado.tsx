import { useRef, useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'

export function Tornado(props) {
  const group = useRef()
  const { nodes, materials, animations } = useGLTF('/models/tornado.glb')
  const { actions } = useAnimations(animations, group)
  animations[0].name = "Tornado"
  useEffect(() => {
    actions["Tornado"]?.reset().play()
  }, [])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Sketchfab_Scene">
        <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]}>
          <group name="5656d78dc52a462ba7abda38f55498ebfbx" rotation={[Math.PI / 2, 0, 0]}>
            <group name="Object_2">
              <group name="RootNode">
                <group name="Plane001" position={[0.974, 21.355, 9.017]} scale={0.373}>
                  <mesh
                    name="Plane001_13_-_Default_0"
                    castShadow
                    receiveShadow
                    geometry={nodes['Plane001_13_-_Default_0'].geometry}
                    material={materials['13_-_Default']}
                  />
                </group>
                <group name="Plane002" position={[7.461, 40.871, 19.348]} scale={0.307}>
                  <mesh
                    name="Plane002_16_-_Default_0"
                    castShadow
                    receiveShadow
                    geometry={nodes['Plane002_16_-_Default_0'].geometry}
                    material={materials['16_-_Default']}
                  />
                </group>
                <group
                  name="Plane003"
                  position={[-5.094, 38.898, -8.541]}
                  rotation={[Math.PI, -Math.PI / 6, Math.PI]}
                  scale={0.246}>
                  <mesh
                    name="Plane003_17_-_Default_0"
                    castShadow
                    receiveShadow
                    geometry={nodes['Plane003_17_-_Default_0'].geometry}
                    material={materials['17_-_Default']}
                  />
                </group>
                <group
                  name="Box002"
                  position={[-0.969, 13.383, 3.621]}
                  rotation={[-Math.PI / 2, 0, 0]}>
                  <group name="Object_11" position={[8.959, 3.128, 0]}>
                    <mesh
                      name="Box002_14_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box002_14_-_Default_0'].geometry}
                      material={materials['14_-_Default']}
                    />
                  </group>
                </group>
                <group
                  name="Box003"
                  position={[-0.18, 39.559, 0.181]}
                  rotation={[-Math.PI / 2, 0, 0]}>
                  <group name="Object_14" position={[-7.396, -19.525, 0]}>
                    <mesh
                      name="Box003_13_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box003_13_-_Default_0'].geometry}
                      material={materials['13_-_Default']}
                    />
                  </group>
                </group>
                <group name="Box004" position={[-7.755, 0, 5.443]} rotation={[-Math.PI / 2, 0, 0]}>
                  <group name="Object_17" position={[4.191, 1.501, 0]}>
                    <mesh
                      name="Box004_15_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box004_15_-_Default_0'].geometry}
                      material={materials['15_-_Default']}
                    />
                  </group>
                </group>
                <group
                  name="Box006"
                  position={[0.515, 56.65, 0.558]}
                  rotation={[-Math.PI / 2, 0, 0.26]}
                  scale={0.67}>
                  <group name="Object_20" position={[-47.601, -8.203, 0]}>
                    <mesh
                      name="Box006_02_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box006_02_-_Default_0'].geometry}
                      material={materials['02_-_Default']}
                    />
                  </group>
                </group>
                <group
                  name="Box007"
                  position={[0.767, 0, 1.345]}
                  rotation={[-Math.PI / 2, 0, -2.618]}
                  scale={0.168}>
                  <group name="Object_23" position={[-60.899, -24.447, 0]}>
                    <mesh
                      name="Box007_02_-_Default��_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box007_02_-_Default��_0'].geometry}
                      material={materials['02_-_Default_6']}
                    />
                  </group>
                </group>
                <group
                  name="Box008"
                  position={[-0.859, 0, 0.43]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={0.259}>
                  <group name="Object_26" position={[-34.824, -4.728, 0]}>
                    <mesh
                      name="Box008_02_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box008_02_-_Default_0'].geometry}
                      material={materials['02_-_Default']}
                    />
                  </group>
                </group>
                <group
                  name="Box009"
                  position={[0.195, 60.773, 1.153]}
                  rotation={[-Math.PI / 2, 0, 2.269]}
                  scale={0.455}>
                  <group name="Object_29" position={[-91.392, 8.957, 0]}>
                    <mesh
                      name="Box009_02_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box009_02_-_Default_0'].geometry}
                      material={materials['02_-_Default']}
                    />
                  </group>
                </group>
                <group
                  name="Box011"
                  position={[4.806, 56.65, -2.578]}
                  rotation={[-Math.PI / 2, 0, -2.094]}
                  scale={0.67}>
                  <group name="Object_32" position={[-47.601, -8.203, 0]}>
                    <mesh
                      name="Box011_02_-_Default��_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box011_02_-_Default��_0'].geometry}
                      material={materials['02_-_Default_6']}
                    />
                  </group>
                </group>
                <group
                  name="Box012"
                  position={[0.195, 60.773, 1.153]}
                  rotation={[-Math.PI / 2, 0, -0.938]}
                  scale={0.408}>
                  <group name="Object_35" position={[-91.392, 8.957, 0]}>
                    <mesh
                      name="Box012_02_-_Default��_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box012_02_-_Default��_0'].geometry}
                      material={materials['02_-_Default_6']}
                    />
                  </group>
                </group>
                <group
                  name="Box013"
                  position={[0.195, 51.753, 1.153]}
                  rotation={[-Math.PI / 2, 0, Math.PI / 2]}
                  scale={0.427}>
                  <group name="Object_38" position={[-91.392, 8.957, 0]}>
                    <mesh
                      name="Box013_02_-_Default��_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box013_02_-_Default��_0'].geometry}
                      material={materials['02_-_Default_6']}
                    />
                  </group>
                </group>
                <group
                  name="Box014"
                  position={[0.195, 51.753, 1.153]}
                  rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
                  scale={0.427}>
                  <group name="Object_41" position={[-91.392, 8.957, 0]}>
                    <mesh
                      name="Box014_02_-_Default_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box014_02_-_Default_0'].geometry}
                      material={materials['02_-_Default']}
                    />
                  </group>
                </group>
                <group
                  name="Cylinder003"
                  position={[-1.279, 0, -0.833]}
                  rotation={[-Math.PI / 2, 0, 0]}>
                  <mesh
                    name="Cylinder003_01_-_Default_0"
                    castShadow
                    receiveShadow
                    geometry={nodes['Cylinder003_01_-_Default_0'].geometry}
                    material={materials['01_-_Default']}
                  />
                </group>
                <group
                  name="Cylinder004"
                  position={[-0.45, 0, -2.36]}
                  rotation={[-Math.PI / 2, 0, -Math.PI / 6]}>
                  <mesh
                    name="Cylinder004_07_-_Default_0"
                    castShadow
                    receiveShadow
                    geometry={nodes['Cylinder004_07_-_Default_0'].geometry}
                    material={materials['07_-_Default']}
                  />
                </group>
                <group
                  name="Box015"
                  position={[0.767, 0, 1.345]}
                  rotation={[-Math.PI / 2, 0, 2.269]}
                  scale={0.121}>
                  <group name="Object_48" position={[-60.899, -24.447, 0]}>
                    <mesh
                      name="Box015_02_-_Default��_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box015_02_-_Default��_0'].geometry}
                      material={materials['02_-_Default_6']}
                    />
                  </group>
                </group>
                <group
                  name="Box016"
                  position={[0.515, 56.65, 0.558]}
                  rotation={[-Math.PI / 2, 0, 1.833]}
                  scale={0.67}>
                  <group name="Object_51" position={[-47.601, -8.203, 0]}>
                    <mesh
                      name="Box016_02_-_Default��_0"
                      castShadow
                      receiveShadow
                      geometry={nodes['Box016_02_-_Default��_0'].geometry}
                      material={materials['02_-_Default_6']}
                    />
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/tornado.glb')