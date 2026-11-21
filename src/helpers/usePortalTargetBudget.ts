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
 *  The discriminator is a depth TEXTURE (rather than a depth renderbuffer),
 *  which is drei useFBO's signature, AND a name test. The name test is not
 *  belt-and-braces -- without it this patch silently disabled antialiasing for
 *  the entire scene.
 *
 *  WHAT THIS COMMENT USED TO CLAIM, AND WHY IT WAS WRONG. It said "the
 *  composer's own multisampled buffers have none [no depthTexture], so
 *  'multisampled and has a depthTexture' is exactly the set we mean, and
 *  nothing else." That is false for postprocessing@6.39.2, and the chain is
 *  three links, each verified in node_modules:
 *
 *    1. n8ao/dist/N8AO.js            `needsDepthTexture = true`
 *    2. postprocessing/build/index.js `inputBuffer.depthTexture = this.depthTexture`
 *                                     -- assigned EVERY FRAME, before every pass
 *    3. @react-three/postprocessing   the composer is built `multisampling: 8`
 *
 *  So N8AO forces a depth texture into existence, the composer hangs it on its
 *  OWN input buffer, RenderPass binds that buffer to draw the island, and the
 *  old predicate matched it. samples went to 0 before three ever allocated the
 *  multisample renderbuffer, and the island rendered with no antialiasing of
 *  any kind -- no MSAA, and no SMAA/FXAA pass in the chain to stand in for it.
 *  The `antialias: true` on the default framebuffer is irrelevant, because the
 *  scene is never drawn there.
 *
 *  THE NAME IS THE LIBRARY'S OWN MARKER, not something inferred. postprocessing
 *  sets `renderTarget.texture.name = "EffectComposer.Buffer"` in createBuffer,
 *  and three's Texture.copy copies `name`, so the clone that becomes
 *  outputBuffer carries it too. It is assigned at CONSTRUCTION, which is what
 *  makes it usable here: capturing the composer's buffer identities instead
 *  would need the composer to exist first, and by then a bind has already
 *  happened and `samples` is already 0 -- and 0 is sticky, because three reads
 *  it once when it builds the framebuffer.
 *
 *  drei's portal targets have no name at all, so they still match and are still
 *  stripped. The memory saving below is unchanged.
 *
 *  ONE EXCEPTION, AND IT IS NOT HYPOTHETICAL. three's XR manager builds the
 *  headset's own framebuffer with `depthTexture: new DepthTexture(...)` and
 *  `samples: attributes.antialias ? 4 : 0` (three.module.js, XRManager's
 *  projection-layer branch) -- which is this predicate's signature exactly.
 *  Left unguarded, the first bind of a session would strip antialiasing from
 *  the one buffer where it matters most and keep stripping it on every resize
 *  for the whole session; a headset renders a low-dpi texture through a lens
 *  that magnifies every stair-step. It saves nothing, either: that target is
 *  allocated by the compositor whether or not we touch it, so there is no
 *  memory to win. `isXRRenderTarget` is set by three's XR manager and by
 *  nothing else in the library or in this app, so testing it costs desktop
 *  rendering nothing -- the flag is undefined on every target the island
 *  binds.
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
/** postprocessing's own label for the buffers EffectComposer renders the scene
 *  into -- `createBuffer` sets it, and it survives the clone that makes
 *  outputBuffer. Matching on it is how this patch tells the composer's buffers
 *  apart from drei's portal FBOs, which carry no name. */
const COMPOSER_BUFFER = "EffectComposer.Buffer"

export function budgetPortalTargets(gl: THREE.WebGLRenderer, samples = 0) {
  const patched = gl as THREE.WebGLRenderer & { __portalBudget?: boolean }
  if (patched.__portalBudget) return
  patched.__portalBudget = true

  const original = gl.setRenderTarget.bind(gl)
  gl.setRenderTarget = function budgeted(
    target: THREE.WebGLRenderTarget | null,
    ...rest: unknown[]
  ) {
    if (
      target &&
      target.samples > samples &&
      target.depthTexture &&
      // The composer's own input/output buffers. See the header: without this
      // the whole scene loses MSAA, because N8AO gives those buffers a
      // depthTexture and they would otherwise match on every bind.
      target.texture?.name !== COMPOSER_BUFFER &&
      !(target as THREE.WebGLRenderTarget & { isXRRenderTarget?: boolean }).isXRRenderTarget
    ) {
      target.samples = samples
    }
    return (original as (t: THREE.WebGLRenderTarget | null, ...a: unknown[]) => void)(
      target,
      ...rest,
    )
  } as typeof gl.setRenderTarget
}
