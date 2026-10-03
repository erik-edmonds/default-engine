import * as THREE from 'three'
import React, { forwardRef, useRef, useEffect, useImperativeHandle, useState, useMemo } from 'react'
import { useAnimations } from '@react-three/drei'
import { useGLTF } from '@/helpers/useGLTF'
import { useCursorHover } from '@/helpers/useCursorHover'
import { useFrame } from '@react-three/fiber'

import { useShadows } from '@/helpers/useShadows'
import { MAGNETIC_SNAP_RADIUS, activateTarget, registerMagneticTarget, type MagneticTarget } from '@/helpers/cursor'
import { ISLAND_CAMERA_POSITION } from '@/config/positions'

/** Same as the other props: noticed, not captured by. */
const PROP_MAGNETIC_STRENGTH = 1.05
const PROP_MAGNETIC_RADIUS = 155

/** How near the home viewpoint the camera must be for the ball to work.
 *
 *  THE BALL USED TO BE CLICKABLE FROM ANYWHERE, including from inside the
 *  Models portal, where it launched the sky sequence out from under whatever
 *  you were looking at. It is mounted permanently -- Scene.tsx renders it
 *  under an `islandMounted` that never flips back -- so "is it reachable" was
 *  never asked.
 *
 *  Decided from the LIVE CAMERA rather than from the journey's index, which
 *  is the authority app/page.tsx argues for in the same situation: "the index
 *  and the camera come apart the moment you drag to orbit". CameraHotspot
 *  settles the identical question the same way, and these are its radii. */
const AT_HOME_RADIUS = 6
const LEFT_HOME_RADIUS = 8

/** THE BEAM AIMS AT THE AVATAR, IT IS NOT AIMED BY HAND ANY MORE.
 *
 *  It used to be three baked constants -- a target, a length and an Euler
 *  rotation -- all in the ball's own local space, measured once against the
 *  ball standing at [-3.25, -1.5, 0]. Moving the ball out from behind the
 *  About Me sign moved the beam with it, so the release fired off into empty
 *  sand: "since the pokeball moved, the light needs to be fixed. The light is
 *  all off, it no longer align with the dragonite."
 *
 *  Baking the relationship was the fault, not the numbers. The beam's whole
 *  job is to point at the thing being released, so it reads the avatar's
 *  actual world position at the moment it fires and orients itself. The ball
 *  can now be put anywhere on the beach and the beam still lands on him.
 *
 *  BEAM_UNIT_LENGTH is just the cylinder's authored height -- the geometry is
 *  built once at this length and the aim group scales it to whatever the real
 *  distance turns out to be. */
const BEAM_UNIT_LENGTH = 1.1753
/** Where on the avatar the beam lands, above his origin (which is at his
 *  feet). Chest height, so the release reads as hitting the figure rather
 *  than the sand he stands on. */
const BEAM_AIM_UP = 1.1
/** The cylinder is built along +Y, so this is the axis the aim rotates FROM. */
const BEAM_AXIS = new THREE.Vector3(0, 1, 0)
/** The beam is a beat, not a scene.
 *
 *  It held for 2.8 seconds and took another 0.45 to pull back -- three and a
 *  quarter seconds of standing still before the sequence could get going, on
 *  top of the materialise and the two-second dolly. About a second total is
 *  what it is worth. */
const BEAM_HOLD_SECONDS = 0.5
const BEAM_RETRACT_SECONDS = 0.3

export interface PokeballHandle {
  /** Shut the lid and arm it to be opened again.
   *
   *  Without this the ball could not be closed at all: `click` was a bare
   *  toggle and the open clip was hard-paused at half its duration, so after a
   *  trip to the sky the lid stayed open AND `click` stayed true. The next
   *  click merely toggled it false -- beam off, lid still open, onRelease NOT
   *  fired -- and only the one after that re-entered the sky. That is the
   *  double-click. */
  close: () => void
}

export const Pokeball = forwardRef<PokeballHandle, { onRelease?: () => void; [key: string]: any }>(
function Pokeball({ onRelease, ...props }, ref) {
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
  /** The group that carries the beam's direction and length. The two beam
   *  meshes animate INSIDE it along a plain +Y, so the grow and the retract
   *  stay exactly as authored and only the aim is new. */
  const beamAimRef = useRef<THREE.Group>(null)
  /** Set on each firing; consumed by the first frame after it, which is the
   *  first moment the avatar's world matrix is certain to be current. */
  const needsAim = useRef(false)

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
      // EVERYTHING THE LAST FIRING LEFT BEHIND.
      //
      // This component is mounted permanently (Scene.tsx renders it under an
      // `islandMounted` that never flips back), so every ref and every material
      // instance survives a trip to the sky and home again. Two pieces of state
      // were written on the way out and never put back, which is why the beam
      // was wrong on the SECOND firing and every one after:
      //
      //   - the retract walks beamRef/beamGlowRef out to BEAM_LOCAL_TARGET,
      //     which is over by the avatar, and always completes (hold 2.8s +
      //     retract 0.45s, long before you go home). The close path below
      //     resets scale but not position, so the next firing grew the beam
      //     from the avatar's position instead of out of the ball.
      //   - the sparkles' opacity is decayed to 0 by the frame loop and only
      //     ever forced to 0 again when idle, never back to 1. The material is
      //     built once from JSX, so the burst fired exactly once per page load.
      //
      // Dragonite.tsx does the same thing for its own whiteMaterial on every
      // materialize(); this is that pattern, applied to the pieces that needed
      // it and did not have it.
      beamRef.current?.position.set(0, 0, 0)
      beamGlowRef.current?.position.set(0, 0, 0)
      // Re-aimed on every firing rather than once: the avatar can be in a
      // different place (and is, after a trip to the sky and back), and the
      // ball itself can be moved in the scene without this file knowing.
      needsAim.current = true
      if (particlesRef.current) {
        ;(particlesRef.current.material as THREE.PointsMaterial).opacity = 1
      }
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
      // Position as well as scale -- see the reset list in the open branch.
      if (beamRef.current) {
        beamRef.current.scale.set(0, 0, 0)
        beamRef.current.position.set(0, 0, 0)
      }
      if (beamGlowRef.current) {
        beamGlowRef.current.scale.set(0, 0, 0)
        beamGlowRef.current.position.set(0, 0, 0)
      }
      // Rewind the lid.
      //
      // This branch used to kill the beam and the sparkles and leave the clip
      // exactly where the open path parked it -- paused at half its duration,
      // i.e. open -- so the ball never actually shut in either state.
      // `paused = false` comes first, because a stopped-but-paused action just
      // stays where it is.
      const action = actions["Pokeball"]
      if (action) {
        action.paused = false
        action.stop()
        action.reset()
      }
    }
  }, [click, actions])

  useImperativeHandle(ref, () => ({ close: () => setClicked(false) }), [])

  useFrame((state, delta) => {
    if (showEnergy) {
      // AIM AT WHERE HE ACTUALLY IS, on the first frame of the firing.
      //
      // Done here and not in the click handler because the avatar's world
      // matrix is only guaranteed current once the frame loop is running --
      // and r3f updates matrices between commit and render, so a value read
      // during the click can be one frame stale.
      if (needsAim.current && beamAimRef.current && rootRef.current) {
        const avatar = state.scene.getObjectByName("avatar-root")
        if (avatar) {
          needsAim.current = false
          const aim = avatar.getWorldPosition(new THREE.Vector3())
          aim.y += BEAM_AIM_UP
          // Into the ball group's own space, so the result is independent of
          // the group's position, its -45 degree yaw and its scale.
          const local = rootRef.current.worldToLocal(aim)
          const length = local.length()
          if (length > 1e-4) {
            beamAimRef.current.quaternion.setFromUnitVectors(
              BEAM_AXIS,
              local.clone().normalize(),
            )
            // One uniform scale, so the beam keeps its taper instead of being
            // stretched; the geometry is authored at BEAM_UNIT_LENGTH.
            beamAimRef.current.scale.setScalar(length / BEAM_UNIT_LENGTH)
            // The sparkles burst where the beam lands. They live outside the
            // aim group so their velocities stay in the ball's own units.
            particlesRef.current?.position.copy(local)
          }
        }
      }
      beamElapsed.current += delta
      if (beamRef.current && beamGlowRef.current) {
        if (beamElapsed.current >= BEAM_HOLD_SECONDS) {
          const s = Math.min((beamElapsed.current - BEAM_HOLD_SECONDS) / BEAM_RETRACT_SECONDS, 1)
          const shrink = 1 - s
          // Straight up the aim group's own axis: the direction lives on the
          // group now, so the retract is one component instead of three.
          beamRef.current.position.set(0, BEAM_UNIT_LENGTH * s, 0)
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
        // Clamped at zero. A long frame takes more than the whole remaining
        // opacity in one step -- measured at -0.95 under a slow renderer -- and
        // an opacity below zero is not a value the material has any meaning
        // for. It also masks the reset above: a burst that is re-armed to 1 and
        // then driven negative looks identical to one that never fired.
        if (pointsMat.opacity > 0) {
          pointsMat.opacity = Math.max(0, pointsMat.opacity - delta * 1.3)
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
  // WHETHER THE BALL IS REACHABLE AT ALL, from where the camera is standing.
  //
  // Hysteresis rather than one threshold, copied from CameraHotspot: a single
  // radius flickers while the camera drifts across it, and a prop that blinks
  // in and out of being clickable is worse than one that is simply off.
  const atHome = useRef(true)
  useFrame((state) => {
    const d = state.camera.position.distanceTo(ISLAND_CAMERA_POSITION)
    if (atHome.current && d > LEFT_HOME_RADIUS) atHome.current = false
    else if (!atHome.current && d < AT_HOME_RADIUS) atHome.current = true
  })

  const clickRef = useRef(() => setClicked((c) => !c))
  clickRef.current = () => {
    if (!atHome.current) return
    setClicked((c) => !c)
  }
  const magnet = useRef<MagneticTarget | null>(null)
  useEffect(() => {
    if (!ballGroupRef.current) return
    const target: MagneticTarget = {
      object: ballGroupRef.current,
      type: 'interactive',
      strength: PROP_MAGNETIC_STRENGTH,
      radius: PROP_MAGNETIC_RADIUS,
      snapRadius: MAGNETIC_SNAP_RADIUS,
      // Once released, clicking it again does nothing useful -- stop pulling.
      // And it does not exist at all from anywhere but home.
      isEnabled: () => !click && atHome.current,
      activate: () => clickRef.current(),
    }
    magnet.current = target
    return registerMagneticTarget(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [click])

  const initialPointsArray = useMemo(() => new Float32Array(particleCount * 3), [])

  const coreGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.008, 0.028, BEAM_UNIT_LENGTH, 16, 1, true)
    g.translate(0, BEAM_UNIT_LENGTH / 2, 0)
    return g
  }, [])
  const glowGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.024, 0.07, BEAM_UNIT_LENGTH, 16, 1, true)
    g.translate(0, BEAM_UNIT_LENGTH / 2, 0)
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
          stacked at the beam's far end, which lands essentially on top of
          the avatar. That's what made the avatar show a pointer cursor and
          read as clickable, when nothing there does anything. */}
      {/* THE AIM GROUP. Carries the direction to the avatar and the distance
          to him; the two meshes inside animate along a plain +Y, which is
          what lets the grow and the retract stay exactly as they were while
          the aim became dynamic. Written once per firing in the frame loop
          above -- see the note on BEAM_UNIT_LENGTH. */}
      <group ref={beamAimRef}>
        <mesh
          ref={beamRef}
          raycast={() => null}
          geometry={coreGeometry}
          position={[0, 0, 0]}
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
      </group>

      {/* Sparkle particles at the beam's target end, by the avatar. Placed by
          the frame loop on each firing, for the same reason the beam is. */}
      <points ref={particlesRef} raycast={() => null}>
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
        // Named so a check can find it positively rather than guessing at
        // "Object_5" -- the same reasoning as island-terrain in Scene.tsx and
        // portal-frame-bar in HotspotPortal.tsx. The Sketchfab export names
        // every node Object_N, so there is nothing else to match on.
        name="pokeball"
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
})

useGLTF.preload('/models/pokeball.glb')
