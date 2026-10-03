import { useRef } from "react"
import { useCompoundBody, type CompoundBodyProps, type WheelInfoOptions } from "@react-three/cannon"
import type * as THREE from "three"

/** The four wheels of the car, as kinematic cylinders, plus the suspension
 *  description useRaycastVehicle drives them with.
 *
 *  Ported from the original project unchanged in substance -- every number
 *  here is a handling tune and none of it is mine to second-guess. Typed,
 *  and the four useCompoundBody calls spelled out rather than looped,
 *  because hooks cannot be called from a loop whose length React has no
 *  promise about. (It is a constant four here, but the rule is the rule and
 *  the linter enforces it.) */
export function useWheels(width: number, height: number, length: number, radius: number) {
  // FOUR NAMED REFS, NOT AN ARRAY OF THEM.
  //
  // The array reads better and the React compiler's `react-hooks/refs` rule
  // rejects it: indexing `wheels[1]` looks to the rule like dereferencing a
  // ref during render, even though the element IS the RefObject and nothing
  // reads `.current`. Naming them sidesteps a false positive structurally,
  // which is better than seventeen disable comments. The array below is
  // assembled once, at the end, purely because that is the shape
  // useRaycastVehicle wants.
  const rightFront = useRef<THREE.Group>(null)
  const leftFront = useRef<THREE.Group>(null)
  const rightBack = useRef<THREE.Group>(null)
  const leftBack = useRef<THREE.Group>(null)

  const wheelInfo: WheelInfoOptions = {
    radius,
    directionLocal: [0, -1, 0],
    axleLocal: [1, 0, 0],
    suspensionStiffness: 60,
    suspensionRestLength: 0.1,
    dampingRelaxation: 2.3,
    dampingCompression: 4.4,
    maxSuspensionForce: 100000,
    rollInfluence: 0.01,
    maxSuspensionTravel: 0.1,
    customSlidingRotationalSpeed: -30,
    useCustomSlidingRotationalSpeed: true,
  }

  const wheelInfos: WheelInfoOptions[] = [
    // [0] right front
    { ...wheelInfo, chassisConnectionPointLocal: [-width * 0.45, -height * 0.2, length * 0.31], isFrontWheel: true },
    // [1] left front
    { ...wheelInfo, chassisConnectionPointLocal: [width * 0.45, -height * 0.2, length * 0.31], isFrontWheel: true },
    // [2] right back
    { ...wheelInfo, chassisConnectionPointLocal: [-width * 0.45, -height * 0.2, -length * 0.3], isFrontWheel: false },
    // [3] left back
    { ...wheelInfo, chassisConnectionPointLocal: [width * 0.45, -height * 0.2, -length * 0.3], isFrontWheel: false },
  ]

  // A CAST, AND AN UPSTREAM TYPE FLAW RATHER THAN A SHORTCUT.
  //
  // cannon declares `CompoundBodyProps["shapes"]` as
  // `BodyProps & { type: ShapeType }`, and BodyProps ALREADY declares
  // `type?: 'Dynamic' | 'Static' | 'Kinematic'`. Intersecting those two
  // unions leaves `type: never`, so no shape literal can satisfy it and the
  // compiler rejects the one object the runtime actually wants. The
  // original project was untyped JSX and so never met this.
  //
  // The shape below is exactly what @pmndrs/cannon-worker-api expects at
  // runtime: a cylinder the size of a wheel, laid on its axle.
  const shapes = [
    { args: [radius, radius, 0.2, 16], rotation: [0, 0, -Math.PI / 2], type: "Cylinder" },
  ] as unknown as CompoundBodyProps["shapes"]

  const props = (): CompoundBodyProps => ({
    collisionFilterGroup: 0,
    mass: 1,
    shapes,
    type: "Kinematic",
  })

  useCompoundBody(props, rightFront)
  useCompoundBody(props, leftFront)
  useCompoundBody(props, rightBack)
  useCompoundBody(props, leftBack)

  // Order matters and is the contract with wheelInfos above and with
  // useControls, which addresses wheels by index: 0/1 front, 2/3 back.
  const wheels = [rightFront, leftFront, rightBack, leftBack]

  return { wheels, wheelInfos, rightFront, leftFront, rightBack, leftBack }
}
