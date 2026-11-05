"use client"

import { useMemo, useRef } from "react"
import { signal } from "@preact/signals-core"
import { useFrame } from "@react-three/fiber"
import { Container, Root, Text } from "@react-three/uikit"

import { scanStats } from "@/helpers/scanStats"
import { setColorMode } from "@/helpers/colorMode"
import { WRIST_ROWS, WRIST_SPACERS, wristColumns, wristValues } from "@/helpers/wristRows"
import { COLOR_MODES, COLOR_MODE_LABELS } from "@/config/asprs"
import { MENU_PIXEL_SIZE, MENU_SIZE_M, READOUT_HZ, XR_BUDGET_STEPS } from "@/config/xrScan"

/** The menu the wrist turn raises. The ONLY file that imports uikit.
 *
 *  Kept to one file, behind a lazy import in ScanMenuHost, so uikit, its
 *  flexbox engine and its font atlas are never in the desktop route's graph
 *  and are never evaluated for a visitor who does not own a headset.
 *
 *  A FULL PANEL, NOT A WRIST CARD. It fills most of the comfortable field of
 *  view at a reading distance -- see MENU_DISTANCE_M for why that is less
 *  tiring than a small card held close, which is what this replaced.
 */

/** WRITTEN THROUGH SIGNALS, NOT THROUGH REACT.
 *
 *  uikit re-applies every property of every component in the subtree on each
 *  React render -- its `useLayoutEffect(() => ref.current?.resetProperties())`
 *  carries no dependency array -- so re-rendering twenty rows four times a
 *  second would push all of that through a validation schema eighty times a
 *  second, on the thread that draws the frame. A signal written in `useFrame`
 *  updates the text and nothing else: no render, no prop diffing.
 *
 *  The same discipline the wrist panel this replaced already had, for the same
 *  reason -- this route measures its own frame times and the readout must not
 *  perturb the number it reports. */
const valueSignals = WRIST_ROWS.map(() => signal(""))

const INK = "#e8f1f5"
const DIM = "#7c8f9e"
const EDGE = "#243139"

export default function ScanMenu({
  onToggleScale,
  onBudget,
  onReset,
}: {
  onToggleScale: () => void
  onBudget: (budget: number) => void
  onReset: () => void
}) {
  const nextTick = useRef(0)

  useFrame(() => {
    const now = performance.now()
    if (now < nextTick.current) return
    nextTick.current = now + 1000 / READOUT_HZ
    const values = wristValues(scanStats)
    for (let i = 0; i < valueSignals.length; i++) {
      if (valueSignals[i].value !== values[i]) valueSignals[i].value = values[i]
    }
  })

  const rows = useMemo(() => WRIST_ROWS.map((label, i) => ({ label, value: valueSignals[i] })), [])
  /** TWO COLUMNS, AND IT FIXES A BUG RATHER THAN DECORATING ONE.
   *
   *  A single column of 19 rows needed ~442 uikit px and the panel leaves 427,
   *  so the bottom row was already being clipped before this phase added any
   *  -- and the bottom row is `roll`, the live wrist angle the gate thresholds
   *  are meant to be tuned against. See `wristColumns`, which also explains
   *  why the break may only fall on a spacer. */
  const columns = useMemo(() => wristColumns(WRIST_ROWS.length, WRIST_SPACERS), [])
  const [sizeX, sizeY] = MENU_SIZE_M

  return (
    <Root
      // Metres. `pixelSize` scales the flexbox values INSIDE, not these -- a
      // mistake that once produced a 537 x 520 METRE panel filling the whole
      // view in solid black, which read exactly like the point cloud had
      // stopped rendering. See MENU_SIZE_M.
      pixelSize={MENU_PIXEL_SIZE}
      sizeX={sizeX}
      sizeY={sizeY}
      flexDirection="column"
      backgroundColor="#0b0f14"
      borderRadius={22}
      borderWidth={1}
      borderColor={EDGE}
      overflow="hidden"
      // IN FRONT OF EVERYTHING, SET ONCE, NEVER PER CHILD.
      //
      // At 1:1 the point cloud surrounds the wearer, so anything nearer than
      // the panel occluded it -- the menu was reported as being "behind the
      // point cloud". Switching off the depth test removes the occlusion and
      // a high render order puts it last in the transparent pass.
      //
      // Once on the root is enough, and that is not an assumption: `depthTest`,
      // `depthWrite` and `renderOrder` are the first three entries of uikit's
      // `inheritedPropertyKeys` (properties/inheritance.js:1-4), so they reach
      // every descendant -- including Text, whose glyphs carry a separate MSDF
      // material (instanced-glyph-group.js:68,185), and the borders, which the
      // panel shader draws from the same instance buffer.
      //
      // `renderOrder` is compared BEFORE any z or order-info logic in the sort
      // uikit installs globally (order.js:9-11), so raising it uniformly lifts
      // the whole UI above the scene WITHOUT scrambling its internal layering:
      // ties fall through to `compareOrderInfo`, which is what keeps text
      // above its own background.
      //
      // AND NEVER VARY THEM PER CHILD. All three are part of the instanced
      // group's cache key (group-manager.js:33-41), so each distinct
      // combination allocates another InstancedPanelMesh and another draw
      // call -- on a route that puts its own draw-call count on this panel.
      depthTest={false}
      renderOrder={1000}
    >
      {/* --- title bar ------------------------------------------------ */}
      <Container
        flexDirection="row"
        alignItems="center"
        justifyContent="space-between"
        paddingX={26}
        paddingY={16}
        borderBottomWidth={1}
        borderColor={EDGE}
        flexShrink={0}
      >
        <Text fontSize={22} color={INK}>Scan</Text>
        {/* NO CLOSE BUTTON. The wrist opens and closes this, so a control that
            does the same thing is clutter -- but with the button gone the
            wrist is the ONLY way out, and nothing on screen would otherwise
            say so. A line of text is the cheapest way to make a gesture
            discoverable. */}
        <Text fontSize={15} color={DIM}>turn your wrist to close</Text>
      </Container>

      <Container flexDirection="row" flexGrow={1} overflow="hidden">
        {/* --- controls, as a sidebar -------------------------------- */}
        <Container
          flexDirection="column"
          gap={14}
          width={286}
          flexShrink={0}
          padding={22}
          // Its own slightly lifted ground, so the panel reads as two regions
          // rather than one undifferentiated sheet of numbers.
          backgroundColor="#121a21"
          borderRightWidth={1}
          borderColor={EDGE}
        >
          <Text fontSize={13} color={DIM} letterSpacing={2}>SCALE</Text>
          <Container flexDirection="row" gap={10}>
            <MenuButton label="Tabletop" onClick={onToggleScale} grow />
            <MenuButton label="1:1" onClick={onToggleScale} grow />
          </Container>

          <Text fontSize={13} color={DIM} letterSpacing={2} marginTop={10}>BUDGET</Text>
          <Container flexDirection="row" flexWrap="wrap" gap={8}>
            {XR_BUDGET_STEPS.map((step) => (
              <MenuButton
                key={step}
                label={step >= 1_000_000 ? `${step / 1_000_000}M` : `${step / 1000}k`}
                onClick={() => onBudget(step)}
              />
            ))}
          </Container>

          {/* COLOUR. The annotation pipeline's output is only a deliverable
              if someone can see it, and this is the control that shows it:
              the file's own RGB, the corrected ASPRS class, or height above
              ground. No active-state highlight, matching SCALE above -- the
              readout's `colour` row says which is in force, and showing it on
              the button would mean re-rendering this subtree on every change,
              which is exactly what the signals above exist to avoid. */}
          <Text fontSize={13} color={DIM} letterSpacing={2} marginTop={10}>COLOUR</Text>
          <Container flexDirection="row" gap={8}>
            {COLOR_MODES.map((mode) => (
              <MenuButton
                key={mode}
                label={COLOR_MODE_LABELS[mode]}
                onClick={() => setColorMode(mode)}
                grow
              />
            ))}
          </Container>

          <Container flexGrow={1} />
          <MenuButton label="Reset view" onClick={onReset} grow />
        </Container>

        {/* --- readout, in two columns ------------------------------- */}
        <Container flexDirection="row" flexGrow={1} padding={22} gap={18}>
          {columns.map((indices, c) => (
            <Container key={c} flexDirection="column" flexGrow={1} gap={3}>
              {indices.map((i) =>
                rows[i].label === "" ? (
                  <Container key={`gap-${i}`} height={11} flexShrink={0} />
                ) : (
                  <Container
                    key={rows[i].label}
                    flexDirection="row"
                    justifyContent="space-between"
                    flexShrink={0}
                  >
                    <Text fontSize={17} color={DIM}>{rows[i].label}</Text>
                    {/* A FIXED WIDTH, right-aligned -- the uikit translation of
                        the two-troika-object trick the wrist panel used, and
                        for the same two reasons: digits cannot shove the row
                        around as they change width, and a content change
                        inside a fixed box cannot dirty the flexbox layout
                        above it. Narrowed from 190 to fit two columns in the
                        476px the readout gets; the widest value on the panel
                        is a point count like "3,000,000", about 81px at this
                        size. */}
                    <Text fontSize={17} color={INK} width={128} textAlign="right">{rows[i].value}</Text>
                  </Container>
                ),
              )}
            </Container>
          ))}
        </Container>
      </Container>
    </Root>
  )
}

/** A button sized to be hit with a ray from across the room.
 *
 *  ANGULAR SIZE IS THE ONLY THING THAT MATTERS HERE, which is why these
 *  numbers did not change when the panel moved from 1.3 m to 2.0 m: a 16px
 *  label is 0.11 m tall at MENU_PIXEL_SIZE and subtends ~3.2 degrees at 2.0 m,
 *  where before it was 0.07 m subtending ~3.1 degrees at 1.3 m. The panel and
 *  its pixel grew by the same 1.538 as the distance, so every target holds its
 *  angle -- see MENU_SIZE_M.
 *
 *  ~3 degrees is comfortably larger than the jitter in a hand holding a
 *  controller at arm's length. Targets that are too small are the main reason
 *  in-headset menus feel bad to use. */
function MenuButton({ label, onClick, grow }: { label: string; onClick: () => void; grow?: boolean }) {
  return (
    <Container
      paddingX={16}
      paddingY={12}
      borderRadius={10}
      borderWidth={1}
      borderColor={EDGE}
      backgroundColor="#1b2730"
      hover={{ backgroundColor: "#ff9d4d", borderColor: "#ff9d4d" }}
      active={{ backgroundColor: "#d25a1a" }}
      onClick={onClick}
      flexGrow={grow ? 1 : undefined}
      justifyContent="center"
      // DENY THE GRAB POINTER. Squeeze is bound to grabbing the point cloud,
      // and a grab pointer is a sphere at your fist that fires `click` on
      // squeeze -- so without this, reaching toward a button both presses it
      // and starts dragging the survey. The trigger's ray is the only thing
      // that should press anything.
      pointerEventsType={{ deny: ["grab", "touch"] }}
      cursor="pointer"
    >
      <Text fontSize={16} color={INK}>{label}</Text>
    </Container>
  )
}
