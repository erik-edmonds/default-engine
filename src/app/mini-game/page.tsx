import type { Metadata } from "next"

import { RacingGame } from "./RacingGame"

export const metadata: Metadata = {
  title: "Mini-Game",
  description: "A little car racing game — drive it with WASD.",
}

/** This file claims the route and the metadata; the game itself is a client
 *  component, for the same reason every other canvas on this site is. */
export default function Page() {
  return <RacingGame />
}
