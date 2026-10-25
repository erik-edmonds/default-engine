"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useAtomValue } from "jotai"
import Link from "next/link"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera } from "@react-three/drei"
import { XR, XROrigin, createXRStore } from "@react-three/xr"

import { PointCloud, type CloudStats } from "@/components/scan/PointCloud"
import type { CopcSource } from "@/lib/copc/source"
import { ScanXrSetup } from "@/components/scan/ScanXrSetup"
import { EnterVrButton } from "@/components/scan/EnterVrButton"
import { XrControls, stepBudget } from "@/components/scan/XrControls"
import { FrameMeter } from "@/components/scan/FrameMeter"
import { SampleTable } from "@/components/scan/SampleTable"
import { LeftControllerWithPanel, RightController } from "@/components/scan/WristPanel"
import { XrNavigate } from "@/components/scan/XrNavigate"
import { scanStats } from "@/helpers/scanStats"
import { xrRig } from "@/helpers/xrRig"
import { SceneBoundary } from "@/components/layout/SceneBoundary"
import { SceneFallback } from "@/components/layout/SceneFallback"
import { useContextLoss } from "@/helpers/useContextLoss"
import { xrArmed } from "@/helpers/xr"
import type { ScanDefinition } from "@/config/scans"
import { TABLE_LONGEST_M, TABLE_ORIGIN, XR_POINT_BUDGET, XR_TARGET_HZ } from "@/config/xrScan"
import { lifeSizeRig, tabletopRig, type ScanRig } from "@/lib/copc/scale"

/** How many points may be on screen at once.
 *
 *  RUNTIME-TUNABLE ON PURPOSE, via ?budget=. The honest position is that
 *  nobody knows the right number: there is no published WebXR point-cloud
 *  benchmark for standalone headsets, and desktop GPUs vary by two orders of
 *  magnitude. The island already does exactly this with `dprCeiling` and
 *  usePortalTargetBudget. Start conservative and raise it by measuring. */
const DEFAULT_BUDGET = 1_500_000

/** Created once, at module scope: the store outlives any render and the
 *  library expects a stable identity.
 *
 *  Three defaults are wrong for this and all three are set explicitly.
 *
 *  `offerSession` defaults to `true`, meaning "AR if the device supports it,
 *  else VR" -- and a Quest 3 does support AR, so the system would offer
 *  passthrough for a viewer that is not built for it.
 *
 *  `frameRate` defaults to 'high', which resolves to the HIGHEST supported
 *  rate: 90 or 120Hz on a Quest 3, an 8.3ms budget instead of 13.9. Wrong
 *  for a point cloud -- find the budget at 72 first.
 *
 *  `emulate` defaults to injecting an `iwer` Quest 3 when the host is
 *  localhost, which exercises the entire session path -- stereo matrices,
 *  controllers, the wrist panel -- on a Mac with no headset.
 *
 *  AND IT DOES NOT CLASH WITH adb-reverse, which was the worry: a headset
 *  browsing http://localhost:3000 over `adb reverse` is also on localhost, so
 *  the obvious fear is that the emulator shoulders the real runtime aside.
 *  It does not. `injectEmulator` awaits `isSessionSupported` for both modes
 *  first and returns early if either is supported (store.js:46-58), so a real
 *  Quest keeps its real WebXR and only a device with no XR at all gets the
 *  fake. Left on deliberately, and nothing needs disabling to test on
 *  hardware. */
const xrStore = createXRStore({
  offerSession: "immersive-vr",
  frameRate: (supported: ArrayLike<number>) => {
    const rates = Array.from(supported)
    return rates.includes(XR_TARGET_HZ) ? XR_TARGET_HZ : Math.min(...rates)
  },
  // BOTH HANDS ARE CUSTOM. Each mounts a bare group in its own grip space so
  // the grab can read a hand pose that does not depend on a controller model
  // having loaded -- see helpers/xrHands.ts. The left one also carries the
  // wrist panel. Both wrap `<DefaultXRController/>` rather than replacing it,
  // so the library's model and pointers are untouched.
  controller: { left: LeftControllerWithPanel, right: RightController },
})

export default function ScanExperience({ scan }: { scan: ScanDefinition }) {
  const { lost: contextLost, onCreated } = useContextLoss()
  const armed = useAtomValue(xrArmed)
  const [stats, setStats] = useState<CloudStats | null>(null)
  /** Tabletop or life size. One scalar apart; see lib/copc/scale.ts. */
  const [scaleMode, setScaleMode] = useState<"table" | "life">("table")
  const [rigBounds, setRigBounds] = useState<{ size: [number, number, number]; centre: [number, number, number] } | null>(null)
  const [fitted, setFitted] = useState(false)
  /** A TUPLE IN STATE, NOT A MUTATED Vector3.
   *
   *  The first version held one Vector3 and `.copy()`d into it. The camera
   *  moved but the orbit target never did, because the prop's identity never
   *  changed and drei had nothing to react to -- so the camera framed the
   *  world origin while the cloud sat 2,200 units below it, and the viewport
   *  was empty with 300,000 points happily in the scene graph. A new array
   *  per change is what makes r3f write it through. */
  const [target, setTarget] = useState<[number, number, number]>([0, 0, 0])
  const [camStart, setCamStart] = useState<[number, number, number]>([0, 400, 900])

  /** The desktop budget. Read once from `?budget=`; there is a URL bar out
   *  here, so it needs no in-app control. */
  const budget = typeof window === "undefined"
    ? DEFAULT_BUDGET
    : Number(new URLSearchParams(window.location.search).get("budget")) || DEFAULT_BUDGET

  /** The headset budget, and it IS state -- walking this number is the
   *  measurement Phase 1 exists to take, and it has to be walkable from
   *  inside the headset, where there is no console and no URL bar. */
  const [xrBudget, setXrBudget] = useState(XR_POINT_BUDGET)

  /** Put the model back where the rig wants it.
   *
   *  Called when the scale mode changes, because the two transforms compose:
   *  a model dragged two metres to the left and scaled up four times at
   *  tabletop would otherwise carry both of those into 1:1, where four times
   *  is 2.8km of offset. */
  const resetUserRig = useCallback(() => {
    const g = xrRig.model
    if (!g) return
    g.position.set(0, 0, 0)
    g.quaternion.identity()
    g.scale.setScalar(1)
    scanStats.userScale = 1
  }, [])

  /** REACT OUT OF THE HOT PATH.
   *
   *  `PointCloud` publishes its stats roughly six times a second. On the
   *  desktop that drives the HUD and is fine. In a session the DOM is not
   *  composited into the headset at all, so each of those would be a React
   *  render and commit nobody can see, on the same main thread that is
   *  building troika geometry and issuing draw calls for two eyes -- the
   *  readout perturbing the frame time it exists to report.
   *
   *  So in a session the cloud writes only to `scanStats`, which the wrist
   *  panel reads on its own schedule. The ref keeps this callback's identity
   *  stable: taking `armed` as a dependency would change the prop on every
   *  transition and re-run PointCloud's effects for no reason. */
  const armedRef = useRef(armed)
  useEffect(() => { armedRef.current = armed }, [armed])
  const publishStats = useCallback((s: CloudStats) => {
    if (!armedRef.current) setStats(s)
  }, [])

  /** Frame the cloud once, from the DATA's bounds -- known after two range
   *  requests, long before a single point has been decoded, so the camera is
   *  never left staring at nothing while the first node loads.
   *
   *  The bounds arrive already in scene space; see the note in PointCloud on
   *  why they are the header's and not the octree cube's. Both the camera
   *  and the orbit target follow them: a survey's centre is nowhere near its
   *  octree's centre, and aiming at the origin pointed the camera thousands
   *  of units above the ground. */
  const onBounds = useCallback((box: THREE.Box3) => {
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    setTarget([sphere.center.x, sphere.center.y, sphere.center.z])
    const r = Math.max(sphere.radius, 1)
    setCamStart([
      sphere.center.x + r * 0.8,
      // Above, but not straight down -- a plan view of a flat site reads as
      // a texture. This is roughly a 30-degree elevation.
      sphere.center.y + r * 0.55,
      sphere.center.z + r * 0.8,
    ])
    setFitted(true)
  }, [])

  /** The rig, derived once the header is in.
   *
   *  Both modes come from the same two measurements -- the data extent and
   *  its centre, in FILE units -- so switching between them is one scalar
   *  and one translation, never a reload. */
  const onSource = useCallback((source: CopcSource) => {
    const { min, max } = source.copc.header
    const [ox, oy, oz] = source.origin
    setRigBounds({
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      // Origin-relative, because that is the space PointCloud's positions
      // are already in -- see the Float32 note in records.ts.
      centre: [(min[0] + max[0]) / 2 - ox, (min[1] + max[1]) / 2 - oy, (min[2] + max[2]) / 2 - oz],
    })
  }, [])

  /** In a session the cloud is rigged into the room; on the desktop it is
   *  left exactly where Phase 0 put it, so nothing about the monitor view
   *  changes. */
  const rig: ScanRig | null = !armed || !rigBounds
    ? null
    : scaleMode === "table"
      ? tabletopRig(rigBounds.size, rigBounds.centre, TABLE_LONGEST_M, TABLE_ORIGIN, scan.unitsToMetres)
      : lifeSizeRig(scan.unitsToMetres, rigBounds.centre)

  /** Identity on the desktop, so the groups can stay mounted either way. */
  const active: ScanRig = rig ?? { k: 1, placement: [0, 0, 0], anchor: [0, 0, 0], ratio: 1 }

  // The panel and the sample log need the scale, and it is the one piece of
  // state they cannot read off the renderer.
  //
  // IN AN EFFECT, NOT IN RENDER. Mutating module state during render is
  // impure, and this project compiles with the React Compiler -- a render it
  // decides to memoise away would simply not perform the write, and the panel
  // would report the previous scale with no way to tell from the symptom.
  useEffect(() => {
    scanStats.scaleMode = scaleMode
    scanStats.ratio = active.ratio
  }, [scaleMode, active.ratio])

  return (
    <div className="scan-stage">
      <SceneBoundary label="scan-scene">
        <Canvas
          id="scan-canvas"
          onCreated={onCreated}
          // No shadows: nothing here casts. A point cloud is unlit by
          // construction -- see pointsMaterial's toneMapped={false}.
          dpr={[1, 2]}
          style={{ width: "100%", height: "100dvh" }}
        >
          {/* Not black. A still-loading scene must never be mistakable for a
              dead context -- the same reason the 404 clears to #456363. */}
          <color attach="background" args={["#0e1217"]} />
          <PerspectiveCamera makeDefault fov={55} near={1} far={100_000} position={camStart} />
          {/* UNMOUNTED IN A SESSION, NOT DISABLED.
              `enabled={false}` gates OrbitControls' DOM listeners only --
              its `update()` still writes `camera.position` from its own
              spherical state every frame, and drei subscribes that to
              useFrame whenever damping is on. Rendering would survive,
              because three overwrites the pose again inside gl.render --
              but `selectNodes` reads the camera EARLIER in the frame, so
              the LOD would be driven by a camera that is not where the
              headset is. */}
          {!armed && (
            <OrbitControls
              makeDefault
              target={target}
              enableDamping
              dampingFactor={0.08}
              // The cloud is thousands of units across; the defaults crawl.
              zoomSpeed={1.2}
              rotateSpeed={0.6}
            />
          )}
          <ScanXrSetup />
          {/* The instrument. Outside <XR> deliberately: it needs no input
              sources, and it must keep measuring across the session
              boundary -- a meter that remounted on entering VR would reset
              its ring buffer at the exact moment measurement begins. */}
          <FrameMeter scan={scan.id} />
          <XR store={xrStore}>
            {/* The play space. Driven by the left stick and the right stick's
                snap turn, and NOTHING ELSE touches it -- in particular it
                never carries a scale, because three builds each eye as
                parent.matrixWorld x camera.matrix, so a scale here multiplies
                the wearer's interpupillary distance. At the tabletop's 1:709
                an IPD of 63mm would become 0.09mm: no stereo at all, and the
                world flat and infinitely far away. */}
            <XROrigin
              ref={(node) => {
                xrRig.origin = node
                return () => { if (xrRig.origin === node) xrRig.origin = null }
              }}
            />
            <XrNavigate />
            <Suspense fallback={null}>
              {/* THE HANDLING GROUP, outside the rig and above it.

                  Everything the wearer's hands do lands here, which keeps it
                  separate from what the RIG computed. Two reasons that
                  matters: switching scale can reset this without disturbing
                  the rig's arithmetic, and `selectNodes` walks
                  `group.matrixWorld` so a uniform scale applied here still
                  cancels out of the LOD exactly as the rig's own does. */}
              <group
                ref={(node) => {
                  xrRig.model = node
                  return () => { if (xrRig.model === node) xrRig.model = null }
                }}
              >
              {/* THE RIG IS ALWAYS MOUNTED, at identity on the desktop.
                  
                  Three nested groups, one uniform scalar, the cloud
                  unchanged inside them -- see lib/copc/scale.ts for why the
                  scale must be a scalar and must never sit on <XROrigin>.
                  
                  Rendering a rigged and an unrigged <PointCloud> as two
                  branches would UNMOUNT the cloud on entering VR, throwing
                  away every decoded node and re-fetching the lot at the
                  exact moment the headset needs frames. Identity values
                  cost nothing and keep one instance alive across the
                  transition. */}
              <group position={active.placement}>
                <group scale={active.k}>
                  {/* THE ANCHOR IS ROTATED, AND IT HAS TO BE.

                      This group is the PARENT of <PointCloud>, which carries
                      the Z-up to Y-up rotation R on its own root group. So a
                      point lands at T + k*(R*p + d) where d is this
                      translation -- the rotation has already happened by the
                      time this applies. The rig is defined as
                      T + k*R*(p - A), so d must be -R*A, not -A.

                      R is -90 degrees about X, which sends (x,y,z) to
                      (x,z,-y) -- the same swizzle onBounds already uses. So
                      -R*A is (-Ax, -Az, +Ay).

                      Subtracting A unrotated is not a subtle error, because
                      `source.origin` is the octree CUBE centre and the data
                      sits about 2233 ft below it in Z: the offset works out
                      at k*(0, -2233, +2233), which is 0.96 m at tabletop --
                      the model on the floor at your feet instead of on a
                      table in front of you -- and 680 m at 1:1, which is a
                      black screen. */}
                  <group position={[-active.anchor[0], -active.anchor[2], active.anchor[1]]}>
                    <PointCloud
                      url={scan.url}
                      pointBudget={armed ? xrBudget : budget}
                      onStats={publishStats}
                      onBounds={onBounds}
                      onSource={onSource}
                    />
                  </group>
              {/* Controller bindings. Inside <XR>, so the input sources
                  exist; a no-op on the desktop where there are none. */}
              <XrControls
                onToggleScale={() => {
                  resetUserRig()
                  setScaleMode((m) => (m === "table" ? "life" : "table"))
                }}
                onBudgetStep={(d) => setXrBudget((b) => stepBudget(b, d))}
              />
                </group>
              </group>
              </group>
            </Suspense>
          </XR>
        </Canvas>
      </SceneBoundary>

      {contextLost && (
        <SceneFallback
          title="Rendering stopped"
          detail="The browser released the graphics context, usually to free memory for another tab. It may come back on its own."
          action="Reload"
          onAction={() => window.location.reload()}
        />
      )}

      {stats?.error && (
        <SceneFallback
          title="The scan didn't load"
          detail={`${stats.error} — the file is fetched by HTTP range from a public bucket, so this is usually a network or CORS failure.`}
          action="Try again"
          onAction={() => window.location.reload()}
        />
      )}

      {/* The readout. Deliberately visible rather than hidden behind a dev
          flag: the whole point of this phase is to learn what the budget
          actually supports, and a number you have to go looking for is a
          number nobody looks at. */}
      <div className="scan-hud">
        <h1 className="scan-title">{scan.label}</h1>
        <p className="scan-credit">{scan.credit}</p>
        {!fitted && <p className="scan-stat">Opening…</p>}
        {stats?.ready && (
          <dl className="scan-stats">
            <div><dt>On screen</dt><dd>{stats.points.toLocaleString()}</dd></div>
            <div><dt>Of</dt><dd>{scan.approxPoints.toLocaleString()}</dd></div>
            <div><dt>Nodes</dt><dd>{stats.nodes}{stats.loading ? ` (+${stats.loading})` : ""}</dd></div>
            <div><dt>Fetched</dt><dd>{(stats.bytes / 1e6).toFixed(1)} MB in {stats.requests}</dd></div>
          </dl>
        )}
      </div>

      <EnterVrButton />

      {/* The deliverable. Appears on leaving a session, when there are rows. */}
      <SampleTable />

      <Link href="/" className="scan-back">← Back to the island</Link>
    </div>
  )
}
