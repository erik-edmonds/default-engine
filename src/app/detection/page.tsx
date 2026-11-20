import type { Metadata } from "next"

import { DetectionMount } from "@/app/detection/DetectionMount"

/** This file claims the route and the metadata; the demo itself is a client
 *  component, for the same reason every other canvas on this site is.
 *
 *  OUT OF THE (work) ROUTE GROUP ON PURPOSE. This page used to be a write-up
 *  under app/(work)/, which wraps every child in `.pf`/`.pf-wrap` with its own
 *  back link and prose stylesheet. What is here now is a full-bleed canvas,
 *  and it cannot live inside that frame. The URL is unchanged either way --
 *  a route group contributes nothing to the path -- so moving the folder was
 *  the entire change. app/mini-game/ and app/scan/[id]/ are the precedents.
 */
export const metadata: Metadata = {
  title: "Structure from Motion | Erik Edmonds",
  description:
    "A live structure-from-motion demo running OpenCV in the browser: ORB features, matching, pose recovery and triangulation, with the reconstruction built in front of you.",
}

export default function Page() {
  return <DetectionMount />
}
