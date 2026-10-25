"use client"

import { Suspense, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { Text } from "@react-three/drei"
import { suspend } from "suspend-react"
import { DefaultXRController, XRSpace } from "@react-three/xr"

import { scanStats } from "@/helpers/scanStats"
import { xrHands } from "@/helpers/xrHands"
import { WRIST_BINDINGS, WRIST_ROWS, wristValues } from "@/helpers/wristRows"
import {
  WRIST_PANEL_FACING_MIN,
  WRIST_PANEL_HZ,
  WRIST_PANEL_OFFSET,
  WRIST_PANEL_SIZE,
  WRIST_PANEL_TILT,
} from "@/config/xrScan"

const panelFont = import("@pmndrs/assets/fonts/inter_medium.woff")

/** NO <Html>, AND NOT AS A STYLE CHOICE. A DOM overlay cannot exist in an
 *  immersive session at all — the page is not composited into the headset, so
 *  `useContextLoss`' fallback, the HUD and every `<Html>` in the codebase are
 *  simply absent the moment the session starts. A readout that is invisible
 *  exactly when it is needed is worse than none, because you would trust it.
 *
 *  drei `<Text>`, following CameraHotspot's pattern — the same font, loaded
 *  the same way.
 */

/** LABELS AND VALUES ARE TWO SEPARATE <Text> OBJECTS, and that is the whole
 *  layout trick. Inter has no monospace companion in @pmndrs/assets and
 *  troika does not plumb through OpenType tabular figures, so a single
 *  "median  11.3 ms" string reflows every row every time a digit changes
 *  width — numbers that jitter sideways while you read them. Instead the
 *  labels are left-anchored in one object and the values right-anchored in
 *  another, with a shared line height. The values' right edge is pinned, so
 *  glyph widths cannot move anything, and the labels never change at all.
 *
 *  It is also the cheap arrangement: troika rebuilds its geometry on the main
 *  thread on every content change, and this way only ONE object rebuilds, four
 *  times a second, with the static half built once.
 *
 *  The cost of the trick is that the two columns have to stay the same LENGTH
 *  or every row below the mismatch is mislabelled, silently. That invariant
 *  lives in helpers/wristRows.ts, where a test can reach it. */
const LABELS = WRIST_ROWS.join("\n")

const values = () => wristValues(scanStats).join("\n")

/** Both halves of the bindings list, built once. */
const BINDING_KEYS = WRIST_BINDINGS.map(([key]) => key).join("\n")
const BINDING_ACTS = WRIST_BINDINGS.map(([, act]) => act).join("\n")

const FONT_SIZE = 0.0062
const LINE_HEIGHT = 1.45
const PAD = 0.008
/** The legend sits under the numbers, smaller and dimmer: it is a reminder,
 *  not a readout, and it must not compete with the figures being measured. */
const LEGEND_SIZE = 0.0049
/** DERIVED, not measured by eye. The legend has to start below the last
 *  number, and the number of rows changes whenever WRIST_ROWS does -- a
 *  hand-tuned offset would quietly overlap the moment a row is added. */
const ROWS_HEIGHT = WRIST_ROWS.length * FONT_SIZE * LINE_HEIGHT
const RULE_GAP = 0.004
const LEGEND_TOP = ROWS_HEIGHT + 0.009

/** Reused across frames; this runs inside a frame callback. */
const normal = new THREE.Vector3()
const toCamera = new THREE.Vector3()
const panelAt = new THREE.Vector3()

function Panel() {
  const group = useRef<THREE.Group>(null)
  const valueRef = useRef<THREE.Mesh>(null)
  const next = useRef(0)
  const font = (suspend(panelFont) as { default: string }).default

  useFrame(({ camera }) => {
    const g = group.current
    if (!g) return

    // --- facing, every frame, because the head and wrist both move -------
    //
    // Cheap: two world-matrix reads and a dot product. Hiding rather than
    // fading, because a translucent bright quad edge-on in a point cloud
    // reads as geometry — and misreading the instrument as data is the one
    // thing a measurement overlay must not cause.
    g.getWorldDirection(normal)
    camera.getWorldPosition(toCamera).sub(g.getWorldPosition(panelAt)).normalize()
    g.visible = normal.dot(toCamera) > WRIST_PANEL_FACING_MIN

    // --- content, four times a second, and only while facing ------------
    const now = performance.now()
    if (!g.visible || now < next.current) return
    next.current = now + 1000 / WRIST_PANEL_HZ
    // troika's Text exposes the fields it actually reads on the mesh; the
    // same cast CameraHotspot uses for fillOpacity.
    const t = valueRef.current as unknown as { text: string; sync: () => void } | null
    if (!t) return
    // MUTATED, NOT SET THROUGH REACT. Rendering this as `<Text>{values()}` at
    // 4 Hz would put a React commit on the frame thread four times a second
    // for a string nobody diffs usefully. troika's own `sync()` is the only
    // work that actually has to happen.
    t.text = values()
    t.sync()
  })

  const [w, h] = WRIST_PANEL_SIZE

  return (
    <group ref={group} position={WRIST_PANEL_OFFSET} rotation={[WRIST_PANEL_TILT, 0, 0]}>
      {/* The backing. `toneMapped` off to match the cloud, which is unlit by
          construction, and `depthWrite` off so the panel never punches a
          hole in points behind it when the wrist swings past them. */}
      <mesh raycast={() => null}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#0b0f14" transparent opacity={0.82} toneMapped={false} depthWrite={false} />
      </mesh>
      <Text
        font={font}
        fontSize={FONT_SIZE}
        lineHeight={LINE_HEIGHT}
        position={[-w / 2 + PAD, h / 2 - PAD, 0.001]}
        anchorX="left"
        anchorY="top"
        color="#7c8f9e"
        letterSpacing={0.04}
        raycast={() => null}
        material-toneMapped={false}
        material-depthWrite={false}
      >
        {LABELS}
      </Text>
      {/* A hairline between the numbers and the reminder, so the panel reads
          as two things rather than one long list. */}
      <mesh position={[0, h / 2 - PAD - ROWS_HEIGHT - RULE_GAP, 0.001]} raycast={() => null}>
        <planeGeometry args={[w - PAD * 2, 0.00035]} />
        <meshBasicMaterial color="#2b3a46" toneMapped={false} depthWrite={false} />
      </mesh>
      <Text
        font={font}
        fontSize={LEGEND_SIZE}
        lineHeight={LINE_HEIGHT}
        position={[-w / 2 + PAD, h / 2 - PAD - LEGEND_TOP, 0.001]}
        anchorX="left"
        anchorY="top"
        color="#5d7383"
        letterSpacing={0.04}
        raycast={() => null}
        material-toneMapped={false}
        material-depthWrite={false}
      >
        {BINDING_KEYS}
      </Text>
      <Text
        font={font}
        fontSize={LEGEND_SIZE}
        lineHeight={LINE_HEIGHT}
        position={[w / 2 - PAD, h / 2 - PAD - LEGEND_TOP, 0.001]}
        anchorX="right"
        anchorY="top"
        color="#8aa2b0"
        raycast={() => null}
        material-toneMapped={false}
        material-depthWrite={false}
      >
        {BINDING_ACTS}
      </Text>
      <Text
        ref={valueRef}
        font={font}
        fontSize={FONT_SIZE}
        lineHeight={LINE_HEIGHT}
        position={[w / 2 - PAD, h / 2 - PAD, 0.001]}
        anchorX="right"
        anchorY="top"
        color="#e8f1f5"
        raycast={() => null}
        material-toneMapped={false}
        material-depthWrite={false}
      >
        {/* The initial content. Replaced by mutation from the first tick. */}
        {values()}
      </Text>
    </group>
  )
}

/** A bare group living in the controller's grip space, registered so code
 *  outside the XR portal can read the hand's world pose every frame.
 *
 *  Renders nothing. It exists because `XRControllerState.object` is optional
 *  and tied to the controller MODEL -- see helpers/xrHands.ts. */
function GripProbe({ hand }: { hand: "left" | "right" }) {
  return (
    <XRSpace space="grip-space">
      <group
        ref={(node) => {
          xrHands[hand] = node
          return () => { if (xrHands[hand] === node) xrHands[hand] = null }
        }}
      />
    </XRSpace>
  )
}

/** The right controller: the library's own, plus a grip probe. */
export function RightController() {
  return (
    <>
      <DefaultXRController />
      <GripProbe hand="right" />
    </>
  )
}

/** The left controller, with the panel on its wrist.
 *
 *  Supplied to the store as `controller: { left: LeftControllerWithPanel }`.
 *  The library renders this inside the controller's **target-ray space**
 *  (elements.js:38), so the panel re-anchors to `grip-space` itself — the same
 *  thing `XRControllerModel` does (controller.js:62). Ray space points where
 *  you aim; the wrist is where the hand is, and a panel on the ray swings
 *  wildly as you point at things.
 *
 *  `<DefaultXRController/>` is rendered unchanged alongside it so the library
 *  keeps its model and both pointers — this adds a panel rather than
 *  replacing the controller.
 */
export function LeftControllerWithPanel() {
  return (
    <>
      <DefaultXRController />
      <GripProbe hand="left" />
      <XRSpace space="grip-space">
        {/* The font is a fetch; without this the whole controller — model and
            pointers included — would suspend until it landed. */}
        <Suspense fallback={null}>
          <Panel />
        </Suspense>
      </XRSpace>
    </>
  )
}

/** Exported only so a probe can mount the panel outside a session, where
 *  there is no controller and therefore no grip space to anchor to. */
export { Panel as WristPanelContents }
