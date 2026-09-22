"use client"

import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { useThree } from "@react-three/fiber"

import { useGLTF } from "@/helpers/useGLTF"
import { PRESETS } from "@/components/canvas/environmentPresets"
import {
  MAP_CENTER_X, MAP_CENTER_Z, MAP_HALF_EXTENT, MAP_TILT_COS, MAP_TILT_SIN,
} from "@/config/minimap"
import { getMinimapHeading, subscribeMinimapHeading } from "@/helpers/minimap"

/** The island at map scale, for the minimap's own canvas.
 *
 *  A CLONE of the cached GLB scene, not a second `<Merged>`.
 *
 *  Mounting `<Merged>` twice would be the Avatar bug again: it renders four
 *  `<primitive object={nodes.*}>` bones straight out of useGLTF's process-wide
 *  cache, and `<primitive>` MOVES an object rather than copying it -- so the
 *  second mount would reparent the shark rig's bones out of the running island
 *  and hand one THREE.Skeleton to two renderers. `Object3D.clone(true)` copies
 *  objects and shares geometry and materials, which is exactly the right split:
 *  the GPU uploads one set of buffers, and nothing is taken from the scene that
 *  is already using them.
 *
 *  The clone is then pruned. At 148px the dock (73 meshes), the shack (16) and
 *  three prop groups (24) are sub-pixel, and the shark rig is `visible={false}`
 *  in the original anyway -- 113 of the 167 meshes, gone, for nothing anyone
 *  could see.
 */

/** Dropped from the miniature by name. The shark rig goes as well, both because
 *  it is invisible in the original and because a SkinnedMesh in a clone still
 *  points at the ORIGINAL skeleton's bones, which is the one kind of sharing
 *  that is not safe here. */
const DROP = new Set([
  "Armature",
  "Dock",
  "Shack",
  "Sketchfab_model001",
  "Sketchfab_model002",
  "Sketchfab_model003",
  "group1945116984",
])

/** The sea, flat.
 *
 *  Not `useOceanWaterMaterial`: that is a 250-line shader that animates every
 *  frame, and this canvas is deliberately a still (see frameloop="demand" at
 *  the mount site). A flat colour is also what a map wants -- the point of the
 *  water here is to say where the land stops. */
const SEA_COLOR = "#8fc4d2"

/** Matches Scene.tsx's own `<Merged scale={3} position={[0,-5.5,0]} rotation={[0,PI/2,0]}>`.
 *
 *  Not a coincidence and not tunable: the map camera below is positioned in the
 *  ISLAND's world coordinates, and `worldToMap` -- which places the four
 *  destination dots and the "you are here" marker over this canvas -- assumes
 *  those same coordinates. Change this and the island slides out from under its
 *  own markers. */
const ISLAND_SCALE = 3
const ISLAND_POSITION: [number, number, number] = [0, -5.5, 0]
const ISLAND_ROTATION: [number, number, number] = [0, Math.PI / 2, 0]

export function MiniIsland({ phase }: { phase: keyof typeof PRESETS }) {
  const { scene } = useGLTF("/models/merged.glb")
  const invalidate = useThree((s) => s.invalidate)

  const model = useMemo(() => {
    const copy = (scene as THREE.Object3D).clone(true)

    const doomed: THREE.Object3D[] = []
    copy.traverse((o) => {
      if (DROP.has(o.name)) { doomed.push(o); return }
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) { doomed.push(o); return }
      // The shadow-catcher twin of the water surface: a coincident mesh whose
      // only job is to receive shadows the ocean shader cannot. There are no
      // shadows in this canvas, so it is a second full-size transparent draw
      // for nothing.
      const material = (o as THREE.Mesh).material
      if (material && !Array.isArray(material) && (material as THREE.Material).type === "ShadowMaterial") doomed.push(o)
    })
    for (const o of doomed) o.parent?.remove(o)

    const sea = new THREE.MeshBasicMaterial({ color: SEA_COLOR })
    copy.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      // Nothing casts or receives here, and leaving the flags on costs a
      // shadow-map pass that renders into nothing.
      mesh.castShadow = false
      mesh.receiveShadow = false
      if (o.name === "New_Water") mesh.material = sea
    })

    return copy
  }, [scene])

  useEffect(() => () => {
    // The clone shares the cache's geometry and materials, so disposing it
    // would tear the buffers out from under the real island. Only the one
    // material this component created is ours to free.
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && (mesh.material as THREE.Material)?.type === "MeshBasicMaterial") {
        (mesh.material as THREE.Material).dispose()
      }
    })
  }, [model])

  // frameloop is "demand", so a change that is not a frame does not draw
  // itself. Two things change what this canvas should show -- the model
  // arriving out of Suspense, and the time of day moving the light rig -- and
  // without these the widget keeps displaying whatever was on screen when it
  // last happened to render.
  useEffect(() => {
    invalidate()
    // And again on the next frame. Under "demand" the single render triggered
    // here can land before the light rig's own commit has been applied, and
    // whatever it captured then stays on screen forever -- measured as a corner
    // widget noticeably darker than the same scene in the expanded overlay. One
    // extra frame costs nothing and removes the ordering question entirely.
    const id = requestAnimationFrame(() => invalidate())
    return () => cancelAnimationFrame(id)
  }, [model, phase, invalidate])

  const p = PRESETS[phase]
  return (
    <>
      {/* The same three roles MinimapRenderer's capture rig used, and for the
          reason its docstring gives: the rim and kick lights in the real scene
          exist to separate a subject from a background at eye level, which
          means nothing looking down at a model of the place. */}
      <ambientLight color={p.ambientColor} intensity={p.ambientIntensity} />
      <hemisphereLight color={p.hemiSky} groundColor={p.hemiGround} intensity={p.hemiIntensity} />
      <directionalLight color={p.dirColor} intensity={p.dirIntensity} position={[p.dirX, p.dirY, p.dirZ]} />
      <primitive object={model} scale={ISLAND_SCALE} position={ISLAND_POSITION} rotation={ISLAND_ROTATION} />
    </>
  )
}

/** The map camera: orthographic, fixed tilt, and free to turn.
 *
 *  Square frustum, no compensation for the tilt -- the `cos` that the tilt puts
 *  into the projection lives in `worldToMap`, and the two only agree while this
 *  stays a plain square. Its AZIMUTH follows the visitor, so the miniature
 *  shows the island from the side they are standing on. See the long note in
 *  config/minimap.ts before changing any of it. */
export function MiniMapCamera() {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const place = useRef<(heading: number) => void>(null)

  // The rule fires because this writes to the camera the hook handed back.
  // Configuring the default camera is what this component is FOR, and r3f has
  // no declarative way to hand an orthographic camera a fixed frustum plus an
  // up vector plus a lookAt -- drei's <OrthographicCamera> covers the frustum
  // and not the other two. The writes are idempotent and re-run on resize.
  /* eslint-disable react-hooks/immutability */
  useEffect(() => {
    // `manual` stops r3f rebuilding this frustum from the canvas's pixel size
    // on every resize. Without it the bounds become +/- half the canvas in
    // PIXELS -- 208 at overlay size against the 26 the projection wants -- and
    // the island renders as a speck in the middle of the frame. It is the
    // documented escape hatch for a camera the app configures itself.
    // `manual` is r3f's own flag on the camera object, not three's, so it is
    // not in the OrthographicCamera type.
    ;(camera as THREE.OrthographicCamera & { manual?: boolean }).manual = true
    camera.left = -MAP_HALF_EXTENT
    camera.right = MAP_HALF_EXTENT
    camera.top = MAP_HALF_EXTENT
    camera.bottom = -MAP_HALF_EXTENT
    camera.near = 0.1
    camera.far = 400
    camera.updateProjectionMatrix()

    // Swing the camera round the island to the visitor's own bearing.
    //
    // This is the whole of "the map turns with you", and every term has to
    // match worldToMap's derivation exactly -- it projects the markers through
    // the same heading on the same frame, and any disagreement slides the
    // island out from under its own dots. At heading 0 both reduce to the fixed
    // view from +z that the map had before it could turn.
    place.current = (heading: number) => {
      const ch = Math.cos(heading)
      const sh = Math.sin(heading)
      const DISTANCE = 200
      camera.position.set(
        MAP_CENTER_X + DISTANCE * MAP_TILT_SIN * sh,
        DISTANCE * MAP_TILT_COS,
        MAP_CENTER_Z + DISTANCE * MAP_TILT_SIN * ch,
      )
      camera.up.set(-MAP_TILT_COS * sh, MAP_TILT_SIN, -MAP_TILT_COS * ch)
      camera.lookAt(MAP_CENTER_X, 0, MAP_CENTER_Z)
      camera.updateMatrixWorld(true)
    }
    place.current(getMinimapHeading())
    // And draw. Under frameloop="demand" this effect runs AFTER r3f's first
    // render, so the frame on screen was taken with the default camera -- which
    // is exactly the speck described above, left there permanently because
    // nothing else was ever going to ask for another frame.
    invalidate()
  }, [camera, size.width, size.height, invalidate])
  /* eslint-enable react-hooks/immutability */

  // The island canvas publishes a heading whenever it has moved enough to be
  // worth a frame (see HEADING_EPSILON), and this is the only thing that asks
  // for one -- so a parked camera settles to no draws at all, and a flight
  // redraws a 74-mesh scene while it lasts.
  useEffect(() => subscribeMinimapHeading((heading) => {
    place.current?.(heading)
    invalidate()
  }), [invalidate])

  return null
}
