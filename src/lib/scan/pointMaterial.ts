import * as THREE from "three"

import { COLOR_MODE, buildClassPalette, buildHagRamp } from "@/config/asprs"
import { XR_POINT_MAX_PX, XR_POINT_MIN_PX } from "@/config/xrScan"

/** The point cloud's material: one shader, three colour modes, honest colour.
 *
 *  THIS REPLACES `<pointsMaterial>`, which could not express any of what
 *  follows. Three separate pieces of pending work land in this one file, and
 *  it is worth saying what they are because each was written down somewhere as
 *  a thing a shader would eventually have to fix:
 *
 *  1. COLOUR MODE. An annotation nobody can see is not a deliverable. The
 *     classification byte has been parsed and then thrown away since the
 *     decoder was written -- records.ts says it is "what any later
 *     classification view will colour by" -- and height above ground is new
 *     with the pipeline. Both are now attributes, and which one is drawn is a
 *     UNIFORM, so switching costs an assignment rather than a re-upload of
 *     every resident node.
 *
 *  2. THE POINT SIZE FLOOR. `XR_POINT_MIN_PX` and `XR_POINT_MAX_PX` have been
 *     sitting in config/xrScan.ts imported by nothing, with a comment
 *     explaining that sub-pixel points shimmer, that a headset's head never
 *     stops moving, and that the two eyes disagree about which points survive
 *     rasterisation. The flat 1.6px they were meant to replace is under that
 *     floor. Size is computed per node from the octree's own spacing here.
 *
 *  3. THE sRGB DOUBLE-ENCODE, which is a real and visible bug rather than a
 *     refinement. The scan canvas passes no `linear` prop, so r3f sets
 *     `outputColorSpace` to sRGB and three's `colorspace_fragment` chunk --
 *     `gl_FragColor = linearToOutputTexel(gl_FragColor)` -- encodes whatever
 *     the shader produced. three treats a vertex-colour ATTRIBUTE as already
 *     being in working (linear) space, but LAS RGB is display-encoded. So the
 *     file's bytes were divided by 255 and then sRGB-encoded a second time,
 *     which is the standard cause of a washed-out, milky cloud.
 *     `toneMapped={false}` did not prevent it; that only opts out of ACES.
 *     The conversion below is the fix, and the palettes are defined in linear
 *     for the same reason.
 *
 *  WHY A RAW ShaderMaterial AND NOT onBeforeCompile. Patching
 *  `pointsMaterial` would inherit three's fog, map, alphaMap and alphaTest
 *  plumbing -- none of which a point cloud uses -- and would leave the colour
 *  handling fighting `USE_COLOR`. Forty lines of GLSL that say exactly what
 *  happens is less to reason about than a diff against a shader that changes
 *  between three releases.
 */

function lookupTexture(data: Float32Array): THREE.DataTexture {
  // NEAREST ON BOTH, AND FloatType.
  //
  // Nearest for the class palette is required, not a preference: the lookup is
  // by exact integer code, and linear filtering would blend class 2's earth
  // brown into class 3's green for every point and produce colours that name
  // nothing. Nearest for the ramp is a COMPATIBILITY choice -- linear
  // filtering of a 32-bit float texture needs OES_texture_float_linear, which
  // is an extension even on WebGL2, and 256 stops of a ramp band invisibly
  // anyway. Float rather than bytes because these values are LINEAR, and
  // linear in 8 bits bands very visibly in the darks.
  const texture = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat, THREE.FloatType)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/** SHARED UNIFORM OBJECTS, AND THAT IS THE WHOLE TRICK.
 *
 *  Every node gets its own ShaderMaterial, because every node needs its own
 *  point size -- but all of them hold REFERENCES to these same uniform
 *  objects. So `pointUniforms.uColorMode.value = 2` switches the entire
 *  resident set in one assignment, with no traversal and no re-render.
 *
 *  A material per node costs nothing here, which is worth stating because it
 *  looks like it should. three never batches `<points>`: each one is a draw
 *  call whatever material it holds, and materials with identical shader
 *  source and defines share a single compiled PROGRAM through three's cache.
 *  So this is N uniform uploads of a few bytes, not N programs and not N extra
 *  draw calls. (The uniformity rule in ScanMenu is a different situation --
 *  uikit DOES batch, and there the property values are part of the batch's
 *  cache key.) */
export const pointUniforms = {
  uColorMode: { value: COLOR_MODE.rgb as number },
  uClassPalette: { value: lookupTexture(buildClassPalette()) },
  uHagRamp: { value: lookupTexture(buildHagRamp()) },
  /** Top of the height ramp, in FILE UNITS -- because the `hag` attribute is
   *  in file units. Set by PointCloud from the scan's own `unitsToMetres`;
   *  a ramp topping out at 10 feet when it meant 10 metres would be wrong by
   *  a factor of 3.28 and would still look plausible. */
  uHagMax: { value: 1 },
  /** three applies this itself for `pointsMaterial`
   *  (WebGLMaterials.js:307: `uniforms.size.value = material.size * pixelRatio`)
   *  and does NOT for a ShaderMaterial, so it has to be applied here. It is 2
   *  on a retina monitor and 1 in a session, which is the whole reason the old
   *  flat size behaved differently worn than on the desk. */
  uPixelRatio: { value: 1 },
}

const vertexShader = /* glsl */ `
uniform float uSize;
uniform float uPixelRatio;
uniform int uColorMode;
uniform sampler2D uClassPalette;
uniform sampler2D uHagRamp;
uniform float uHagMax;

attribute float classification;
#ifdef HAS_COLOR
  attribute vec3 color;
#endif
#ifdef HAS_HAG
  attribute float hag;
#endif

varying vec3 vColor;

// IEC 61966-2-1, the real transfer function rather than pow(c, 2.2). The two
// differ most in the darks, which on an aerial survey is most of the ground.
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  // NO ATTENUATION, deliberately, and the reasoning is the one that was
  // already at the old material: a point is a sample, not an object with a
  // physical size. Attenuating makes distant ground dissolve while near ground
  // turns to porridge. A fixed pixel size is what makes a cloud read as a
  // surface.
  gl_PointSize = uSize * uPixelRatio;

  if (uColorMode == 1) {
    // +0.5 lands on the TEXEL CENTRE. Without it, nearest filtering at an
    // exact texel boundary is implementation-defined and classes alias into
    // their neighbours on some drivers and not others.
    vColor = texture2D(uClassPalette, vec2((classification + 0.5) / 256.0, 0.5)).rgb;
  } else if (uColorMode == 2) {
    #ifdef HAS_HAG
      vColor = texture2D(uHagRamp, vec2(clamp(hag / uHagMax, 0.0, 1.0), 0.5)).rgb;
    #else
      // A file with no height dimension asked for the height view. Flat grey
      // says "there is nothing here to show" rather than implying zero height
      // everywhere, which the bottom of the ramp would.
      vColor = vec3(0.21);
    #endif
  } else {
    #ifdef HAS_COLOR
      vColor = srgbToLinear(color);
    #else
      vColor = vec3(0.6);
    #endif
  }
}
`

const fragmentShader = /* glsl */ `
varying vec3 vColor;

void main() {
  gl_FragColor = vec4(vColor, 1.0);

  // The ONE chunk this shader includes, and it is the one that makes the
  // colour correct: it expands to
  //   gl_FragColor = linearToOutputTexel( gl_FragColor );
  // so we produce linear and three encodes to whatever the renderer's output
  // colour space is.
  //
  // NOTE WHAT IS ABSENT: no <tonemapping_fragment>. three only injects
  // tonemapping into its own materials, so leaving it out is what
  // toneMapped={false} used to buy -- a point cloud carries its own colour
  // and ACES has no business touching it.
  #include <colorspace_fragment>
}
`

/** Point size in CSS pixels for a node at `depth`, from the octree's own
 *  spacing, clamped to the configured bounds.
 *
 *  WHY SPACING AND NOT A CONSTANT. A COPC octree halves its spacing every
 *  level, so a shallow node's points are far apart and a deep node's are
 *  dense. Drawing both at one size means either the shallow levels are full of
 *  gaps or the deep levels are a solid smear. Scaling with spacing keeps the
 *  apparent coverage roughly constant as the LOD refines, which is what stops
 *  the cloud visibly "breathing" when you walk toward it.
 *
 *  Pure arithmetic, exported, and tested -- the clamp is the part that matters
 *  and the part easiest to get backwards. */
export function pointSizeForDepth(spacing: number, cubeSize: number): number {
  // Spacing as a fraction of the whole octree cube, mapped so that the root
  // node -- spacing ~= cubeSize/128 for a typical file -- lands near the top
  // of the range and deep nodes near the bottom. The 128 is the normaliser,
  // not a tuning knob: it makes this scale-free, so a survey in feet and one
  // in metres get the same sizes.
  const relative = (spacing / cubeSize) * 128
  const px = XR_POINT_MIN_PX + (XR_POINT_MAX_PX - XR_POINT_MIN_PX) * Math.min(1, Math.max(0, relative))
  return Math.min(XR_POINT_MAX_PX, Math.max(XR_POINT_MIN_PX, px))
}

/** One material for one node. `hasColor`/`hasHag` are per-FILE facts, so in
 *  practice every material in a session shares one compiled program. */
export function createPointMaterial(options: {
  sizePx: number
  hasColor: boolean
  hasHag: boolean
}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {}
  // DEFINES, NOT A UNIFORM CHECK, because an attribute that is not present
  // cannot safely be read. three leaves a missing attribute at the generic
  // vertex attribute value, which it does not set -- so the shader would read
  // whatever was last bound there. Compiling the reference out is the only
  // correct answer.
  if (options.hasColor) defines.HAS_COLOR = ""
  if (options.hasHag) defines.HAS_HAG = ""

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    defines,
    uniforms: {
      ...pointUniforms,
      // The ONLY per-node uniform. Everything else above is shared by
      // reference on purpose -- see the note on pointUniforms.
      uSize: { value: options.sizePx },
    },
    // A point cloud is opaque and unlit. Transparency would put it in the
    // sorted pass for no reason and let points cancel each other out.
    transparent: false,
    depthTest: true,
    depthWrite: true,
  })
}
