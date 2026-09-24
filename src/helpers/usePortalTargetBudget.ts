import * as THREE from 'three'

/** Take the multisampling off drei's offscreen render targets.
 *
 *  MEASURED, on a 1280x800 viewport at devicePixelRatio 1: the scene binds 51
 *  distinct render targets totalling 638MB on the island and 738MB with the
 *  Models portal open. Four of those are 93.8MB each -- 1280x800, 8x
 *  multisampled, HalfFloat, with a depth texture -- and they are the three
 *  portals' scene targets. At dpr 2 every dimension doubles, so those four
 *  alone go from 375MB to about 1.5GB of permanently-resident GPU memory,
 *  whether or not the portals are drawing. That is the scene's single largest
 *  cost, and memory pressure of that order is a plausible source of the
 *  driver-level stalls and black frames.
 *
 *  Why it has to be done at the renderer. drei's <MeshPortalMaterial> builds
 *  its <RenderTexture> internally with no `width`, no `height` and `samples: 8`,
 *  and forwards none of them -- its `resolution` prop feeds only the SDF mask
 *  buffer, allocated inside `if (blur && ...)` and therefore dead while blur is
 *  0, as it is here. There is no supported prop for this short of vendoring all
 *  467 lines of the component, which would mean owning its portal blend, its
 *  event compute and its SDF generator forever.
 *
 *  How this works, and why there is no dispose() in it. three builds a render
 *  target's framebuffer lazily, inside the first setRenderTarget that binds it,
 *  and reads `renderTarget.samples` at that moment. So zeroing samples just
 *  BEFORE delegating is enough: the multisample renderbuffer is never created
 *  in the first place. An earlier version instead caught the target later and
 *  called dispose() to force a rebuild, which threw "Invalid value used as weak
 *  map key" out of three's property cache and only ever caught one of the four.
 *
 *  The discriminator is from the same measurement: a depth TEXTURE (rather than
 *  a depth renderbuffer) is drei useFBO's signature -- the composer's own
 *  multisampled buffers have none, and the water's hand-rolled targets are not
 *  multisampled. So "multisampled and has a depthTexture" is exactly the set we
 *  mean, and nothing else.
 *
 *  Left armed rather than self-removing, because drei reallocates these on
 *  every canvas resize and the 8 samples come back with them. The cost is two
 *  property reads per bind.
 *
 *  The trade: edges INSIDE a portal are no longer multisampled. Through the
 *  aperture they are a few pixels wide and it does not show; entered, the
 *  content fills the screen and may alias a little. If that reads badly this is
 *  one number -- 2 samples still saves three quarters of the memory. */
/** Arm the patch on a renderer.
 *
 *  Called from the Canvas's onCreated, NOT from an effect. An effect runs after
 *  the first commit, and by then a target has already been bound and built at 8
 *  samples -- measured: three of the four were caught from an effect and the
 *  fourth stayed at 93.8MB for the life of the page. onCreated runs when the
 *  renderer is made, before anything can bind. */
export function budgetPortalTargets(gl: THREE.WebGLRenderer, samples = 0) {
  const patched = gl as THREE.WebGLRenderer & { __portalBudget?: boolean }
  if (patched.__portalBudget) return
  patched.__portalBudget = true

  const original = gl.setRenderTarget.bind(gl)
  gl.setRenderTarget = function budgeted(
    target: THREE.WebGLRenderTarget | null,
    ...rest: unknown[]
  ) {
    if (target && target.samples > samples && target.depthTexture) {
      target.samples = samples
    }
    return (original as (t: THREE.WebGLRenderTarget | null, ...a: unknown[]) => void)(
      target,
      ...rest,
    )
  } as typeof gl.setRenderTarget
}
