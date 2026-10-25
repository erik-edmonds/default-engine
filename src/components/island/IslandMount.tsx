"use client"

import dynamic from "next/dynamic"

/** THE ISLAND, LOADED ON THE CLIENT AND ONLY ON THE CLIENT.
 *
 *  `ssr: false` is both necessary and the whole point.
 *
 *  Necessary because the island touches `window` on mount and there is no
 *  value in prerendering a canvas -- the server would produce an empty
 *  `<div>` and pay for the attempt.
 *
 *  The point because it moves eighteen hundred lines of scene code, plus
 *  three, drei and postprocessing, out of the initial HTML payload. That is
 *  what makes it worth server-rendering the page's words: the business copy
 *  arrives and is readable while this chunk is still being fetched, rather
 *  than after it.
 *
 *  IT HAS TO LIVE IN A CLIENT COMPONENT. Next 16's lazy-loading guide is
 *  explicit: "`ssr: false` option is not supported in Server Components. You
 *  will see an error if you try to use it in Server Components." So this
 *  file exists to carry the directive, and `app/page.tsx` stays a Server
 *  Component that can export metadata and render structured data.
 *
 *  And `dynamic()` is called at module scope, not inside the component, for
 *  the reason the same guide gives: "dynamic() can't be used inside of React
 *  rendering as it needs to be marked in the top level of the module". */
const IslandExperience = dynamic(() => import("@/components/island/IslandExperience"), {
  // No `loading` fallback on purpose. The island owns its own entrance --
  // LoadingScreen renders inside it, gates on `useProgress`, and holds the
  // Enter button. A second plate here would flash in front of that one.
  ssr: false,
})

export function IslandMount() {
  return <IslandExperience />
}
