import { Base } from '@/components/models/Base'
import { Beacon } from '@/components/models/Beacon'

export function Hologram(props) {
    const [x, y, z] = props.position
    return (
    <>
        <Beacon route={props.route} scale={props.scale} position={[x, y+1.4, z]}  />
        <Base scale={props.scale* 1.25} position={[x, y, z]} />
    </>
  )
}