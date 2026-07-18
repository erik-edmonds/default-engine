import * as THREE from 'three'
import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { CameraControls, OrbitControls} from '@react-three/drei'
import { useRoute } from 'wouter'

//Move the scene camera helper here.
export function Rig({ position = new THREE.Vector3(0, 0, 2), focus = new THREE.Vector3(0, 0, 0) }) {
  const { controls, scene } = useThree()
  const [, params] = useRoute('/item/:id')

  useEffect(() => {
    const active = scene.getObjectByName(params?.id)
    if (active) {
      active.parent.localToWorld(position.set(0, 0.5, 0.25))
      active.parent.localToWorld(focus.set(0, 0, -2))
    }
    controls?.setLookAt(...position.toArray(), ...focus.toArray(), true)
  })
  return ( 
    <>
        <CameraControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2} />
    </>
  )
}