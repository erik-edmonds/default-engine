"use client"

import { useFrame } from "@react-three/fiber"
import { useAtomValue } from "jotai"

import { skySequenceStarted } from "@/helpers/StateProvider"
import { SKY_GRAIN_OPACITY, skyAltitudeShare } from "@/config/paperSky"
import { skyGrain } from "@/helpers/skyGrain"

/** Drives the film grain's strength. The effect itself is mounted in the
 *  composer in app/page.tsx; this only says how much of it to show.
 *
 *  "Add noise to the sky scene to make it look like an old time grainy
 *  texture of homemade films." The island is a lit, rendered world and wants
 *  none of it; the paper world is a thing made of cut card and shot on
 *  something cheap, and grain is most of what sells that.
 *
 *  TIED TO ALTITUDE, not to a flag, and that is the whole reason this is a
 *  frame loop rather than a prop. The backdrop, the field of view and the
 *  paper world's own fade all cross over on skyAltitudeShare during the climb
 *  -- so grain that switched on with a boolean would arrive on one frame,
 *  somewhere in the middle of a five-second tween, while everything around it
 *  was still dissolving. Sharing the ramp means the grain comes up with the
 *  paper, which is the only way it reads as a property of the film rather
 *  than as an effect that was turned on.
 *
 *  WRITTEN THROUGH A REF, not through the effect's `opacity` prop. Changing a
 *  prop on a child of <EffectComposer> is a re-render, and this file's
 *  neighbours carry a long note about what re-rendering that subtree costs:
 *  mounting or unmounting a child rebuilds the whole pass chain mid-session,
 *  and the frame that came back afterwards had the entire paper world missing
 *  from it. <Bloom> next door is driven the same way and for the same reason.
 *  Sixty writes a second to one uniform is the cheap option here.
 *
 *  The effect arrives through module state (helpers/skyGrain) rather than as
 *  a ref prop, which is not a style choice: a ref handed down through render
 *  is the caller's value, and writing through one from a frame callback is
 *  exactly what react-hooks/immutability rejects. */
export function SkyGrain() {
  const started = useAtomValue(skySequenceStarted)

  useFrame((state) => {
    const effect = skyGrain.effect
    // Zero unless the sequence is running at all, so the island is never
    // grainy even at the top of a hotspot flight that happens to be high up.
    const share = started ? skyAltitudeShare(state.camera.position.y) : 0
    const opacity = SKY_GRAIN_OPACITY * share
    if (effect) effect.blendMode.opacity.value = opacity
    // PUBLISHED, because "there was no graininess added" is not a thing that
    // can be settled by looking at a screenshot of a paper texture. Whether
    // the effect was ever handed to this file at all, and what it is being
    // driven to, are two different failures and this tells them apart.
    state.scene.userData.skyGrain = { wired: Boolean(effect), opacity, share }
  })

  return null
}
