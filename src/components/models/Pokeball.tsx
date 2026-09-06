import * as THREE from 'three'
import React, { useRef, useEffect, useState, useMemo } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { useCursorHover } from '@/helpers/useCursorHover'
import { useFrame } from '@react-three/fiber'

import { useShadows } from '@/helpers/useShadows'
import { MAGNETIC_SNAP_RADIUS, activateTarget, registerMagneticTarget, type MagneticTarget } from '@/helpers/cursor'

/** Same as the other props: noticed, not captured by. */
const PROP_MAGNETIC_STRENGTH = 0.8
const PROP_MAGNETIC_RADIUS = 110

const BEAM_LOCAL_TARGET: [number, number, number] = [1.0430, 0.4250, -0.3359]
const BEAM_LOCAL_LENGTH = 1.1753
const BEAM_LOCAL_ROTATION: [number, number, number] = [-0.2951, 0.1874, -1.1273]
const BEAM_DIRECTION: [number, number, number] = [
  BEAM_LOCAL_TARGET[0] / BEAM_LOCAL_LENGTH,
  BEAM_LOCAL_TARGET[1] / BEAM_LOCAL_LENGTH,
  BEAM_LOCAL_TARGET[2] / BEAM_LOCAL_LENGTH,
]
const BEAM_HOLD_SECONDS = 2.8
const BEAM_RETRACT_SECONDS = 0.45

export function Pokeball({ onRelease, ...props }: { onRelease?: () => void; [key: string]: any }) {
  const rootRef = useRef<THREE.Group>(null)
  const ballGroupRef = useRef<THREE.Group>(null)
  const beamRef = useRef<THREE.Mesh>(null)
  const beamGlowRef = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)

  const [click, setClicked] = useState(false)
  const [hovered, set] = useState(false)
  const [showEnergy, setShowEnergy] = useState(false)
  const uProgress = useRef(0)
  const beamElapsed = useRef(0)

  const ballGltf = useGLTF('/models/pokeball.glb') as any

  if (ballGltf.animations && ballGltf.animations[0]) {
    ballGltf.animations[0].name = "Pokeball"
  }
  const { actions } = useAnimations(ballGltf.animations, ballGroupRef)

  const particleCount = 100
  const particleData = useRef<THREE.Vector3[]>([])

  useEffect(() => {
    if (click && actions["Pokeball"]) {
      actions["Pokeball"].reset()
      actions["Pokeball"].setLoop(THREE.LoopOnce, 1)
      actions["Pokeball"].clampWhenFinished = true
      actions["Pokeball"].play()

      setShowEnergy(true)
      uProgress.current = 0
      beamElapsed.current = 0
      onRelease?.()

      const velocities: THREE.Vector3[] = []
      for (let i = 0; i < particleCount; i++) {
        velocities.push(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.16,
            (Math.random() - 0.1) * 0.24,
            (Math.random() - 0.5) * 0.16
          )
        )
      }
      particleData.current = velocities

      const halfDurationMs = (actions["Pokeball"].getClip().duration * 1000) / 2
      const timer = setTimeout(() => {
        if (actions["Pokeball"]) actions["Pokeball"].paused = true
      }, halfDurationMs)

      return () => clearTimeout(timer)
    } else {
      setShowEnergy(false)
      if (beamRef.current) beamRef.current.scale.set(0, 0, 0)
      if (beamGlowRef.current) beamGlowRef.current.scale.set(0, 0, 0)
    }
  }, [click, actions])

  useFrame((state, delta) => {
    if (showEnergy) {
      beamElapsed.current += delta
      if (beamRef.current && beamGlowRef.current) {
        if (beamElapsed.current >= BEAM_HOLD_SECONDS) {
          const s = Math.min((beamElapsed.current - BEAM_HOLD_SECONDS) / BEAM_RETRACT_SECONDS, 1)
          const shrink = 1 - s
          beamRef.current.position.set(
            BEAM_DIRECTION[0] * BEAM_LOCAL_LENGTH * s,
            BEAM_DIRECTION[1] * BEAM_LOCAL_LENGTH * s,
            BEAM_DIRECTION[2] * BEAM_LOCAL_LENGTH * s
          )
          beamRef.current.scale.set(0.55 * shrink, 1 * shrink, 0.55 * shrink)
          beamGlowRef.current.position.copy(beamRef.current.position)
          beamGlowRef.current.scale.copy(beamRef.current.scale)
        } else if (beamRef.current.scale.y < 1.0) {
          beamRef.current.scale.y = THREE.MathUtils.lerp(beamRef.current.scale.y, 1.0, 0.38)
          beamRef.current.scale.x = THREE.MathUtils.lerp(beamRef.current.scale.x, 1.0, 0.38)
          beamRef.current.scale.z = THREE.MathUtils.lerp(beamRef.current.scale.z, 1.0, 0.38)
          beamGlowRef.current.scale.copy(beamRef.current.scale)
        } else {
          beamRef.current.scale.x = THREE.MathUtils.lerp(beamRef.current.scale.x, 0.55, 0.18)
          beamRef.current.scale.z = THREE.MathUtils.lerp(beamRef.current.scale.z, 0.55, 0.18)
          beamGlowRef.current.scale.copy(beamRef.current.scale)
        }
      }

      if (uProgress.current < 1.0) {
        uProgress.current += delta * 1.3
      }

      if (particlesRef.current && uProgress.current > 0.25) {
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array
        for (let i = 0; i < particleCount; i++) {
          const i3 = i * 3
          const vel = particleData.current[i]
          if (vel) {
            positions[i3] += vel.x
            positions[i3 + 1] += vel.y
            positions[i3 + 2] += vel.z
            vel.y -= 0.005
          }
        }
        particlesRef.current.geometry.attributes.position.needsUpdate = true

        const pointsMat = particlesRef.current.material as THREE.PointsMaterial
        if (pointsMat.opacity > 0) {
          pointsMat.opacity -= delta * 1.3
        }
      }
    } else {
      uProgress.current = 0
      if (particlesRef.current) {
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array
        for (let i = 0; i < positions.length; i++) positions[i] = 0
        particlesRef.current.geometry.attributes.position.needsUpdate = true
        ;(particlesRef.current.material as THREE.PointsMaterial).opacity = 0
      }
    }
  })

  useCursorHover(hovered)
  useShadows(rootRef)

  // Magnetic target on the ball group, not the root: the root also contains
  // the release beam and the sparkle cloud, which sit out by the avatar, so
  // its world origin is not where the ball appears.
  const clickRef = useRef(() => setClicked((c) => !c))
  clickRef.current = () => setClicked((c) => !c)
  const magnet = useRef<MagneticTarget | null>(null)
  useEffect(() => {
    if (!ballGroupRef.current) return
    const target: MagneticTarget = {
      object: ballGroupRef.current,
      type: 'interactive',
      strength: PROP_MAGNETIC_STRENGTH,
      radius: PROP_MAGNETIC_RADIUS,
      snapRadius: MAGNETIC_SNAP_RADIUS * 0.7,
      // Once released, clicking it again does nothing useful -- stop pulling.
      isEnabled: () => !click,
      activate: () => clickRef.current(),
    }
    magnet.current = target
    return registerMagneticTarget(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [click])

  const initialPointsArray = useMemo(() => new Float32Array(particleCount * 3), [])

  const coreGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.008, 0.028, BEAM_LOCAL_LENGTH, 16, 1, true)
    g.translate(0, BEAM_LOCAL_LENGTH / 2, 0)
    return g
  }, [])
  const glowGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.024, 0.07, BEAM_LOCAL_LENGTH, 16, 1, true)
    g.translate(0, BEAM_LOCAL_LENGTH / 2, 0)
    return g
  }, [])

  return (
    // useShadows skips transparent materials, so the ball itself casts but the
    // release beam and its glow cone -- both additive, both meshes -- don't
    // throw solid silhouettes across the sand.
    <group ref={rootRef} onPointerOver={() => set(true)} onPointerOut={() => set(false)} {...props}>
      {/* raycast disabled on all three release visuals below. They're
          additive VFX, but they still sit in the scene graph inside this
          group's onPointerOver -- and the sparkle <points> in particular
          defaults to a 1-unit raycast threshold with all its particles
          stacked on BEAM_LOCAL_TARGET, which lands (scale 2) essentially on
          top of the avatar. That's what made the avatar show a pointer
          cursor and read as clickable, when nothing there does anything. */}
      <mesh
        ref={beamRef}
        raycast={() => null}
        geometry={coreGeometry}
        position={[0, 0, 0]}
        rotation={BEAM_LOCAL_ROTATION}
        scale={[0, 0, 0]}
      >
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.95}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={beamGlowRef}
        raycast={() => null}
        geometry={glowGeometry}
        position={[0, 0, 0]}
        rotation={BEAM_LOCAL_ROTATION}
        scale={[0, 0, 0]}
      >
        <meshBasicMaterial
          color="#bfe9ff"
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Sparkle particles at the beam's target end, by the avatar */}
      <points ref={particlesRef} raycast={() => null} position={BEAM_LOCAL_TARGET}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[initialPointsArray, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#dffff5"
          size={0.16}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <group
        ref={ballGroupRef}
        onClick={() => {
          // Registry-routed so the direct and assisted clicks share a debounce.
          if (magnet.current) activateTarget(magnet.current)
          else clickRef.current()
        }}
        position={[0, 0, 0]}
      >
        <group name="Sketchfab_Scene">
          <group name="Sketchfab_model" rotation={[-Math.PI / 2, 0, 0]} scale={0.001}>
            <group name="5faf20c088894b0fa9f561ff1aaac8f1fbx" rotation={[Math.PI / 2, 0, 0]}>
              <group name="Object_2">
                <group name="RootNode">
                  {ballGltf.nodes._rootJoint && (
                    <group name="Armature001" position={[0, -98.936, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={100}>
                      <group name="Object_5">
                        <primitive object={ballGltf.nodes._rootJoint} />
                      </group>
                    </group>
                  )}
                  <group name="Point001" position={[-124.443, 214.926, 255.91]} scale={100}>
                    <group name="Object_23" rotation={[Math.PI / 2, 0, 0]}><group name="Object_24" /></group>
                  </group>
                  <group name="Point002" position={[54.155, 114.543, 126.39]} scale={100}>
                    <group name="Object_26" rotation={[Math.PI / 2, 0, 0]}><group name="Object_27" /></group>
                  </group>
                  <group name="Camera" position={[735.889, 495.831, 692.579]} rotation={[Math.PI, 0.756, 2.68]} scale={100}>
                    <group name="Object_29" />
                  </group>
                  <group name="Point" scale={100}>
                    <group name="Object_31" rotation={[Math.PI / 2, 0, 0]}><group name="Object_32" /></group>
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

useGLTF.preload('/models/pokeball.glb')
