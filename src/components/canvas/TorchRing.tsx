"use client"

import { useRef, useState, type RefObject } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { Torch } from "@/components/models/Torch"
import { TORCH_SITES } from "@/config/torches"

/** How bright each torch's own light gets, against the campfire's.
 *
 *  A fraction of it: the campfire is a bonfire on the beach you stand next
 *  to, these are eight small flames on islands you mostly see from a
 *  distance, and at full strength they washed the rock out. */
const TORCH_GLOW_SHARE = 0.34

/** How far a torch's light reaches. Short, so eight of them do not add up
 *  into a general lift across the whole scene. */
const TORCH_LIGHT_DISTANCE = 5.5

/** Two torches on each floating island, lit from dusk to dawn.
 *
 *  THE CAMPFIRE'S OWN MACHINERY, REUSED RATHER THAN REBUILT. Environment
 *  holds the only tweened day/night blend in the project and decides from it
 *  whether a fire is burning -- with two thresholds, so a flame cannot
 *  flicker on and off as the blend crosses one value. Those two refs are
 *  passed in here and this applies them, which is why the torches ignite on
 *  exactly the same beat as the campfire rather than on a second, slightly
 *  different clock.
 *
 *  Reading a ref the parent wrote THIS frame is sound here for the reason
 *  PortalRoom records doing the same: the parent mounts first, so at equal
 *  frame priority its callback has already run.
 *
 *  On bloom: there is no selective bloom in this project -- one global
 *  `<Bloom luminanceThreshold={0.9}>` and the only way in is to be brighter
 *  than the threshold, which is what Sun.tsx does by multiplying its colour
 *  past 1.0. So a torch glows the way the campfire does: mostly by its
 *  point light, with the flame material already carrying an emissive of
 *  [1, 0.54, 0] from the file.
 */
/** The flame's colour. A constant, because `campfireColor` is "#ff7a30" in
 *  all four phase presets -- a ref for it would be a prop that never
 *  changes. */
const TORCH_COLOUR = "#ff7a30"

export function TorchRing({
  litRef,
  glowRef,
}: {
  litRef: RefObject<boolean>
  glowRef: RefObject<number>
}) {
  // Mirrored into state so the flame geometry can be unmounted rather than
  // merely dimmed. Flips twice a day-cycle at most, which is the same
  // argument HotspotPortal makes for setting state from a frame callback.
  const [lit, setLit] = useState(false)
  const lights = useRef<THREE.Group>(null)

  useFrame(() => {
    if (litRef.current !== lit) setLit(litRef.current)
    const group = lights.current
    if (!group) return
    const intensity = glowRef.current * TORCH_GLOW_SHARE
    for (const child of group.children) {
      const light = child as THREE.PointLight
      if (!light.isPointLight) continue
      light.intensity = intensity
    }
  })

  return (
    <>
      <group ref={lights}>
        {TORCH_SITES.map((site, i) => (
          <pointLight
            key={`torch-light-${i}`}
            // Just above the head of the torch, where the flame is.
            position={[site.position[0], site.position[1] + 0.9, site.position[2]]}
            distance={TORCH_LIGHT_DISTANCE}
            decay={2}
            intensity={0}
            color={TORCH_COLOUR}
          />
        ))}
      </group>
      {TORCH_SITES.map((site, i) => (
        <Torch
          key={`torch-${i}`}
          lit={lit}
          position={site.position}
          rotation={[0, site.rotationY, 0]}
          // MEASURED, NOT PICKED. At 0.17 the whole torch was 0.39 world
          // units -- about ten pixels tall from the home viewpoint, which
          // is why eight lit torches were invisible in the night
          // screenshot. 0.6 puts it near 1.4 units, a third the height of
          // the trees already standing on the same islands.
          scale={0.6}
        />
      ))}
    </>
  )
}
