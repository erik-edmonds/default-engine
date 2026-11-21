import { Base } from '@/components/models/Base'
import { BeaconCompanion } from '@/components/canvas/BeaconCompanion'

type HologramProps = {
  /** Where the hologram stands, in island world space. Owned by the CALL SITE
   *  (Scene.tsx) and deliberately not defaulted here -- the two pieces below
   *  are offset from it, so this component's whole job is to take one position
   *  and place both parts relative to it. */
  position: [number, number, number]
  scale: number
  route?: string
  /** What clicking the beacon does. Scene.tsx fires the optics run; /Blob
   *  passes nothing and keeps the route push, which also means no run is ever
   *  started there and the companion flight stays dormant. */
  onActivate?: () => void
}

export function Hologram(props: HologramProps) {
  const [x, y, z] = props.position
  return (
    <>
      {/* THE TWO PIECES ARE SEPARATE ELEMENTS, not one group, and that is
          load-bearing rather than tidy: the beacon LEAVES. It lifts off,
          loops, and parks itself at the bottom of the screen as a companion,
          while the pedestal stays on the pier. A single group would drag the
          pedestal along with it.

          This file still owns the offset -- where the beacon rests relative
          to its base -- and BeaconCompanion owns everything that happens to
          it afterwards. */}
      <BeaconCompanion
        position={[x, y + 1.4, z]}
        scale={props.scale}
        route={props.route}
        onActivate={props.onActivate}
      />
      <Base scale={props.scale * 1.25} position={[x, y, z]} />
    </>
  )
}
