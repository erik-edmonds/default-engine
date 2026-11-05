"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { DecodePool } from "@/lib/copc/pool"
import { CopcSource } from "@/lib/copc/source"
import { evictionOrder, selectNodes } from "@/lib/copc/traverse"
import type { DecodedNode } from "@/lib/copc/records"
import { createPointMaterial, pointSizeForDepth, pointUniforms } from "@/lib/scan/pointMaterial"
import { colorModeSnapshot } from "@/helpers/colorMode"
import { scanStats } from "@/helpers/scanStats"
import { HAG_RAMP_MAX_M } from "@/config/asprs"

/** How often the octree is re-selected. Not every frame: traversal walks the
 *  node table and sorts, and nothing visible changes between one frame and
 *  the next at 60fps. Six times a second is faster than a person can move a
 *  camera meaningfully and costs a fraction of the budget. */
const SELECT_INTERVAL_MS = 160

/** Range requests in flight at once. More does not help -- it just queues at
 *  the socket and delays the nodes you actually want next. */
const MAX_CONCURRENT = 6

/** Point size in CSS pixels, with attenuation off -- see the note at the
 *  material. Named so the wrist panel can report what is actually in force:
 *  three's shader uses `size * renderer.getPixelRatio()`, and the ratio is 2
 *  on a retina monitor but 1 in a session, so this is 3.2 device px on the
 *  desktop and 1.6 worn. 1.6 is under the 3px shimmer floor the plan argues
 *  for, which the per-level ShaderMaterial is what finally fixes.
 *
 *  THAT MATERIAL NOW EXISTS, so the constant is gone and this note is its
 *  epitaph. Size is computed per node from the octree's own spacing and
 *  clamped to XR_POINT_MIN_PX..XR_POINT_MAX_PX in lib/scan/pointMaterial.ts,
 *  and the panel reports the resulting RANGE rather than one number -- see
 *  `pointSizeRange` in helpers/wristRows.ts.
 *
 *  The pixel-ratio trap above is unchanged and still live, just moved: three
 *  applies `size * getPixelRatio()` for its OWN pointsMaterial
 *  (WebGLMaterials.js:307) and does not for a ShaderMaterial, so the ratio is
 *  published into `uPixelRatio` from the selection pass below. */

export interface CloudStats {
  points: number
  nodes: number
  bytes: number
  requests: number
  loading: number
  ready: boolean
  error?: string
}

interface Resident {
  geometry: THREE.BufferGeometry
  /** Its own material, because the point size is per node. Shares one
   *  compiled program with every other node and shares the colour uniforms by
   *  reference -- see the note on `pointUniforms`. Owned here, so eviction has
   *  something to dispose. */
  material: THREE.ShaderMaterial
  points: number
  sizePx: number
  /** 256 class bins for this node, summed across the resident set for the
   *  readout. Kept rather than discarded: it is 1 KB per node and recomputing
   *  it would mean a pass over the classification bytes on the frame thread,
   *  which is exactly what producing it in the worker avoided. */
  classHistogram: Uint32Array
  hagMax: number
}

export function PointCloud({
  url,
  pointBudget,
  unitsToMetres,
  onStats,
  onBounds,
  onSource,
}: {
  url: string
  pointBudget: number
  /** Metres per file unit. Needed here because the height colour ramp's top is
   *  configured in METRES (crops are discussed in metres) while the `hag`
   *  attribute is in FILE UNITS -- and the sample survey is in feet, so
   *  conflating them would be wrong by 3.28 and would still look plausible. */
  unitsToMetres: number
  onStats?: (stats: CloudStats) => void
  onBounds?: (box: THREE.Box3) => void
  /** The opened file, once its header and root hierarchy are in.
   *
   *  Handed over whole rather than as a pile of derived numbers: the viewer
   *  needs the data extent in FILE units to size the tabletop rig, and the
   *  octree centre to re-centre it, and inventing a callback per quantity
   *  would be worse than one that says "here is the source". */
  onSource?: (source: CopcSource) => void
}) {
  const group = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const [source, setSource] = useState<CopcSource | null>(null)
  const [error, setError] = useState<string | undefined>()
  /** THE RENDER VIEW OF THE RESIDENT SET.
   *
   *  `resident` below is a ref because the frame loop reads and writes it
   *  many times a second and must never re-render for that. But a ref cannot
   *  be read during render -- react-hooks/refs rejects it, correctly: React
   *  would have no idea the children changed. So the ref is the working set
   *  and this is the snapshot the JSX maps over, published once per actual
   *  change rather than once per frame. */
  const [visible, setVisible] = useState<[string, Resident][]>([])

  const pool = useMemo(() => new DecodePool(2), [])
  const drawingSize = useMemo(() => new THREE.Vector2(), [])
  const resident = useRef(new Map<string, Resident>())
  const loading = useRef(new Map<string, AbortController>())
  const lastSelect = useRef(0)
  /** Reused, not reallocated: the class histogram is summed six times a second
   *  and a fresh 1 KB typed array each time is garbage for no reason. The
   *  readout holds this by reference and only ever reads it. */
  const aggregate = useRef(new Uint32Array(256))

  // --- open ---------------------------------------------------------------
  useEffect(() => {
    let live = true
    CopcSource.open(url, pool).then(
      (opened) => {
        if (!live) return
        setSource(opened)
        onSource?.(opened)
        // THE DATA'S BOUNDS, NOT THE OCTREE CUBE'S.
        //
        // A COPC octree is always a CUBE large enough to contain the data,
        // and survey data is rarely cubic. The sample is 3426 x 4656 x 209
        // units -- a flat site -- inside a 4655-unit cube, so the cube's
        // centre sits about 2,200 units ABOVE every point in the file.
        // Framing the cube pointed the camera at empty sky, which is also
        // why the LOD selected almost nothing: everything real was far
        // off-centre and mostly out of frustum.
        //
        // Published in SCENE space, with the same -90 degrees about X the
        // group below applies, so the caller never has to know the cloud is
        // rotated: local (x, y, z) -> scene (x, z, -y).
        const { min, max } = opened.copc.header
        const [ox, oy, oz] = opened.origin
        const lx = [min[0] - ox, max[0] - ox]
        const ly = [min[1] - oy, max[1] - oy]
        const lz = [min[2] - oz, max[2] - oz]
        onBounds?.(
          new THREE.Box3(
            new THREE.Vector3(Math.min(...lx), Math.min(...lz), Math.min(...ly.map((v) => -v))),
            new THREE.Vector3(Math.max(...lx), Math.max(...lz), Math.max(...ly.map((v) => -v))),
          ),
        )
      },
      (e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)) },
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pool])

  // --- tear down ----------------------------------------------------------
  useEffect(() => {
    const inFlight = loading.current
    const live = resident.current
    return () => {
      for (const [, controller] of inFlight) controller.abort()
      for (const [, r] of live) {
        r.geometry.dispose()
        r.material.dispose()
      }
      live.clear()
      pool.dispose()
    }
  }, [pool])

  // --- drive --------------------------------------------------------------
  useFrame(() => {
    if (!source || !group.current) return
    const now = performance.now()
    if (now - lastSelect.current < SELECT_INTERVAL_MS) return
    lastSelect.current = now

    const model = group.current.matrixWorld
    // The DRAWING BUFFER, never state.size -- see the note on viewportHeight
    // in traverse.ts. In a session the CSS box and the framebuffer disagree
    // by a factor of ~2.7.
    const selection = selectNodes(source, camera, {
      pointBudget,
      viewportHeight: gl.getDrawingBufferSize(drawingSize).y,
      groupMatrixWorld: model,
    })
    const wanted = new Set(selection.wanted)

    // Pages first: traversal cannot descend past an unread hierarchy page, so
    // fetching one is what unlocks the next level of detail.
    for (const key of selection.pagesToLoad.slice(0, 2)) {
      if (loading.current.has(key)) continue
      const controller = new AbortController()
      loading.current.set(key, controller)
      source.ensurePage(key).finally(() => loading.current.delete(key))
    }

    // CANCEL WHAT IS NO LONGER WANTED. Without this a sweep of the camera
    // leaves a dozen ~1.8MB downloads running for nodes nobody is looking at,
    // and the ones you now want queue behind them.
    for (const [key, controller] of loading.current) {
      if (!wanted.has(key) && source.nodes.has(key)) {
        controller.abort()
        loading.current.delete(key)
      }
    }

    for (const key of selection.wanted) {
      if (resident.current.has(key) || loading.current.has(key)) continue
      if (loading.current.size >= MAX_CONCURRENT) break
      const controller = new AbortController()
      loading.current.set(key, controller)
      source.loadNode(key, controller.signal).then(
        (decoded) => {
          loading.current.delete(key)
          if (controller.signal.aborted) return
          // Size from THIS node's depth, not from the file. A COPC octree
          // halves its spacing every level, so one size for every node means
          // either gaps at the shallow levels or a smear at the deep ones.
          const depth = Number(key.split("-")[0])
          const sizePx = pointSizeForDepth(source.spacingAt(depth), source.cubeSize)
          resident.current.set(key, {
            geometry: toGeometry(decoded),
            material: createPointMaterial({
              sizePx,
              hasColor: decoded.color.length > 0,
              hasHag: decoded.hag.length > 0,
            }),
            points: decoded.pointCount,
            sizePx,
            classHistogram: decoded.classHistogram,
            hagMax: decoded.hagMax,
          })
          setVisible([...resident.current.entries()])
        },
        () => { loading.current.delete(key) },
      )
    }

    // Evict, farthest first -- see the note in traverse.ts on why not LRU.
    let residentPoints = 0
    for (const [, r] of resident.current) residentPoints += r.points
    if (residentPoints > pointBudget * 1.5) {
      for (const key of evictionOrder(resident.current.keys(), source, camera, wanted, model)) {
        const r = resident.current.get(key)
        if (!r) continue
        r.geometry.dispose()
        r.material.dispose()
        resident.current.delete(key)
        residentPoints -= r.points
        if (residentPoints <= pointBudget) break
      }
      setVisible([...resident.current.entries()])
    }

    // --- what the resident set is made of ---------------------------------
    //
    // ONE PASS, AFTER EVICTION, and it is summing rather than scanning points:
    // the per-node histograms were produced in the decode worker, so the most
    // this costs is ~200 nodes x 256 bins of integer addition six times a
    // second. Recomputing them here from the classification attributes would
    // be a pass over a million-plus bytes on the thread drawing the frame,
    // which is the thing this whole route is organised to avoid.
    const histogram = aggregate.current
    histogram.fill(0)
    let sizeMin = Infinity
    let sizeMax = 0
    let hagMax = 0
    for (const [, r] of resident.current) {
      for (let i = 0; i < 256; i++) histogram[i] += r.classHistogram[i]
      if (r.sizePx < sizeMin) sizeMin = r.sizePx
      if (r.sizePx > sizeMax) sizeMax = r.sizePx
      if (r.hagMax > hagMax) hagMax = r.hagMax
    }

    const stats: CloudStats = {
      points: residentPoints,
      nodes: resident.current.size,
      bytes: source.getter.bytesFetched,
      requests: source.getter.requestCount,
      loading: loading.current.size,
      ready: true,
      error,
    }
    // TO THE MODULE REF ALWAYS, through React only when someone can see it.
    //
    // The wrist panel reads `scanStats` on its own 4Hz schedule, so in a
    // session this write is the whole publication: no React commit, no DOM,
    // no re-render of a HUD the headset does not composite. `onStats` is the
    // desktop path, and ScanExperience makes it a no-op while armed.
    scanStats.cloud = stats
    scanStats.budget = pointBudget
    scanStats.pointSize = sizeMin === Infinity ? 0 : sizeMin
    scanStats.pointSizeMax = sizeMax
    scanStats.classHistogram = histogram
    scanStats.hagMax = hagMax
    scanStats.hasHag = source.hasHag
    scanStats.unitsToMetres = unitsToMetres
    scanStats.colorMode = colorModeSnapshot()

    // THE TWO UNIFORMS THAT ARE NOT CONSTANTS, written here because this is
    // the only place that knows both the renderer and the file.
    //
    // `uPixelRatio` because three does this multiply itself for its own
    // pointsMaterial and not for a ShaderMaterial, and the ratio is 2 on a
    // retina monitor and 1 in a session -- the single reason the old flat size
    // behaved differently worn than on the desk.
    //
    // `uHagMax` because the ramp's top is configured in METRES and the
    // attribute is in FILE UNITS. On the sample survey, which is in feet,
    // getting this wrong would top the ramp out at 10 feet while the legend
    // said 10 metres, and every canopy in the scan would clip to white.
    pointUniforms.uPixelRatio.value = gl.getPixelRatio()
    pointUniforms.uHagMax.value = HAG_RAMP_MAX_M / (unitsToMetres || 1)

    onStats?.(stats)
  })

  useEffect(() => {
    if (error) onStats?.({ points: 0, nodes: 0, bytes: 0, requests: 0, loading: 0, ready: false, error })
  }, [error, onStats])

  return (
    // LAS IS Z-UP, THREE.JS IS Y-UP.
    //
    // The parser deliberately leaves coordinates in the file's own space so
    // the golden test can compare against copc.js directly, which means the
    // handedness fix belongs here. -90 degrees about X sends +Z to +Y and
    // +Y to -Z, which is the standard survey-to-scene rotation. Doing it on
    // the group rather than per point costs one matrix instead of ten
    // million multiplications.
    <group ref={group} rotation={[-Math.PI / 2, 0, 0]}>
      {visible.map(([key, r]) => (
        // The material is OWNED BY THE RESIDENT ENTRY and passed as a prop,
        // not declared as a JSX child. Declaring it inline would have r3f
        // construct and dispose one on every re-render of this list -- which
        // happens whenever any node lands -- and the per-node point size has
        // to survive that. `raycast` stays off until the Phase 3 brush needs
        // it; nothing in this scene should be a pointer target but the menu.
        <points
          key={key}
          geometry={r.geometry}
          material={r.material}
          frustumCulled={false}
          raycast={() => null}
        />
      ))}
    </group>
  )
}

/** THE CLASSIFICATION BYTE STOPS BEING THROWN AWAY HERE.
 *
 *  It has crossed the worker boundary intact as its own transferable buffer
 *  since the decoder was written -- the cost was already paid -- and then
 *  become unreachable the moment this function returned, because `Resident`
 *  kept only a geometry and a count. records.ts even says what it was for:
 *  "what any later classification view will colour by". That view now exists.
 *
 *  WHAT THIS COSTS, stated rather than discovered. Per point the GPU now holds
 *  position 12 + colour 12 + class 1 + height 4 = 29 bytes, against 24 before,
 *  so attribute bandwidth is up about 21%. All four are kept resident
 *  deliberately: switching colour mode is then one uniform assignment instead
 *  of re-deriving colours for every resident node or refetching the lot. The
 *  budget note in config/xrScan.ts does this arithmetic for 24 bytes and
 *  concludes the knee is near 2M points -- it is worth knowing that figure has
 *  always been arithmetic rather than measurement, and this adds 21% to a
 *  number nobody has measured yet.
 *
 *  Both new attributes are itemSize 1 and NOT normalized: the classification
 *  byte must arrive in the shader as 0..255 so it can index the palette, which
 *  is exactly what a non-normalized Uint8 attribute does. Normalizing it would
 *  silently divide every code by 255. */
function toGeometry(decoded: DecodedNode): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(decoded.position, 3))
  if (decoded.color.length) geometry.setAttribute("color", new THREE.BufferAttribute(decoded.color, 3))
  geometry.setAttribute("classification", new THREE.BufferAttribute(decoded.classification, 1))
  // Only when the file actually has it -- the material compiles the reference
  // out via a define, so an absent attribute is never read.
  if (decoded.hag.length) geometry.setAttribute("hag", new THREE.BufferAttribute(decoded.hag, 1))
  return geometry
}
