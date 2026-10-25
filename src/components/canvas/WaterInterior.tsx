"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"
import { easing } from "maath"

import { WaterScene } from "@/components/canvas/water/WaterScene"
import { FishSchool } from "@/components/canvas/FishSchool"
import { useScrollOffset } from "@/helpers/useScrollOffset"
import { POOL_DEPTH, POOL_HALF_LENGTH, POOL_HALF_WIDTH, SCROLL_RANGE } from "@/config/pool"

/* SHELVED, AND IN ITS OWN FILE SO THAT SHELVING IT COSTS NOTHING.
 *
 * No portal names `interior: "water"` any more -- the Models portal holds a
 * VR headset. This stays, compiling and ready, because the owner wants the
 * water back for something else.
 *
 * It had to MOVE to be genuinely shelved. While PortalInteriors imported it
 * directly, merely keeping it around pulled the whole water subsystem --
 * WaterScene, eight lib files, eleven shaders, FishSchool -- into the island
 * bundle, and FishSchool's module-scope `useGLTF.preload("/models/fish.glb")`
 * ran on every island load for a portal nobody could open. Measured: fish.glb
 * was still being fetched after the swap, which is what sent it here.
 *
 * Behind a React.lazy boundary it costs nothing until something renders it.
 * Putting it back is one line in config/portals.ts.
 */

/** The work, underwater. The whole of it -- there is nowhere else to go.
 *
 *  The real WaterScene, the same simulation that used to fill /portfolio, as an
 *  empty pool you scroll down through. The project cards that hung in it have
 *  been taken out: each was a portal inside this portal, and the items are
 *  going into the water directly instead. This is still why the portal prints
 *  no title, no blurb and no "View the work" button -- you are inside the work,
 *  and the page that button pointed at was a second copy of it and is retired.
 *
 *  Sized for the aperture, which is the only reason WaterScene takes dimensions
 *  at all -- its own defaults build a pool as wide as the viewport around a
 *  five-stop card column, and through a 1.5 x 2.43 window you would see one
 *  arbitrary band of that.
 *
 *  `quality="portal"` drops the caustics from 1024 square to 256 and caps the
 *  reflection targets. Those passes run every frame the room is awake, and the
 *  full-screen sizes bought nothing at this scale. */
export default function WaterInterior({ open = false }: { open?: boolean }) {
  const column = useRef<THREE.Group>(null)
  const displayY = useRef(0)

  // Scroll descends the pool. The camera CANNOT descend -- it is parked 0.3 in
  // front of the portal plane, and the interior is a separate scene rendered
  // with that same camera -- so the pool rises past the window instead. The
  // effect through the glass is identical and it needs no camera authority,
  // which the island page would fight for anyway.
  //
  // The range is NEGATIVE and the sign flips on the way out, which keeps the
  // hook's convention identical to Rig's: there, scrolling down drives the
  // offset negative and the camera descends with it. Here the same negative
  // offset has to raise the column, so it is negated at the one place it is
  // applied. Getting this backwards clamps instantly at the top and the pool
  // simply refuses to move, which is how the first version behaved.
  const { target, reset } = useScrollOffset({ min: -SCROLL_RANGE, max: 0, speed: 0.004, enabled: open })
  useEffect(() => { if (!open) reset() }, [open, reset])

  useFrame((_state, delta) => {
    if (!column.current) return
    easing.damp(displayY, "current", target.current, 0.25, delta)
    column.current.position.y = -displayY.current
  })

  return (
    // Further back than the first version's -2.4, so the window looks into the
    // volume rather than pressing against the near wall -- but not so far that
    // the camera leaves the box. See POOL_HALF_LENGTH.
    <group position={[0, 1.15, -3]}>
      <group ref={column}>
        <WaterScene
          poolWidth={POOL_HALF_WIDTH}
          poolLength={POOL_HALF_LENGTH}
          poolFloorDepth={POOL_DEPTH}
          waterYOffset={0.9}
          quality="portal"
          // Still water until you are actually in it. The room wakes as soon as
          // you park at the viewpoint, and simulating from there cost 38% of the
          // frame for a window you have not stepped through -- see `active`.
          active={open}
        />
        {/* The four project cards hung here, each one a MeshPortalMaterial with
            a point cloud inside it -- a portal inside a portal, four extra
            render targets drawn every frame inside another portal's own render.
            They are gone; the items go straight into the water instead.

            The column, its depth and its scroll all stay. CARD_TOP, CARD_GAP
            and CARD_SCALE in config/projects.ts are the geometry whatever goes
            in next will hang on, which is why that file is still here. */}

        {/* Inside the scrolling column, so the school stays with the water
            as the pool rises past the window rather than hanging in front
            of it. Only while the room is awake: fourteen animation mixers
            stepping behind a window nobody has looked through is the same
            waste `active` above exists to avoid. */}
        {open && <FishSchool />}
      </group>
    </group>
  )
}
