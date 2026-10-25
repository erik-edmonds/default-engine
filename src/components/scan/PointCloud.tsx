"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useFrame, useThree } from "@react-three/fiber"

import { DecodePool } from "@/lib/copc/pool"
import { CopcSource } from "@/lib/copc/source"
import { evictionOrder, selectNodes } from "@/lib/copc/traverse"
import type { DecodedNode } from "@/lib/copc/records"
import { scanStats } from "@/helpers/scanStats"

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
 *  for, which the per-level ShaderMaterial is what finally fixes. */
const POINT_SIZE = 1.6

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
  points: number
}

export function PointCloud({
  url,
  pointBudget,
  onStats,
  onBounds,
  onSource,
}: {
  url: string
  pointBudget: number
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
      for (const [, r] of live) r.geometry.dispose()
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
          resident.current.set(key, { geometry: toGeometry(decoded), points: decoded.pointCount })
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
        resident.current.delete(key)
        residentPoints -= r.points
        if (residentPoints <= pointBudget) break
      }
      setVisible([...resident.current.entries()])
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
    scanStats.pointSize = POINT_SIZE
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
        <points key={key} geometry={r.geometry} frustumCulled={false} raycast={() => null}>
          {/* vertexColors because the file carries real RGB (PDRF 7).
              sizeAttenuation off: a point is a sample, not an object with a
              physical size, and attenuating makes distant ground dissolve
              while near ground turns to porridge. A fixed 1-2px is what
              makes a cloud read as a surface. */}
          <pointsMaterial size={POINT_SIZE} sizeAttenuation={false} vertexColors toneMapped={false} />
        </points>
      ))}
    </group>
  )
}

function toGeometry(decoded: DecodedNode): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(decoded.position, 3))
  if (decoded.color.length) geometry.setAttribute("color", new THREE.BufferAttribute(decoded.color, 3))
  return geometry
}
