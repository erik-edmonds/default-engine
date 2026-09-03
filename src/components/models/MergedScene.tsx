import React, { useRef, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF, useAnimations } from '@react-three/drei'

import { useOceanWaterMaterial } from '@/components/canvas/OceanWater'
import type { TimeOfDay } from '@/components/canvas/environmentPresets'
import { paintSandWetness, paintRockVariation } from '@/components/canvas/vertexColorNoise'
import { createWoodRoughnessTexture } from '@/components/canvas/proceduralTextures'

const ROCK_NODES = ['Object_46', 'Object_48', 'Object_50', 'Object_52', 'Object_54', 'Object_56', 'Object_44', 'Object_79', 'Object_77'] as const

export function Merged({ from, day, transitionSeconds, ...props }: { from: TimeOfDay, day: TimeOfDay, transitionSeconds?: number, [key: string]: unknown }) {
  const group = useRef()
  const { nodes, materials } = useGLTF('/models/merged.glb')
  const { animations } = useGLTF('/models/island_motion.glb')
  // island_motion.glb's bone names mostly don't match merged.glb's -- only
  // "Circle001" is shared between the two exports (see the long comment on
  // the Armature group below), so every other track in this clip can never
  // bind and only exists to spam "THREE.PropertyBinding: No target node
  // found" to the console. Building a fresh clip with just the track that
  // actually binds keeps the same swim animation and drops the noise, and
  // avoids mutating the name on the array useGLTF itself returns (cached
  // and shared across instances).
  const sharkAnimations = useMemo(() => {
    const source = animations[0]
    const tracks = source.tracks.filter((t) => t.name.startsWith('Circle001.'))
    return [new THREE.AnimationClip('Shark', source.duration, tracks)]
  }, [animations])
  const { actions } = useAnimations(sharkAnimations, group)
  const oceanMaterial = useOceanWaterMaterial(from, day, transitionSeconds)

  useEffect(() => {
    actions["Shark"]?.reset().play()
  }, [])

  // The shark's circular swim path comes from animating Circle001's
  // rotation (retargeted from island_motion.glb -- see the comment on the
  // Armature group below); the orbit's actual RADIUS is set by the rest
  // offset of Circle001's own child bone -- Circle001 spins it around
  // itself like an orbit arm.
  //
  // merged.glb has *two* nodes named "Shark": the real orbit-arm bone at
  // Armature > Circle001 > Shark (offset ~146 units pre-scale), and an
  // unrelated, static, zero-offset node at Armature > Shark (the mesh
  // group holding the skinnedMeshes below). gltfjsx dedupes colliding
  // names when it builds the flat `nodes` map, so the bone -- not the
  // group -- ends up keyed as `nodes.Shark_1`; a plain `nodes.Shark`
  // resolves to the static group instead. Mutating that did nothing
  // (confirmed: the shark's on-screen orbit was identical from
  // SHARK_ORBIT_SCALE=1 down to 0.05), which is why earlier attempts to
  // pull the orbit in never actually worked.
  //
  // Measured live (world-space, via the actual mounted scene graph, not
  // hand-chained transforms): with the correct bone now being moved, the
  // un-scaled orbit sweeps island-center distance ~17.4-20.3 world units
  // -- outside the water mesh's own measured ~15.2-unit radius, so still
  // needs pulling in, just from the right starting point this time. 0.55
  // brings that down to a range comfortably inside the water and outside
  // the ~7-unit island footprint.
  //
  // Y was originally left untouched (the animation's own depth), which
  // measured out to world Y ~-5.2 -- about 1.5 units *below* the water
  // surface (~-3.7, see OceanWater.ts/MergedScene's New_Water mesh), and
  // since the water material is fully opaque, that's completely invisible
  // from above. SHARK_Y_OFFSET adds a local +40 (world +40*0.025*3=+3,
  // same Armature*Merged 0.075 scale chain the orbit radius above already
  // goes through) so it swims just above the surface instead, clearly
  // visible.
  //
  // The skinned mesh (Mesh008/_1/_2) is entirely weight-bound to
  // Shark_1's own descendant chain -- Shark_1 > CATRigHub001 > CATRigTail1
  // > ... > CATRigTail4 (confirmed by summing skinWeight against every
  // bone index; the parallel "SheK*" humanoid-style chain that also lives
  // in this same skeleton.bones array carries *zero* weight anywhere and
  // can be ignored). That chain is fully, natively nested under Shark_1
  // (only Circle001 is separately mounted as a primitive below, and it
  // carries this whole subtree with it), so it was never disconnected by
  // anything in this file -- it just renders at its own bind-pose size,
  // and Mesh008's local bounding sphere (radius ~0.91) is small enough
  // that after the 0.075 Armature*Merged scale chain it comes out under a
  // tenth of a world unit, i.e. a barely-visible fleck regardless of
  // position. SHARK_MESH_SCALE grows the bone (and therefore its skinned
  // descendants) up to an actually shark-sized creature without touching
  // its bind matrices.
  //
  // Circle001's own animation (the only track that binds, per above) is a
  // continuous, full 360 rotation about a roughly-vertical axis, looping
  // every ~16.7s -- confirmed by parsing island_motion.glb's animation
  // data directly. Shark_1 is a *rigid* child of Circle001, and its own
  // rest rotation (baked into the GLB) points its forward axis radially
  // (toward/away from Circle001, the orbit hub) rather than tangentially
  // (in the direction of travel) -- a rigid radial spoke rotating with its
  // hub reads as a spinning pinwheel/rotor, not a swimming fish. This was
  // always true; it was only invisible before SHARK_MESH_SCALE because the
  // mesh rendered near-zero size. SHARK_HEADING_CORRECTION rotates the
  // bone's local frame (applied before its existing rest rotation, so it
  // doesn't disturb the orbit radius/depth already solved above) to point
  // tangentially instead -- once tangential, the *same* existing Circle001
  // rotation that used to look like spinning will instead correctly read
  // as circling/swimming, no per-frame counter-rotation needed.
  //
  // Getting the correction axis right took two failed attempts, both
  // confirmed wrong by live numeric measurement (not just visual guessing):
  // multiplying the correction directly onto bone.quaternion applies it
  // *inside* the bone's own already-tipped rest rotation, so its "Y axis"
  // isn't world-Y once that tipping composes on top -- a 90-degree attempt
  // that way swung the heading to point vertically instead of sweeping the
  // horizontal loop. The fix has to be built as a true world-space
  // rotation -- applied as the outermost factor onto the bone's fully
  // composed world quaternion, then converted back into the bone's local
  // space via its parent's inverse world quaternion (a similarity
  // transform) -- which a one-shot sweep (testing all 24 15-degree
  // world-space corrections in a single frame, logging forward.dot(radius)
  // and forward.y for each) confirmed swings forward cleanly through a
  // full circle while staying perfectly horizontal (y ~ 0 throughout).
  // That sweep put pure-radial-outward at 120 degrees (dot 1.0) and the two
  // tangential candidates at 30 and 210 degrees (dot ~ 0); 210 is the one
  // matching Circle001's own rotation *direction* (its quaternion w sweeps
  // monotonically +1 -> -1 -> +1 over the loop, i.e. a positive angle about
  // +Y -- direction-of-travel is that same radius rotated a further +90
  // degrees the same way, landing on 120 + 90 = 210), so the shark's nose
  // leads instead of trailing.
  useEffect(() => {
    const bone = nodes.Shark_1 as unknown as THREE.Bone | undefined
    if (bone && !bone.userData.orbitScaled) {
      const SHARK_ORBIT_SCALE = 0.55
      const SHARK_Y_OFFSET = 40
      const SHARK_MESH_SCALE = 25
      const SHARK_HEADING_CORRECTION_DEG = 210
      bone.position.x *= SHARK_ORBIT_SCALE
      bone.position.z *= SHARK_ORBIT_SCALE
      bone.position.y += SHARK_Y_OFFSET
      bone.scale.setScalar(SHARK_MESH_SCALE)
      bone.userData.orbitScaled = true

      // The rotation correction below reads Circle001's *world* quaternion
      // to build a similarity transform (see the derivation above) -- that
      // has to happen after the animation mixer has actually applied at
      // least one sampled pose, not synchronously here. useAnimations'
      // mixer only updates on the next render frame; reading the parent's
      // world quaternion synchronously in this effect catches it still at
      // its raw bind-pose rotation (whatever that happens to be, unrelated
      // to the animation curve), producing a bogus correction -- confirmed
      // live (read here synchronously, the shark's forward ended up
      // pointing straight up, fwd.y = 1.0, not tangential at all).
      // Deferring one frame with requestAnimationFrame is what the sweep
      // that solved SHARK_HEADING_CORRECTION_DEG itself already did, which
      // is why that test's numbers were trustworthy and this wasn't.
      requestAnimationFrame(() => {
        const restLocalQuat = bone.quaternion.clone()
        const parentWorldQuat = new THREE.Quaternion()
        bone.parent?.getWorldQuaternion(parentWorldQuat)
        const correction = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          THREE.MathUtils.degToRad(SHARK_HEADING_CORRECTION_DEG)
        )
        const desiredWorldQuat = correction.multiply(parentWorldQuat).multiply(restLocalQuat)
        bone.quaternion.copy(parentWorldQuat.clone().invert().multiply(desiredWorldQuat))
      })
    }
  }, [nodes])

  useEffect(() => {
    paintSandWetness(nodes.Island.geometry)
    ROCK_NODES.forEach((n, i) => paintRockVariation(nodes[n].geometry, i * 11.3))
  }, [nodes])

  const sandMaterial = useMemo(() => {
    const m = (materials['01 - Default'] as THREE.MeshStandardMaterial).clone()
    m.vertexColors = true
    return m
  }, [materials])

  const rockMaterial = useMemo(() => {
    const m = (materials.Rock as THREE.MeshStandardMaterial).clone()
    m.vertexColors = true
    return m
  }, [materials])

  const dockDeckMaterial = useMemo(() => {
    const m = (materials['02 - Default'] as THREE.MeshStandardMaterial).clone()
    m.roughness = 1.0
    m.roughnessMap = createWoodRoughnessTexture()
    return m
  }, [materials])

  const dockPostMaterial = useMemo(() => {
    const m = (materials['08 - Default'] as THREE.MeshStandardMaterial).clone()
    m.roughness = 1.0
    m.roughnessMap = createWoodRoughnessTexture()
    return m
  }, [materials])

  return (
    <group ref={group} {...props} dispose={null}>
      <group name="Scene">
        {/* No rotation here (gltfjsx originally emitted [Math.PI/2, 0, 0],
            Armature's own rest-pose quaternion from merged.glb). The shark's
            swim-path animation comes from a *separate* file
            (island_motion.glb) applied via useAnimations by matching node
            names -- "Circle001" is the one bone name shared by both files,
            so it's the only track that actually binds (every other bone
            name differs by a numeric suffix between the two exports and
            silently fails to bind, per the "No target node found" warnings
            in the console). That static X rotation was composing with
            Circle001's own animated rotation and tipping the whole orbit
            into a vertical loop (shark rising high above the island and
            diving well below it) instead of a flat circle at a fixed depth.
            Removing it keeps the animated circle level, under the water. */}
        <group name="Armature" scale={0.025}>
          {/* Hidden for now -- the heading/orbit math checks out live
              (verified numerically, stable across the full loop), but
              something about how it actually reads on screen still isn't
              right and chasing it further isn't a good use of time right
              now. Animation/bone updates above keep running harmlessly;
              this just stops it from rendering. */}
          <group name="Shark" visible={false}>
            <skinnedMesh
              name="Mesh008"
              geometry={nodes.Mesh008.geometry}
              material={materials['10 - Default']}
              skeleton={nodes.Mesh008.skeleton}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Mesh008_1"
              geometry={nodes.Mesh008_1.geometry}
              material={materials['11 - Default']}
              skeleton={nodes.Mesh008_1.skeleton}
              frustumCulled={false}
            />
            <skinnedMesh
              name="Mesh008_2"
              geometry={nodes.Mesh008_2.geometry}
              material={materials['06 - Default']}
              skeleton={nodes.Mesh008_2.skeleton}
              frustumCulled={false}
            />
          </group>
          <primitive object={nodes.Circle001} />
          <primitive object={nodes.SheKPelvis} />
          <primitive object={nodes.SheKLLegPlatform} />
          <primitive object={nodes.SheKRLegPlatform} />
        </group>
        <mesh
          name="Island"
          castShadow
          receiveShadow
          geometry={nodes.Island.geometry}
          material={sandMaterial}
          scale={0.025}
        />
        <mesh
          name="New_Water"
          geometry={nodes.New_Water.geometry}
          material={oceanMaterial}
          position={[-0.162, 0.687, 0.064]}
          scale={0.028}
        />
        {/* oceanMaterial is a fully custom, unlit ShaderMaterial (see
            OceanWater.ts) -- it never samples Three's shadow maps, so the
            water above never showed any shadow cast onto it. Rather than
            hand-rolling shadow-map GLSL into that custom shader (real risk
            of getting the light-space matrices/PCF sampling subtly wrong),
            this is a second, coincident mesh using Three's own stock
            ShadowMaterial: fully transparent everywhere *except* where a
            real shadow map says a fragment is occluded, where it darkens by
            `opacity`. polygonOffset pushes it behind the water mesh's own
            depth just enough to avoid z-fighting between two literally
            coincident surfaces, with no visible position change. */}
        <mesh geometry={nodes.New_Water.geometry} position={[-0.162, 0.687, 0.064]} scale={0.028} receiveShadow>
          {/* Tinted toward deep water rather than left neutral grey, and
              eased back from 0.35: the key's shadow map went from 0.117 to
              0.025 world units per texel, so what used to be a soft smudge
              now lands as a defined shape and reads much heavier at the same
              opacity. */}
          <shadowMaterial transparent opacity={0.28} color="#0a2836" polygonOffset polygonOffsetFactor={-1} />
        </mesh>
        <group
          name="Dock"
          position={[-1.824, 0.876, 0.415]}
          rotation={[Math.PI / 2, 0, Math.PI / 2]}
          scale={[0.025, 0.033, 0.025]}>
          <mesh
            name="Mesh003"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003.geometry}
            material={dockDeckMaterial}
          />
          <mesh
            name="Mesh003_1"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_1.geometry}
            material={dockDeckMaterial}
          />
          <mesh
            name="Mesh003_2"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_2.geometry}
            material={dockDeckMaterial}
          />
          <mesh
            name="Mesh003_3"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_3.geometry}
            material={dockDeckMaterial}
          />
          <mesh
            name="Mesh003_4"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_4.geometry}
            material={dockDeckMaterial}
          />
          <mesh
            name="Mesh003_5"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_5.geometry}
            material={dockDeckMaterial}
          />
          <mesh
            name="Mesh003_6"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_6.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_7"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_7.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_8"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_8.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_9"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_9.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_10"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_10.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_11"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_11.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_12"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_12.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_13"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_13.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_14"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_14.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_15"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_15.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_16"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_16.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_17"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_17.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_18"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_18.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_19"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_19.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_20"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_20.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_21"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_21.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_22"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_22.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_23"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_23.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_24"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_24.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_25"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_25.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_26"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_26.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_27"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_27.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_28"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_28.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_29"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_29.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_30"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_30.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_31"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_31.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_32"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_32.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_33"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_33.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_34"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_34.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_35"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_35.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_36"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_36.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_37"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_37.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_38"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_38.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_39"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_39.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_40"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_40.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_41"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_41.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_42"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_42.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_43"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_43.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_44"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_44.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_45"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_45.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_46"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_46.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_47"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_47.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_48"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_48.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_49"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_49.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_50"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_50.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_51"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_51.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_52"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_52.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_53"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_53.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_54"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_54.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_55"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_55.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_56"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_56.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_57"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_57.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_58"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_58.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_59"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_59.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_60"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_60.geometry}
            material={dockPostMaterial}
          />
          <mesh
            name="Mesh003_61"
            castShadow
            receiveShadow
            geometry={nodes.Mesh003_61.geometry}
            material={dockPostMaterial}
          />
        </group>
        {/* <group
          name="Tree3"
          position={[0.999, 1.216, -0.112]}
          rotation={[0, -Math.PI / 9, 0]}
          scale={[0.004, 0.061, 0.004]}>
          <mesh
            name="Mesh002"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh002_1"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_1.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh002_2"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_2.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh002_3"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_3.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_4"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_4.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_5"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_5.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_6"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_6.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_7"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_7.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_8"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_8.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_9"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_9.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh002_10"
            castShadow
            receiveShadow
            geometry={nodes.Mesh002_10.geometry}
            material={materials['03 - Default']}
          />
        </group> */}
        <group
          name="Shack"
          position={[-0.037, 1.09, 0.707]}
          rotation={[0, -1.134, 0]}
          scale={0.031}>
          <mesh
            name="Mesh007"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh007_1"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_1.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_2"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_2.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_3"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_3.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_4"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_4.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_5"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_5.geometry}
            material={materials['08 - Default']}
          />
          <mesh
            name="Mesh007_6"
            castShadow
            receiveShadow
            geometry={nodes.Mesh007_6.geometry}
            material={materials['08 - Default']}
          />
        </group>
        {/* <group
          name="Tree2"
          position={[0.035, 1.281, -0.982]}
          rotation={[0, -0.96, 0]}
          scale={[0.004, 0.053, 0.004]}>
          <mesh
            name="Mesh001"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001.geometry}
            material={materials['02 - Default']}
          />
          <mesh
            name="Mesh001_1"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_1.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_2"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_2.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_3"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_3.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_4"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_4.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_5"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_5.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_6"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_6.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_7"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_7.geometry}
            material={materials['03 - Default']}
          />
          <mesh
            name="Mesh001_8"
            castShadow
            receiveShadow
            geometry={nodes.Mesh001_8.geometry}
            material={materials['03 - Default']}
          />
        </group> */}
        <group
          name="Sketchfab_model"
          position={[7.324, 5.463, -2.3]}
          rotation={[-Math.PI / 2, 0, -1.426]}
          scale={0.376}>
          <group name="root">
            <group name="GLTF_SceneRootNode" rotation={[Math.PI / 2, 0, 0]}>
              <group
                name="BigTree_8"
                position={[-12.046, -8.677, 6.498]}
                rotation={[Math.PI, -1.112, Math.PI]}
                scale={0.146}>
                <group name="BigTreeLeafs_7" position={[11.837, 16.753, 1.752]} scale={6.837}>
                  <mesh
                    name="Object_26"
                    castShadow
                    receiveShadow
                    geometry={nodes.Object_26.geometry}
                    material={materials.TreeGreen}
                  />
                </group>
                <mesh
                  name="Object_24"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_24.geometry}
                  material={materials.TreeBrownPlus}
                />
              </group>
              <group name="Clouds_26" position={[-1.936, 8.104, -1.123]} scale={0.781} />
              <group name="Icosphere001_12" position={[0.382, 1.882, 1.249]} scale={0.309}>
                <mesh
                  name="Object_33"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_33.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_34"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_34.geometry}
                  material={materials['Material.004']}
                />
              </group>
              <group
                name="Icosphere002_13"
                position={[-8.801, -9.255, 7.355]}
                rotation={[0, 0.408, 0]}>
                <mesh
                  name="Object_36"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_36.geometry}
                  material={materials.IsleGround}
                />
                <mesh
                  name="Object_37"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_37.geometry}
                  material={materials.IsleGreen}
                />
              </group>
              <group
                name="Icosphere003_14"
                position={[5.84, -6.843, -5.808]}
                rotation={[-0.57, -0.314, -0.153]}>
                <mesh
                  name="Object_39"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_39.geometry}
                  material={materials.IsleGround}
                  position={[13.913, -4.131, 5.916]}
                />
                <mesh
                  name="Object_40"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_40.geometry}
                  material={materials.IsleGreen}
                  position={[13.913, -4.131, 5.916]}
                />
              </group>
              <group
                name="Icosphere004_15"
                position={[-1.107, -8.299, -6.856]}
                rotation={[0.104, -0.028, 0.393]}>
                <mesh
                  name="Object_42"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_42.geometry}
                  material={materials['IsleGround.001']}
                  position={[9.511, -2.713, 10.598]}
                />
              </group>
              <group name="Icosphere_27" scale={10}>
                <mesh
                  name="Object_75"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_75.geometry}
                  material={materials.IcoSphere_Material}
                />
              </group>
              <group name="Plane001_0" position={[-0.461, 0, 0]} scale={8.295}>
                <mesh
                  name="Object_4"
                  geometry={nodes.Object_4.geometry}
                  material={oceanMaterial}
                />
              </group>
              <group
                name="Plane003_1"
                position={[-2.881, 1.609, -6.945]}
                rotation={[0.083, -0.03, 0.138]}
                scale={0.179}>
                <mesh
                  name="Object_6"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_6.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_7"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_7.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Plane004_2"
                position={[-3.436, 1.402, -6.611]}
                rotation={[0.037, -0.007, 0.077]}
                scale={0.165}>
                <mesh
                  name="Object_10"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_10.geometry}
                  material={materials['Material.006']}
                />
                <mesh
                  name="Object_9"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_9.geometry}
                  material={materials['Material.005']}
                />
              </group>
              <group
                name="Plane005_3"
                position={[-4.416, 0.958, -6.056]}
                rotation={[-0.05, 0.046, -0.039]}
                scale={0.199}>
                <mesh
                  name="Object_12"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_12.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_13"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_13.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Plane006_4"
                position={[-2.954, 0.74, -4.519]}
                rotation={[0.016, 0.032, -0.12]}
                scale={0.181}>
                <mesh
                  name="Object_15"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_15.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_16"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_16.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Plane007_5"
                position={[-7.019, 1.161, 2.91]}
                rotation={[-0.018, 0.06, 0.048]}
                scale={0.106}>
                <mesh
                  name="Object_18"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_18.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_19"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_19.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Plane008_6"
                position={[6.741, 1.416, -2.277]}
                rotation={[0.137, 0.09, -0.041]}
                scale={0.131}>
                <mesh
                  name="Object_21"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_21.geometry}
                  material={materials['Material.005']}
                />
                <mesh
                  name="Object_22"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_22.geometry}
                  material={materials['Material.006']}
                />
              </group>
              <group
                name="Rock001_17"
                position={[-0.496, 1.238, 6.849]}
                rotation={[-0.726, -0.185, -1.653]}
                scale={[0.661, 0.648, 0.778]}>
                <mesh
                  name="Object_46"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_46.geometry}
                  material={rockMaterial}
                />
              </group>
              <group
                name="Rock002_18"
                position={[8.043, -1.566, 4.396]}
                rotation={[-1.579, -0.154, -0.134]}
                scale={[1.826, 2.348, 1.826]}>
                <mesh
                  name="Object_48"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_48.geometry}
                  material={rockMaterial}
                />
              </group>
              <group
                name="Rock003_19"
                position={[2.338, -5.177, -7.975]}
                rotation={[-1.089, 0.065, -0.039]}
                scale={[3.973, 3.192, 3.629]}>
                <mesh
                  name="Object_50"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_50.geometry}
                  material={rockMaterial}
                  position={[2.688, -3.062, 1.655]}
                />
              </group>
              <group
                name="Rock004_20"
                position={[-5.456, 3.06, -2.726]}
                rotation={[-1.839, -0.188, -0.319]}
                scale={[2.478, 1.991, 2.263]}>
                <mesh
                  name="Object_52"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_52.geometry}
                  material={rockMaterial}
                />
              </group>
              <group
                name="Rock005_21"
                position={[5.769, 1.566, 6.338]}
                rotation={[0.049, 0.883, 0.089]}
                scale={[0.658, 1.241, 0.999]}>
                <mesh
                  name="Object_54"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_54.geometry}
                  material={rockMaterial}
                />
              </group>
              <group
                name="Rock006_22"
                position={[6.565, 1.381, 5.744]}
                rotation={[0.058, -0.998, 0.176]}
                scale={[0.661, 1.52, 0.999]}>
                <mesh
                  name="Object_56"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_56.geometry}
                  material={rockMaterial}
                />
              </group>
              <group
                name="Rock_16"
                position={[6.244, 2.286, 5.913]}
                rotation={[0.191, 0.701, 1.385]}
                scale={[0.661, 1.692, 1.013]}>
                <mesh
                  name="Object_44"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_44.geometry}
                  material={rockMaterial}
                />
              </group>
              <group
                name="RockTree001_29"
                position={[4.718, -5.735, -7.473]}
                rotation={[-0.009, 1.129, -0.225]}
                scale={[0.364, 0.291, 0.305]}>
                <mesh
                  name="Object_79"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_79.geometry}
                  material={rockMaterial}
                  position={[-15.564, -4.832, 47.639]}
                />
              </group>
              <group
                name="RockTree_28"
                position={[-8.361, -7.07, 6.931]}
                rotation={[0.099, 1.152, -0.244]}
                scale={[0.597, 0.476, 0.5]}>
                <mesh
                  name="Object_77"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_77.geometry}
                  material={rockMaterial}
                />
              </group>
              <group
                name="Tree001_11"
                position={[8.017, 1.063, 4.262]}
                rotation={[Math.PI, -0.455, Math.PI]}
                scale={0.14}>
                <mesh
                  name="Object_28"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_28.geometry}
                  material={materials.TreeBrown}
                />
                <mesh
                  name="Object_29"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_29.geometry}
                  material={materials.TreeBrownPlus}
                />
                <mesh
                  name="Object_30"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_30.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_31"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_31.geometry}
                  material={materials['Material.004']}
                />
              </group>
              <group
                name="Tree002_23"
                position={[-2.099, 0.748, 6.783]}
                rotation={[0.268, -0.973, 0.241]}
                scale={0.099}>
                <mesh
                  name="Object_58"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_58.geometry}
                  material={materials.TreeBrown}
                />
                <mesh
                  name="Object_59"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_59.geometry}
                  material={materials.TreeBrownPlus}
                />
                <mesh
                  name="Object_60"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_60.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_61"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_61.geometry}
                  material={materials['Material.004']}
                />
              </group>
              <group
                name="Tree003_24"
                position={[1.888, 0.415, 1.841]}
                rotation={[2.8, 0.867, -2.794]}
                scale={0.115}>
                <mesh
                  name="Object_63"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_63.geometry}
                  material={materials.TreeBrown}
                />
                <mesh
                  name="Object_64"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_64.geometry}
                  material={materials.TreeBrownPlus}
                />
                <mesh
                  name="Object_65"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_65.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_66"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_66.geometry}
                  material={materials['Material.004']}
                />
              </group>
              <group
                name="Tree004_25"
                position={[8.072, -1.182, -4.815]}
                rotation={[-2.646, -0.997, -1.917]}
                scale={0.14}>
                <mesh
                  name="Object_68"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_68.geometry}
                  material={materials.TreeBrown}
                />
                <mesh
                  name="Object_69"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_69.geometry}
                  material={materials.TreeBrownPlus}
                />
                <mesh
                  name="Object_70"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_70.geometry}
                  material={materials.TreeGreen}
                />
                <mesh
                  name="Object_71"
                  castShadow
                  receiveShadow
                  geometry={nodes.Object_71.geometry}
                  material={materials['Material.004']}
                />
              </group>
            </group>
          </group>
        </group>
        <group
          name="Sketchfab_model001"
          position={[0.958, 1.529, -1.118]}
          rotation={[-1.618, 0.059, -2.723]}
          scale={0.022}>
          <group
            name="e21c40cc12934092bee76191c3ab0ce8fbx"
            rotation={[Math.PI / 2, 0, 0]}
            scale={0.01}>
            <group name="RootNode" position={[0, 0, 0.001]}>
              <group
                name="Empty"
                position={[2338.5, -515.885, -983.755]}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={-3276.075}>
                <group
                  name="Cube"
                  position={[0.103, 0.284, -0.157]}
                  rotation={[0, 0.773, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube001"
                  position={[0.103, 0.317, -0.157]}
                  rotation={[0, -0.846, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube001_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube001_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube002"
                  position={[0.45, -0.027, 0.212]}
                  rotation={[0.033, -0.823, 1.595]}
                  scale={[-0.033, -0.018, -0.029]}>
                  <mesh
                    name="Cube002_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube002_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube003"
                  position={[-0.353, -0.032, 0.213]}
                  rotation={[0.03, 0.727, 1.551]}
                  scale={[-0.031, -0.018, -0.029]}>
                  <mesh
                    name="Cube003_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube003_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube004"
                  position={[0.103, -0.333, -0.157]}
                  rotation={[0, 0.773, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube004_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube004_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube005"
                  position={[0.103, -0.364, -0.157]}
                  rotation={[0, -0.846, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube005_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube005_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube006"
                  position={[-0.536, 0.251, 0.004]}
                  rotation={[0, -0.026, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube006_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube006_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube007"
                  position={[-0.536, -0.3, 0.004]}
                  rotation={[0, -0.026, 0]}
                  scale={[-0.031, -0.015, -0.031]}>
                  <mesh
                    name="Cube007_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube007_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube008"
                  position={[-0.473, -0.028, 0]}
                  rotation={[1.586, 1.548, -0.015]}
                  scale={[-0.027, -0.018, -0.029]}>
                  <mesh
                    name="Cube008_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube008_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cube009"
                  position={[0.359, -0.028, -0.424]}
                  rotation={[3.108, 0.825, -1.546]}
                  scale={[-0.031, -0.018, -0.029]}>
                  <mesh
                    name="Cube009_Material004_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cube009_Material004_0.geometry}
                    material={materials['Material.001']}
                  />
                </group>
                <group
                  name="Cylinder"
                  position={[0.089, 0.312, -0.177]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.027]}>
                  <mesh
                    name="Cylinder_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder001"
                  position={[0.089, -0.358, -0.177]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.027]}>
                  <mesh
                    name="Cylinder001_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder001_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder002"
                  position={[-0.473, 0.248, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.022]}>
                  <mesh
                    name="Cylinder002_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder002_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder003"
                  position={[-0.473, -0.299, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.022]}>
                  <mesh
                    name="Cylinder003_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder003_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder004"
                  position={[0.452, 0.312, 0.213]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.027]}>
                  <mesh
                    name="Cylinder004_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder004_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group
                  name="Cylinder005"
                  position={[0.452, -0.358, 0.213]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={[-0.009, -0.009, -0.027]}>
                  <mesh
                    name="Cylinder005_Material005_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Cylinder005_Material005_0.geometry}
                    material={materials['Material.002']}
                  />
                </group>
                <group name="Plane" position={[-0.241, -0.029, 0]} scale={[-0.265, -0.251, -0.265]}>
                  <mesh
                    name="Plane_Material002_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Plane_Material002_0.geometry}
                    material={materials['Material.003']}
                  />
                  <mesh
                    name="Plane_Material003_0"
                    castShadow
                    receiveShadow
                    geometry={nodes.Plane_Material003_0.geometry}
                    material={materials['Material.008']}
                  />
                </group>
              </group>
            </group>
          </group>
        </group>
        <group
          name="Sketchfab_model002"
          position={[-0.586, 1.679, 0.898]}
          rotation={[-1.321, 0, 1.921]}
          scale={0.146}>
          <group name="Root">
            <group
              name="Cube010"
              position={[0, 0, 0.089]}
              rotation={[0, 0, Math.PI / 2]}
              scale={[1.376, 0.126, 4.396]}>
              <mesh
                name="Cube_0"
                castShadow
                receiveShadow
                geometry={nodes.Cube_0.geometry}
                material={materials['Material.009']}
              />
            </group>
            <group name="Lamp" position={[4.076, 1.005, 5.904]} rotation={[-0.268, 0.602, 1.931]}>
              <group name="Lamp001" />
            </group>
          </group>
        </group>
        {/* <mesh
          name="Mesh_0"
          castShadow
          receiveShadow
          geometry={nodes.Mesh_0.geometry}
          material={materials.Material_0}
          position={[-0.108, 1.312, -1.041]}
          rotation={[0, -1.028, 0]}
          scale={0.082}
        /> */}
        <group
          name="Sketchfab_model003"
          position={[-2.102, 1.061, 4.554]}
          rotation={[-Math.PI / 2, -0.477, -0.793]}
          scale={-0.234}>
          <group name="e78729edba7745e28b7154a01f7f8fe2objcleanermaterialmergergles" />
        </group>
        <group name="group1945116984" position={[-0.058, 1.446, 0.182]}>
          <mesh
            name="mesh1945116984"
            castShadow
            receiveShadow
            geometry={nodes.mesh1945116984.geometry}
            material={materials.mat21}
          />
          <mesh
            name="mesh1945116984_1"
            castShadow
            receiveShadow
            geometry={nodes.mesh1945116984_1.geometry}
            material={materials.mat12}
          />
          <mesh
            name="mesh1945116984_2"
            castShadow
            receiveShadow
            geometry={nodes.mesh1945116984_2.geometry}
            material={materials.mat8}
          />
          <mesh
            name="mesh1945116984_3"
            castShadow
            receiveShadow
            geometry={nodes.mesh1945116984_3.geometry}
            material={materials.mat5}
          />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/merged.glb')