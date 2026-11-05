"use client"

import { Suspense, useMemo } from "react"
import * as THREE from "three"
import { CombinedPointer, DefaultXRInputSourceRayPointer, XRSpace } from "@react-three/xr"

import { Pipboy } from "@/components/models/Pipboy"
import { xrHands } from "@/helpers/xrHands"
import { buildHandGeometry } from "@/lib/xr/handGeometry"
import { MENU_DISTANCE_M, PIPBOY_OFFSET, PIPBOY_ROTATION, PIPBOY_SCALE } from "@/config/xrScan"

/** What the wearer's hands look like, and what is strapped to the left one.
 *
 *  REPLACES WristPanel.tsx, whose permanent stats panel hung off the left grip
 *  for the whole session. The owner's note was that it should not be there at
 *  all: the readout belongs in a menu you summon by turning your wrist, and
 *  the forearm should carry the Pip-Boy instead.
 */

/** A bare group living in the controller's grip space, registered so code
 *  outside the XR portal can read the hand's world pose every frame.
 *
 *  Renders nothing. It exists because `XRControllerState.object` is optional
 *  and is assigned by whatever renders the controller MODEL -- and this file
 *  no longer renders the library's model at all, so relying on it would mean
 *  relying on something that is now never set. See helpers/xrHands.ts. */
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

/** One geometry per hand, built once at module scope rather than per mount --
 *  it never changes, and a merge on every session start is work for nothing. */
const HAND_GEOMETRY = {
  left: buildHandGeometry("left"),
  right: buildHandGeometry("right"),
}

function LowPolyHand({ hand }: { hand: "left" | "right" }) {
  // One material, shared, and NOT basic: the hands are the one thing in this
  // scene that wants to be lit. A point cloud carries its own colour and is
  // unlit by construction, so the scene had no lights at all and the
  // library's default controller/hand models rendered as black silhouettes --
  // reported as "the hands are there but there's no light, I can't see
  // anything". ScanExperience now carries a small two-light rig for exactly
  // these, and a standard material is what makes the facets read.
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#c8d2d8", roughness: 0.85, metalness: 0.0, flatShading: true }),
    [],
  )
  return (
    <XRSpace space="grip-space">
      {/* Not a pointer target. The ray has a menu to hit, and a prop attached
          to your own arm must never be the thing in front of it. */}
      <mesh geometry={HAND_GEOMETRY[hand]} material={material} raycast={() => null} />
    </XRSpace>
  )
}

/** THE LIBRARY'S OWN MODEL IS NEVER RENDERED, not hidden behind ours.
 *
 *  This composes `DefaultXRController`'s parts by hand instead of using it,
 *  for one reason only: the ray pointer's `renderOrder` has to be raised above
 *  the always-on-top menu, and `DefaultXRController` offers no way through to
 *  it. Leaving the model out buys the same thing `model={false}` did -- no GLB
 *  fetch, and that fetch comes from a CDN (`DefaultAssetBasePath` in
 *  @pmndrs/xr is a jsDelivr URL), which this project otherwise avoids for
 *  runtime assets.
 *
 *  It does NOT remove the other CDN dependency, which is worth writing down
 *  because it is invisible and more serious: the controller LAYOUT is fetched
 *  from the same base path by `XRControllerLayoutLoader`, constructed in the
 *  input plumbing for every controller whatever is rendered, and the layout is
 *  what populates `state.gamepad`. Until it lands there is no gamepad state at
 *  all, so every binding -- sticks, grips, A/B/X/Y -- depends on that fetch
 *  succeeding. Fixing it means vendoring the profiles and setting
 *  `baseAssetPath` on the store.
 */
function Controller({ hand }: { hand: "left" | "right" }) {
  return (
    <>
      {/* `<DefaultXRController/>`'s pointers, minus its model, spelled out --
          because the ray's own render order has to be raised.
          
          THE CURSOR HAS TO COME BACK OUT IN FRONT. The menu draws with
          `depthTest: false` so the point cloud cannot occlude it, and that
          puts it over the hands, the Pip-Boy and -- without this -- the
          pointer's own cursor. A menu you cannot see your aim on is worse than
          one behind the cloud. Both model options accept `renderOrder`
          (@pmndrs/xr pointer/cursor.d.ts:19, ray.d.ts:7), so the ray and its
          cursor sit just above the panel's 1000.
          
          No GRAB pointer, deliberately: it is a sphere at the fist that fires
          `click` on squeeze, and squeeze is already bound to grabbing the
          point cloud. Omitting it removes the conflict at the root rather than
          denying it per object.

          `maxLength` IS THE DRAWN BEAM ONLY -- hit-testing is unbounded and
          always was. @pmndrs/xr draws
          `Math.min(options.maxLength ?? 1, intersection.distance)`
          (pointer/ray.js:31), so the default 1 m left the beam stopping in mid
          air short of a panel that was at 1.3 m and is now at 2.0 m. Nothing
          was broken by that -- the cursor still landed on the buttons -- but a
          ray that visibly ends before the thing it is pointing at reads as not
          reaching, which is exactly the doubt behind the owner's "the user
          still needs to be able to interact with it". 2.2 clears
          MENU_DISTANCE_M with margin, and because the beam is also clipped to
          the real intersection distance, a longer cap cannot make it overshoot
          anything it actually hits. */}
      <CombinedPointer>
        <DefaultXRInputSourceRayPointer
          makeDefault
          minDistance={0.2}
          rayModel={{ maxLength: MENU_DISTANCE_M + 0.2, renderOrder: 1001 }}
          cursorModel={{ renderOrder: 1002 }}
        />
      </CombinedPointer>
      <GripProbe hand={hand} />
      <LowPolyHand hand={hand} />
    </>
  )
}

export function RightController() {
  return <Controller hand="right" />
}

export function LeftController() {
  return (
    <>
      <Controller hand="left" />
      {/* The Pip-Boy, on the forearm. A prop with no live text -- turning the
          wrist to look at it is what raises the real menu.

          Suspense around it alone, so a model still downloading cannot take
          the hand and the pointers down with it. */}
      <XRSpace space="grip-space">
        <Suspense fallback={null}>
          <Pipboy position={PIPBOY_OFFSET} rotation={PIPBOY_ROTATION} scale={PIPBOY_SCALE} />
        </Suspense>
      </XRSpace>
    </>
  )
}
