"use client"

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useBox, useRaycastVehicle } from "@react-three/cannon"
import { useFrame, useLoader } from "@react-three/fiber"
import { GLTFLoader } from "three-stdlib"

import { useWheels } from "./useWheels"
import { useControls } from "./useControls"
import { RACING_ASSET } from "./paths"

const START_POSITION: [number, number, number] = [-10, 3, -3]
const START_ROTATION: [number, number, number] = [0, Math.PI / 2, 0]
const WIDTH = 1.2
const HEIGHT = 0.7
const LENGTH = 2.8
const WHEEL_RADIUS = 0.2

export function Car({ cameraView }: { cameraView: number }) {
  // Loaded here rather than in a helper function.
  //
  // The original wrapped this in `useMemo(() => loadCar(), [])`, where
  // loadCar() called useLoader -- a hook called from inside a callback,
  // which happens to work with Suspense-cached loaders and is still a rules
  // -of-hooks violation the linter rejects outright. useLoader already
  // caches by URL, so the memo was buying nothing.
  const gltf = useLoader(GLTFLoader, RACING_ASSET("models/car.glb"))
  // children: [CarBody, WheelRF, WheelLF, WheelLB, WheelRB]
  //
  // Cloned once in a memo. useLoader hands back ONE cached scene per URL, so
  // mounting the car without cloning would hand its live children to this
  // component and leave them reparented for anything else that loads the
  // same file.
  const [carBody, wheelRF, wheelLF, wheelLB, wheelRB] = useMemo(
    () => gltf.scene.clone().children.slice(0, 5),
    [gltf],
  )

  const chassisBodyRef = useRef<THREE.Group>(null)
  const [chassisBody, chassisApi] = useBox(
    () => ({
      allowSleep: false,
      args: [WIDTH, HEIGHT, LENGTH],
      mass: 150,
      rotation: START_ROTATION,
      position: START_POSITION,
    }),
    chassisBodyRef,
  )

  const { wheels, wheelInfos, rightFront, leftFront, rightBack, leftBack } =
    useWheels(WIDTH, HEIGHT, LENGTH, WHEEL_RADIUS)

  const vehicleRef = useRef<THREE.Group>(null)
  const [vehicle, vehicleApi] = useRaycastVehicle(
    () => ({ chassisBody, wheelInfos, wheels }),
    vehicleRef,
  )

  useControls(vehicleApi, chassisApi)

  const position = useRef(new THREE.Vector3())
  const quaternion = useRef(new THREE.Quaternion())
  const delta = useRef(new THREE.Vector3())
  const forward = useRef(new THREE.Vector3())

  useFrame((state) => {
    // View 0 is the free orbit camera, which drei owns -- moving it here
    // would fight OrbitControls for the same object every frame.
    if (cameraView === 0) return
    const body = chassisBody.current
    if (!body) return

    position.current.setFromMatrixPosition(body.matrixWorld)
    quaternion.current.setFromRotationMatrix(body.matrixWorld)

    const target = position.current.clone()
    if (cameraView === 1) delta.current.set(0, 2, -5)
    else if (cameraView === 2) delta.current.set(0, 2, 5)
    else {
      delta.current.set(0, 0.5, 0)
      forward.current.set(0, 0.45, 0.5).applyQuaternion(quaternion.current)
      target.add(forward.current)
    }

    delta.current.applyQuaternion(quaternion.current)
    state.camera.position.copy(position.current).add(delta.current)
    state.camera.lookAt(target)
  })

  return (
    <group ref={vehicle} name="vehicle">
      <group ref={chassisBody} name="chassisBody">
        <primitive object={carBody} rotation-y={-Math.PI / 2} position={[0, -0.15, 0]} />
      </group>

      <group ref={rightFront} name="WheelRF">
        <primitive object={wheelRF} rotation-y={-Math.PI / 2} />
      </group>
      <group ref={leftFront} name="WheelLF">
        <primitive object={wheelLF} rotation-y={-Math.PI / 2} />
      </group>
      {/* The back pair is deliberately crossed against the glTF's child
          order: the file lists [body, RF, LF, LB, RB], but useWheels indexes
          [RF, LF, RB, LB]. Straightening it out here would put each back
          wheel on the far side of the car from its collider. */}
      <group ref={rightBack} name="WheelRB">
        <primitive object={wheelRB} rotation-y={-Math.PI / 2} />
      </group>
      <group ref={leftBack} name="WheelLB">
        <primitive object={wheelLB} rotation-y={-Math.PI / 2} />
      </group>
    </group>
  )
}
