import * as THREE from 'three'
import React, { useRef, useEffect, useState, useMemo } from 'react'
import { useGLTF, useAnimations, useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'

// Numerically solved from the pokeball's own fixed transform (Scene.tsx --
// position [-3.25,-1.5,0], rotation [0,-PI/4,0], scale 2) and the avatar's
// BASE_POSITION ([-1.3,-0.65,1] in AvatarController.tsx) -- same "solve
// once, hardcode the correction" approach as SUN_FACE_CORRECTION/
// MOON_FACE_CORRECTION in Environment.tsx. Goes stale if either position/
// rotation/scale changes.
//
// Derivation: world-space delta from the pokeball to the avatar is
// [1.95, 0.85, 1.0]. Undoing the pokeball's own Y-rotation and dividing by
// its scale lands that in the pokeball's own local space -- the vector a
// child mesh would need to reach the avatar, ignoring the group's own
// transform, which BEAM_LOCAL_TARGET below is exactly (also where the
// target-end particles sit); its length is the beam's length; the
// quaternion aligning +Y (the cylinder geometry's default long axis) to
// it, converted to Euler XYZ, is its rotation.
const BEAM_LOCAL_TARGET: [number, number, number] = [1.0430, 0.4250, -0.3359]
const BEAM_LOCAL_LENGTH = 1.1753
const BEAM_LOCAL_ROTATION: [number, number, number] = [-0.2951, 0.1874, -1.1273]
// Unit vector along the same ball->avatar direction as BEAM_LOCAL_TARGET,
// used during the retract phase to slide the beam's near (ball) end toward
// the far (avatar) end while shrinking, instead of just shrinking in place.
const BEAM_DIRECTION: [number, number, number] = [
  BEAM_LOCAL_TARGET[0] / BEAM_LOCAL_LENGTH,
  BEAM_LOCAL_TARGET[1] / BEAM_LOCAL_LENGTH,
  BEAM_LOCAL_TARGET[2] / BEAM_LOCAL_LENGTH,
]
// Must stay >= Dragonite.tsx's HOLD_SECONDS plus its wipe duration (~0.6s)
// so the beam is still there, connected, for the entire time the avatar is
// white/fading in -- only retracting once the material has actually
// finished appearing.
const BEAM_HOLD_SECONDS = 2.8
const BEAM_RETRACT_SECONDS = 0.45

export function Pokeball({ onRelease, ...props }: { onRelease?: () => void; [key: string]: any }) {
  const ballGroupRef = useRef<THREE.Group>(null)
  const beamRef = useRef<THREE.Mesh>(null)
  const beamGlowRef = useRef<THREE.Mesh>(null)
  const particlesRef = useRef<THREE.Points>(null)

  const [click, setClicked] = useState(false)
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
      // Fires at the click itself, not once the beam/particle buildup below
      // finishes -- the avatar needs to already be a white-glowing dragonite
      // for the beam to visibly connect *to*, not swap in only after the
      // beam's already fully built. The beam/particle animation below is
      // purely visual from here on and doesn't drive anything external.
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
      // Extend along the beam's own long axis (local Y, always -- scale is
      // applied before the BEAM_LOCAL_ROTATION tips the whole mesh to aim
      // at the avatar, so Y stays "along the tube" regardless of which way
      // it ends up pointing). Girth (X/Z) fills in alongside the
      // extension, then thins back toward a slender resting width once
      // fully extended -- the base geometry itself is already thin (see
      // the cylinder radii below), this just avoids a momentary fat flash
      // while it's still growing. Once BEAM_HOLD_SECONDS has passed --
      // matching how long the dragonite takes to fully materialize -- the
      // beam retracts: its near (ball) end slides toward the far (avatar)
      // end while both shrink together, so it reads as the last of the
      // light being drawn into/absorbed by the now-materialized dragonite,
      // rather than just popping out or retreating back into the ball.
      // The glow layer mirrors the core's position/scale throughout, so
      // the two stay concentric.
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
        // Also zero opacity, not just position -- 100 additively-blended,
        // fully-opaque points stacked on one spot read as a small bright
        // dot even at rest, which is what this was doing pre-click before
        // this fix (positions alone don't hide overlapping opaque points).
        ;(particlesRef.current.material as THREE.PointsMaterial).opacity = 0
      }
    }
  })

  useCursor(click)

  const initialPointsArray = useMemo(() => new Float32Array(particleCount * 3), [])

  // Cylinders are centered on their own origin by default (span
  // -length/2..+length/2), which is why the beam used to visibly grow
  // outward from its own midpoint in both directions at once instead of
  // shooting from the ball. Translating the geometry itself so it spans
  // 0..length moves its local origin to one end (the ball end, since that's
  // the thicker/bottom radius -- see BEAM_LOCAL_ROTATION's derivation
  // comment, +Y points toward the avatar) -- with the mesh positioned at
  // the pokeball's own origin, growing scale.y from 0 now keeps that end
  // anchored at the ball while the far end extends toward the avatar.
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
    <group {...props}>

      {/* Beam of light connecting the ball to the avatar -- geometry
          solved once, see BEAM_LOCAL_* above. Two concentric layers: a
          thin, near-white-hot core plus a wider, softer additive glow
          around it (rather than one thick solid cone), which is what
          actually reads as a slender beam of light instead of a funnel. */}
      <mesh
        ref={beamRef}
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
      <points ref={particlesRef} position={BEAM_LOCAL_TARGET}>
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

      {/* Poké Ball GLTF Assembly Group Node */}
      <group ref={ballGroupRef} onClick={() => setClicked(!click)} position={[0, 0, 0]}>
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
