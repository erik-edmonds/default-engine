import { IslandMount } from "@/components/island/IslandMount"

/** THE HOME ROUTE, AND IT IS A SERVER COMPONENT AGAIN.
 *
 *  This file used to BE the island -- eighteen hundred lines of `"use
 *  client"` scene, which meant the homepage could say nothing at all until
 *  that bundle had downloaded, parsed and found a GPU. For a portfolio that
 *  was a reasonable trade. For a site whose job is to explain a service to
 *  someone who may be on a rural connection, it is the wrong way round.
 *
 *  The island moved to `components/island/IslandExperience.tsx` byte for
 *  byte, with one line changed: the name of its default export. Nothing
 *  about the scene's behaviour moved with it, and `git log --follow` keeps
 *  its history.
 *
 *  What this file is for now is everything a Server Component can do that a
 *  client one cannot: `metadata`, structured data, and -- next -- the hero
 *  copy, rendered into the HTML so it is readable, selectable and indexable
 *  before a single byte of three.js arrives. */
export default function Page() {
  return <IslandMount />
}
