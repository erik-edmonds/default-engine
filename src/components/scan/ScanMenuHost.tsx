"use client"

import { Suspense, lazy, useSyncExternalStore } from "react"
import { createPortal, useThree } from "@react-three/fiber"

import { menuServerSnapshot, menuSnapshot, subscribeMenu } from "@/helpers/xrMenu"
import { MENU_DISTANCE_M, MENU_DROP_M, MENU_PREVIEW_DISTANCE_M } from "@/config/xrScan"

/** LAZY, and that is the point of this file existing at all.
 *
 *  uikit, its flexbox engine (yoga) and its font atlas come to roughly a
 *  megabyte, and none of it is of any use to a visitor looking at a point
 *  cloud on a monitor. Behind `lazy` it is not in `/scan/[id]`'s first load
 *  and is never evaluated until a wrist actually turns inside a session.
 *
 *  Keeping the boundary in its own thin component also keeps ScanExperience
 *  free of any uikit import, so the desktop route cannot accidentally pull it
 *  in through a shared module later. */
const ScanMenu = lazy(() => import("@/components/scan/ScanMenu"))

/** HEAD-LOCKED BY PARENTING, NOT BY ARITHMETIC.
 *
 *  The panel is portalled into the CAMERA, so its pose is the head's pose and
 *  nothing has to be computed, copied or kept in step. It is centred in view
 *  from any head orientation, for free, every frame.
 *
 *  THIS REPLACED A REAL BUG, and the shape of the bug is why parenting is the
 *  right mechanism. The previous version computed a world-space pose from
 *  `camera.getWorldPosition()` and decomposed it into a group's
 *  `position`/`quaternion` -- but that group was a child of `<XROrigin>`, so
 *  those fields are LOCAL to the origin, and `XrNavigate` writes the origin's
 *  position on every stick push and its yaw on every snap turn. The panel
 *  therefore landed at `origin ∘ worldPose`: correct before you moved, and
 *  thrown however far you had walked afterwards. At 1:1 that put it out in the
 *  middle of the survey.
 *
 *  Expressing "in front of the head" as a parent-child relationship means
 *  there is no second coordinate space for the two to disagree about.
 *
 *  `createPortal` rather than `camera.add(ref.current)` in an effect: R3F has
 *  already attached the group to its JSX parent, and re-parenting behind its
 *  back leaves it trying to detach the node from a parent it no longer has.
 *  uikit's own `<Fullscreen>` attaches to the camera the same way.
 */
export function ScanMenuHost(props: {
  onToggleScale: () => void
  onBudget: (budget: number) => void
  onReset: () => void
}) {
  const open = useSyncExternalStore(subscribeMenu, menuSnapshot, menuServerSnapshot)
  // The camera three is actually rendering with. In a session `<XR>` swaps
  // this for `gl.xr.getCamera()`, whose transform is the head pose and which
  // `XROrigin` has already added to the scene graph -- so children of it are
  // traversed and drawn. Reading it through the store means the portal
  // re-targets itself when a session starts or ends.
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  if (!open) return null

  // On a monitor the panel is pushed back -- see MENU_PREVIEW_DISTANCE_M. It
  // is still head-locked; only the offset from the camera changes.
  const presenting = gl.xr.isPresenting
  const distance = presenting ? MENU_DISTANCE_M : MENU_PREVIEW_DISTANCE_M

  return createPortal(
    // -Z is forward from the camera. `MENU_DROP_M` sits it a touch below the
    // eyeline so the horizon of the scene is not dead centre behind it.
    <group position={[0, -MENU_DROP_M, -distance]}>
      <Suspense fallback={null}>
        <ScanMenu {...props} />
      </Suspense>
    </group>,
    camera,
  )
}
