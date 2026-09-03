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
// Balanced against BOTH the wider glareSize below and FLARE_ORIGIN_PUSH: with
// the origin pushed off-frame we only ever see the falloff's tail, never its
// peak, so this runs hotter than it could if the centre were visible.
const FLARE_GAIN = new THREE.Color(32, 17, 9)

// How far past the sun to place the flare's origin, as a multiple of its
// screen position from centre.
//
// The glare term is f0 = 1 / (dist * (16 / glareSize) + 0.2), which peaks at
// 1/0.2 = 5.0 at the lens position REGARDLESS of glareSize -- there is always
// a hot singularity exactly at the origin, and no amount of widening removes
// it, only spreads the falloff around it. On screen that singularity reads as
// a hard white star sprite pasted over the sun rather than light coming off
// it.
//
// So the origin gets pushed just outside the frame while the sun disc itself
// stays where it is. We then only ever see the smooth part of the falloff
// spilling in from the edge -- a broad directional glow with no visible point
// -- and the sun remains a sun. 1.35 puts evening's sun (NDC x ~ -0.86) at
// ~-1.16: clear of the edge at every aspect ratio we render at, while staying
// on the same line out from screen centre, so the glare still reads as coming
// from the sun's direction and the ghost chain still lines up through frame.
const FLARE_ORIGIN_PUSH = 1.35

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
        // Deliberately large. The glare's falloff is
        //   f0 = 1 / (dist * (16 / glareSize) + 0.2)
        // which peaks at 1/0.2 = 5.0 at the lens position NO MATTER what this
        // is set to -- glareSize only controls how fast it decays from there.
        // So a small value doesn't give a small glare, it gives the same hot
        // centre with a steep falloff, i.e. a pinprick: all the light crammed
        // into a few pixels, which reads as an artificial star sprite pasted
        // over the sun rather than light blooming out of it.
        //
        // Widening spreads that same energy over a much larger area and drops
        // the visible peak, so the origin dissolves into a broad soft glow.
        // Total added light scales roughly linearly with this, so colorGain
        // came down by about the same factor to keep the frame from hazing
        // again (see FLARE_GAIN) -- the goal was to redistribute the glare,
        // not add more of it.
        glareSize: 0.85,
        flareSize: 0.004,
        starPoints: 6,
        flareSpeed: 0.4,
        flareShape: 0.1,
        // Nudged up alongside the wider glare: a visible halo ring is what
        // sells the whole thing as an optical artifact of the lens rather
        // than a bright sprite, which further breaks up the single-point read.
        haloScale: 0.6,
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
    // Pushed outward from screen centre so the glare's hot centre sits off
    // frame -- see FLARE_ORIGIN_PUSH.
    lensPosition.value.set(ndc.x * FLARE_ORIGIN_PUSH, ndc.y * FLARE_ORIGIN_PUSH)
  })

  return <primitive object={effect} dispose={null} />
}
