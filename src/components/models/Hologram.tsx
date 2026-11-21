import { Base } from '@/components/models/Base'
import { Beacon } from '@/components/models/Beacon'

type HologramProps = {
  /** Where the hologram stands, in island world space. Owned by the CALL SITE
   *  (Scene.tsx) and deliberately not defaulted here -- the two pieces below
   *  are offset from it, so this component's whole job is to take one position
   *  and place both parts relative to it. */
  position: [number, number, number]
  scale: number
  route?: string
}

export function Hologram(props: HologramProps) {
    const [x, y, z] = props.position
    return (
    <>
        <Beacon route={props.route} scale={props.scale} position={[x, y+1.4, z]}  />
        <Base scale={props.scale* 1.25} position={[x, y, z]} />
    </>
  )
}
