"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useThree, useFrame } from "@react-three/fiber"
import { LensFlareEffect } from "@react-three/postprocessing"
import { BlendFunction } from "postprocessing"

import { sunState } from "@/helpers/sunTracker"

// Warm gain for the flare's ghosts and streaks. This is a *gain*, not a
// colour -- the effect multiplies by it, so the channel values run well above
// 1 (the library's own default is Color(20, 20, 20)). Biased toward orange so
// the glare reads as the same low sun that's lighting the island, rather than
// as a neutral white camera artifact.
//
// NOTE this is tuned against evening's `exposure` (environmentPresets.ts).
// The flare is added into the linear image BEFORE tone mapping, so it scales
// with the stop like everything else -- when evening's exposure came down
// from 1.15 to 0.80, the flare dimmed by the same 30% on top of whatever is
// set here. If you change that exposure again, expect to move this with it.
//
// Eased back now that the origin sits ON the sun again and glareSize is much
// wider: a wide glare puts far more total light in frame at the same gain.
// Profile at evening's exposure, in myUV units (half-width = 0.5):
// centre blown (the sun's own core), ~0.6 at d=0.15, ~0.2 haze by d=0.5.
const FLARE_GAIN = new THREE.Color(22, 12, 6)


// Evening sun glare.
//
// Deliberately NOT the <LensFlare> wrapper from @react-three/postprocessing,
// for two reasons:
//
//  1. Cost. Its useFrame runs raycaster.intersectObjects(scene.children, true)
//     EVERY FRAME to decide occlusion -- a full-scene triangle test against
//     merged.glb, which has no BVH (Scene.tsx's <Bvh firstHitOnly> wraps only
//     the clouds and the palm).
//  2. Correctness here. That occlusion test starts from "occluded" and only
//     clears if the first hit is tagged userData.lensflare === "no-occlusion".
//     Nothing in this scene is, and the ray always hits *something* -- the
//     opaque scale-800 sky dome if nothing else -- so the flare would simply
//     never appear.
//
// Driving the underlying LensFlareEffect's uniforms directly costs one
// project() per frame instead, and lets the flare be gated on the time of day
// (which is what we actually want it keyed to) rather than on geometry.
export function SunFlare() {
  const size = useThree((s) => s.size)
  const ndc = useMemo(() => new THREE.Vector3(), [])

  const effect = useMemo(
    () =>
      new LensFlareEffect({
        blendFunction: BlendFunction.NORMAL,
        enabled: true,
        // LensFlare() inside the shader is really two overlapping things, and
        // they want opposite treatment here:
        //
        //  glare()     -- the broad soft round bloom, sized by glareSize.
        //                 f0 = 1 / (dist * (16 / glareSize) + 0.2), so a
        //                 larger value stretches the falloff outward. This is
        //                 the part that should dominate.
        //  drawflare() -- the star, sized by flareSize/flareShape and ending
        //                 in pow(comp * expgrad, 8 + ...). That exponent is
        //                 what makes it a hard pinpoint.
        //
        // Previously flareShape was 0.1 (10x the library's 0.01) and flareSize
        // 0.004 (under half its 0.01), which sharpened and shrank the star --
        // the exact opposite of the soft, wide sun glare wanted here. The star
        // is now bigger and much blunter, and the round glare much wider, so
        // the two read as one broad glow with soft rays rather than a sprite.
        glareSize: 1.8,
        flareSize: 0.015,
        // 0 removes the star spikes entirely, and does so cleanly rather than
        // by accident: in glare() the angular term becomes a constant
        // (sin(0)*0.2 + 0.3), and in drawflare() `blades` collapses to 0 so
        // its pow() reduces to a smooth radial falloff. Both become pure
        // round glows. One side effect worth knowing: LensFlare()'s own `f0`
        // streak resolves to exactly zero too (noise(0) is 0, so the whole
        // term multiplies out), but it peaks at 0.06 -- immaterial next to
        // the glare.
        starPoints: 0,
        flareSpeed: 0.4,
        flareShape: 0.02,
        haloScale: 0.5,
        ghostScale: 0.3,
        secondaryGhosts: true,
        aditionalStreaks: true,
        animated: true,
        anamorphic: false,
        // starBurst wants a lens-dirt texture to sample and is the expensive
        // branch of the shader; the streaks above already carry the effect.
        starBurst: false,
        lensDirtTexture: null,
        colorGain: FLARE_GAIN,
        lensPosition: new THREE.Vector3(),
        screenRes: new THREE.Vector2(size.width, size.height),
        // Starts fully hidden. NOTE the inversion -- see useFrame below.
        opacity: 1,
      }),
    // Constructed once; every parameter that varies is driven as a uniform
    // below. `size` is only read for the initial value, and kept in sync by
    // the effect underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    const res = effect.uniforms.get("screenRes")
    if (res) res.value.set(size.width, size.height)
  }, [effect, size])

  useEffect(() => () => effect.dispose(), [effect])

  useFrame(({ camera }) => {
    const lensPosition = effect.uniforms.get("lensPosition")
    const opacity = effect.uniforms.get("opacity")
    if (!lensPosition || !opacity) return

    ndc.copy(sunState.position).project(camera)

    // The shader's final line is
    //   mix(finalColor, vec3(0), opacity) + inputColor.rgb
    // so this uniform runs BACKWARDS from its name: 0 is fully visible, 1 is
    // fully hidden. Hence 1 - flare.
    //
    // ndc.z > 1 means the sun is behind the camera. Without this check
    // project() still returns an on-screen-looking x/y (mirrored through the
    // origin), and the flare would appear on the opposite side of the frame
    // from where the sun actually is -- most visible during a hotspot fly-to
    // that swings the camera around.
    opacity.value = ndc.z > 1 ? 1 : 1 - sunState.flare
    // Exactly on the sun. An earlier version pushed this outward to hide the
    // glare's hot centre, which is precisely what made the flare appear
    // detached from the sun -- a separate starburst floating mid-frame while
    // the sun bloomed somewhere else.
    lensPosition.value.set(ndc.x, ndc.y)
  })

  return <primitive object={effect} dispose={null} />
}
