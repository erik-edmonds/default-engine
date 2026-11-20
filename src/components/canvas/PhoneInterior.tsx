"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"

import { Phone } from "@/components/models/Phone"
import { usePortalLive } from "@/helpers/portalLive"
import {
  PHONE_POSITION,
  PHONE_SCALE_OPEN,
  PHONE_SCALE_SHUT,
  PHONE_SCREEN_OFF,
  PHONE_SCREEN_OFF_EMISSIVE,
  PHONE_SPIN,
  PHONE_SPIN_EASE,
  PHONE_SPIN_START,
  PHONE_TARGET_HEIGHT,
  PHONE_TILT_X,
} from "@/config/sfm"

/** A phone on a slow turntable, and the reconstruction that comes out of it.
 *
 *  This replaced the turning globe. The portal used to be a travel gallery --
 *  earth.glb with pins on Vietnam and Thailand, driven by config/places.ts --
 *  and what is behind it now is a computer-vision project, so the globe no
 *  longer describes it. None of that machinery was deleted: `places.ts`,
 *  `useGlobeDrag.ts`, `globeMarker.ts`, `GlobeMarker.tsx`, `Earth.tsx` and the
 *  `places` branch of PortalDestination all still compile and are simply
 *  unreferenced, exactly as `PointCloudInterior` and the whole water subsystem
 *  already are. Changing one `interior:` line in config/portals.ts is the
 *  entire detachment, and putting it back is the entire restoration.
 *
 *  WHY A PHONE IS THE RIGHT OBJECT. The project reconstructs a space from a
 *  handheld video: the phone is both the sensor and the only prop that says
 *  "this started as something anybody could shoot". The model carries a
 *  `Camera Lens` material, which is where the reconstruction emanates from.
 *
 *  THE CLICK IS NOT HERE. It is the DOM pill in PortalDestination, because a
 *  destination is a link and a link should be focusable, right-clickable and
 *  readable by a screen reader. drei <Text> is none of those.
 *
 *  LAZY, AND THAT IS LOAD-BEARING. PortalInterior reaches this through
 *  React.lazy and Phone.tsx deliberately does NOT preload at module scope, so
 *  phone.glb's 0.57 MB is fetched when this portal first wakes rather than on
 *  the island's first paint. WaterInterior.tsx documents the trap in full.
 */
export default function PhoneInterior() {
  const shell = useRef<THREE.Group>(null)
  const spin = useRef<THREE.Group>(null)
  const fit = useRef<THREE.Group>(null)
  const shown = useRef(0)
  const live = usePortalLive()

  /** The screen, switched off.
   *
   *  The stock asset ships a 450x338 PowerPoint template JPEG as the screen's
   *  base colour map, which is not a thing this portal should ever show.
   *  Overriding it at the mesh rather than assigning onto
   *  `materials.purple_screen` keeps drei's per-URL material cache clean --
   *  that object is shared with every other consumer of this glTF.
   *
   *  Disposed on unmount, because a material built in useMemo and handed over
   *  as a prop is not one r3f will clean up: it only disposes what it created
   *  from JSX. The portal unmounts its interior every time the room goes dark
   *  (HotspotPortal's `roomAwake`), so this runs often rather than never. */
  const screen = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PHONE_SCREEN_OFF),
      emissive: new THREE.Color(PHONE_SCREEN_OFF),
      emissiveIntensity: PHONE_SCREEN_OFF_EMISSIVE,
      roughness: 0.18,
      metalness: 0,
    })
    m.name = "phone-screen-off"
    return m
  }, [])
  useEffect(() => () => screen.dispose(), [screen])

  /** AUTO-FIT, FOR THE REASON VrInterior GIVES.
   *
   *  Measured rather than hand-tuned: this model's pivot is not its centre.
   *  Its geometry spans y 0.002..4.791 with the node translated
   *  [0.095, 0, -0.373], so its centre sits at [0.100, 2.397, -0.398] -- a
   *  hand-set scale/position pair would put it off-frame while every "is it in
   *  the scene?" check passed, which is the failure the headset's three model
   *  swaps already produced.
   *
   *  A LAYOUT effect: the transform must be right before the first paint or
   *  the phone is visibly wrong for a frame. `Phone` suspends on its own glTF
   *  load, so by the time this runs the geometry is real; the `isEmpty` guard
   *  covers the case where it is not. */
  useLayoutEffect(() => {
    const group = fit.current
    if (!group) return
    group.position.set(0, 0, 0)
    group.scale.setScalar(1)
    const box = new THREE.Box3().setFromObject(group)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const centre = box.getCenter(new THREE.Vector3())
    const scale = PHONE_TARGET_HEIGHT / Math.max(size.y, 1e-6)
    group.scale.setScalar(scale)
    group.position.copy(centre).multiplyScalar(-scale)
  }, [])

  useFrame((_state, delta) => {
    // A turntable that is NOT constant speed, and that is the whole trick.
    //
    // A phone is a flat slab: a constant turn spends as long edge-on, where it
    // reads as a sliver and says nothing, as it does square to the camera. The
    // two angles that carry the project are the front (the screen, with the
    // detections on it) and the back (the lens the reconstruction comes out
    // of), so the turn slows to PHONE_SPIN_EASE of its speed there and hurries
    // through the edges -- `|sin|` is zero at both faces and one at both
    // edges. Same total revolution, most of the time spent where there is
    // something to look at.
    if (spin.current) {
      const theta = spin.current.rotation.y
      const edge = Math.abs(Math.sin(theta))
      spin.current.rotation.y += delta * PHONE_SPIN * (PHONE_SPIN_EASE + (1 - PHONE_SPIN_EASE) * edge)
    }

    // Sized against how open the portal is, not against `open` alone: the ramp
    // is what makes the same content read correctly as a 1.5-unit window and
    // as the whole screen. usePortalLive is null outside a portal -- /portfolio
    // renders these interiors bare -- and full size is the right answer there.
    easing.damp(shown, "current", live?.current.value ?? 1, 0.18, delta)
    if (shell.current) {
      shell.current.scale.setScalar(
        PHONE_SCALE_SHUT + (PHONE_SCALE_OPEN - PHONE_SCALE_SHUT) * shown.current,
      )
    }
  })

  return (
    <group position={[...PHONE_POSITION]}>
      {/* Its own rig, for the reason the globe and the headset both state: the
          portal room's light is a mood, not a key, and it ramps to zero on the
          way out -- a model lit only by the room turns into a silhouette at
          exactly the moment you are looking at it. The phone's materials are
          flat colours (Color 1 / Color 2 / Black / Camera Lens) with one
          texture, so the lights are the whole of how it reads.

          The cool back light is doing real work: it catches the chamfer down
          the long edge, which is the only thing that tells you the shape is a
          phone and not a rounded rectangle. */}
      <ambientLight intensity={1.05} />
      <directionalLight position={[2.5, 3, 4]} intensity={2.1} />
      <directionalLight position={[-3, 1.5, -2.5]} intensity={1.1} color="#8fd0ff" />

      <group ref={shell} scale={PHONE_SCALE_OPEN}>
        {/* The lean sits OUTSIDE the turntable. Tilting inside it would swing
            the phone through the lean as it turned, which reads as a bug. */}
        <group rotation={[PHONE_TILT_X, 0, 0]}>
          <group ref={spin} name="phone-spin" rotation={[0, PHONE_SPIN_START, 0]}>
            <group ref={fit}>
              <Phone screenMaterial={screen} />
            </group>

            {/* THE RECONSTRUCTION GOES HERE, as a sibling of the fitted phone
                rather than a child of it: it is expressed in the SfM solution's
                own arbitrary units and must not inherit the metres-to-frame
                scale the Box3 fit just applied to the model.

                It is not drawn yet, and `ready` is why. config/sfm.ts holds the
                registry and every reconstruction in it is `ready: false`,
                because the pipeline in sfm/ is real and runnable and no video
                has been shot through it. An empty cloud rendered here would be
                indistinguishable from a loading bug; a phone on its own is
                simply a phone on its own. The lens mesh is PHONE_LENS_MESH,
                found by name after the fit so the frustum can start where the
                camera actually is. */}
          </group>
        </group>
      </group>
    </group>
  )
}
