import * as THREE from "three"

import { OPTICS_WAVE_COLOR } from "@/config/optics"

/** THE SURVEY WAVE, injected into materials that already exist.
 *
 *  WHY onBeforeCompile HERE, WHEN lib/scan/pointMaterial.ts ARGUES AGAINST IT.
 *  That file's argument is sound for the case it is about: a point cloud needs
 *  none of PointsMaterial's fog, map and alphaTest plumbing and fights
 *  USE_COLOR, so forty lines of honest GLSL beat a diff against a shader that
 *  moves between releases. Here the relationship is inverted. The island's
 *  thirty-one GLB materials are the thing being ADDED TO -- their PBR
 *  response, their roughness maps, their painted vertex colours, the scene's
 *  fog and the four-light rig are all load-bearing and have to survive.
 *  Replacing them would mean reimplementing all of it. An additive term is a
 *  strictly smaller surface than a replacement, and both anchors below are
 *  unconditional lines of meshphysical.glsl.js rather than guarded ones.
 *
 *  SHARED UNIFORM OBJECTS, exactly as pointMaterial.ts does it: every patched
 *  material holds a reference to these same objects, so moving the wave is one
 *  assignment with no traversal and no React render. */
/** Full strength of the hue wash, used when the world is at normal brightness.
 *
 *  The wash preserves luminance, so this is purely a hue shift -- but at night
 *  the terrain is nearly monochrome, and 0.6 against that read as the island
 *  switching on rather than being passed over. 0.42 tints without repainting. */
export const TRAIL_MIX_BASE = 0.42

/** Full strength of the additive trail, used when the world is fully dimmed.
 *
 *  Well under uScanEdgeGain's 3.4 on purpose: the trail is the ground the
 *  front has already crossed, and it should read as lit rather than as a
 *  second edge. At 0.5 against #1fb2f5's linear luminance of 0.387 the trail
 *  sits at 0.19 -- a fifth of Bloom's 0.9 threshold, so it glows without
 *  haloing. */
export const TRAIL_ADD_BASE = 0.5

export const scanUniforms = {
  /** The beacon, in WORLD space. Tracked every frame -- by the time the sweep
   *  fires the beacon is anchored near the camera, so 3D distance is close to
   *  depth and the shell reads as a wall moving away from the viewer. */
  uScanOrigin: { value: new THREE.Vector3() },
  /** Radius of the expanding shell, world units. */
  uScanRadius: { value: 0 },
  /** Master gate. 0 is "no scan", and it is the value every material is first
   *  COMPILED with -- see the note on compile timing in OpticsPulse.tsx. */
  uScanAmp: { value: 0 },
  /** Linear, because THREE.Color converts from the hex on construction. */
  uScanColor: { value: new THREE.Color(OPTICS_WAVE_COLOR) },
  /** Half-width of the bright leading band, world units. */
  uScanEdgeWidth: { value: 1.1 },
  /** e-folding distance of the trail behind the front, world units.
   *
   *  8 rather than the 12 this started at. The main island is only about 17
   *  units across, so a 12-unit trail had the whole of it washed at once and
   *  the front stopped being the thing you looked at. At 8 the wash stays a
   *  band following the edge, which is what the reference image shows. */
  uScanTrailLen: { value: 8 },
  /** Linear gain on the leading edge. Not a taste value: #1fb2f5 has a linear
   *  luminance of 0.387, Bloom's threshold is 0.9 with 0.3 of smoothing, so
   *  the knee is at 2.32 and saturation at 3.10. 3.4 clears both with enough
   *  headroom that the terrain underneath cannot drag it back under.
   *
   *  Deliberately not higher. AgX folds about 14% of each channel into the
   *  others before its sigmoid, so past saturation the extra energy is spent
   *  turning a saturated blue white. The luminous quality is meant to come
   *  from Bloom's halo, not from a hotter core. */
  uScanEdgeGain: { value: 3.4 },
  /** How far the trail pulls terrain hue toward the scan colour, 0..1.
   *  Driven every frame by OpticsPulse, which scales TRAIL_MIX_BASE down as
   *  the world darkens and hands over to uScanTrailAdd. */
  uScanTrailMix: { value: TRAIL_MIX_BASE },
  /** The trail's ADDITIVE strength, ramped up as the world is dimmed.
   *
   *  The wash above is luminance-preserving by construction -- it reprojects
   *  the terrain's own luminance onto the scan hue -- which is exactly what
   *  stops it blowing Bloom on the hottest key-facing sand at noon. The same
   *  property makes it vanish the moment the world goes dark: luminance of
   *  nothing is nothing.
   *
   *  So a second term takes over. OpticsPulse ramps this in step with
   *  opticsRun.dim, so the trail is a hue shift on a lit world and a glow on a
   *  dark one, and never both at full strength. The headroom is real: with the
   *  light rig down to 0.16 the terrain is far below the 0.9 threshold, so
   *  this can add without pulling sand into the bloom pass. */
  uScanTrailAdd: { value: 0 },
}

const FRAG_PARS = /* glsl */ `
uniform vec3  uScanOrigin;
uniform float uScanRadius;
uniform float uScanAmp;
uniform vec3  uScanColor;
uniform float uScanEdgeWidth;
uniform float uScanTrailLen;
uniform float uScanEdgeGain;
uniform float uScanTrailMix;
uniform float uScanTrailAdd;
varying vec3  vScanWorld;
`

// `luminance()` is NOT declared here and must not be: three injects it into
// every fragment prefix unconditionally, built from ColorManagement's own
// coefficients. Declaring it again is a redefinition error.
const FRAG_BODY = /* glsl */ `
	if ( uScanAmp > 0.0 ) {
		float sd = distance( vScanWorld, uScanOrigin );
		float sb = uScanRadius - sd;            // > 0 once the front has passed
		float passed = step( 0.0, sb );

		// The leading band. Gaussian, and deliberately NOT gated by "passed":
		// a little bleed ahead of the front is what makes it read as light
		// rather than as a clipping plane.
		float edge = exp( - ( sb * sb ) / ( uScanEdgeWidth * uScanEdgeWidth ) );

		// The trail, gated: nothing behind the front means nothing ahead of it.
		float trail = exp( - max( sb, 0.0 ) / uScanTrailLen ) * passed;

		// A LUMINANCE-PRESERVING WASH, not an additive tint, and this is the
		// whole reason the trail can exist at all. IslandExperience records
		// that Bloom's 0.9 threshold was chosen to catch "the hottest
		// key-facing sand", so at noon the terrain is ALREADY at the
		// threshold and an additive trail has no headroom -- it would drag a
		// growing patch of sand and water into the bloom pass and leave a
		// white blob following the wave.
		//
		// Reprojecting the terrain's own luminance onto the scan hue leaves
		// luminance unchanged by construction, so the trail provably cannot
		// cross the threshold at any mix and uScanTrailMix never has to be
		// retuned against the time of day. It is also closer to the intent:
		// the ground behind the front should be TINTED, not brightened.
		float lum = luminance( outgoingLight );
		vec3 washed = uScanColor * ( lum / max( luminance( uScanColor ), 1e-4 ) );
		outgoingLight = mix( outgoingLight, washed,
			clamp( trail * uScanTrailMix * uScanAmp, 0.0, 1.0 ) );

		// The scanned ground, glowing rather than merely tinted. Zero while
		// the world is lit -- see uScanTrailAdd -- so this costs nothing
		// outside the dimmed window and cannot disturb the noon case the wash
		// above was built for.
		outgoingLight += uScanColor * ( trail * uScanTrailAdd * uScanAmp );

		// The edge, which adds energy in every case.
		outgoingLight += uScanColor * ( edge * uScanEdgeGain * uScanAmp );
	}
`

const VERT_PARS = /* glsl */ `
varying vec3 vScanWorld;
`

// A TRANSCRIPTION of three's own worldpos_vertex, with its #if removed.
//
// worldpos_vertex computes `worldPosition` only under
//   USE_ENVMAP || DISTANCE || USE_SHADOWMAP || USE_TRANSMISSION ||
//   NUM_SPOT_LIGHT_COORDS > 0
// This scene satisfies that today by USE_SHADOWMAP alone -- there is no
// scene.environment (Environment.tsx is a hand-rolled light rig, not drei's
// HDRI loader), no transmission and no spot light. Turning the shadow map off
// would therefore delete this varying's source and the whole island would fail
// to compile. So it is computed here instead, unconditionally, from
// `transformed` (declared by begin_vertex) and `batchingMatrix` (declared by
// batching_vertex) -- both in scope at project_vertex.
const VERT_BODY = /* glsl */ `
	vec4 scanWorld4 = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		scanWorld4 = batchingMatrix * scanWorld4;
	#endif
	#ifdef USE_INSTANCING
		scanWorld4 = instanceMatrix * scanWorld4;
	#endif
	vScanWorld = ( modelMatrix * scanWorld4 ).xyz;
`

/** ONE function object, shared by every patched material, and that matters --
 *  see the cache-key note below. */
function scanOnBeforeCompile(shader: {
  vertexShader: string
  fragmentShader: string
  uniforms: Record<string, unknown>
}) {
  Object.assign(shader.uniforms, scanUniforms)

  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
    // AFTER project_vertex, not after begin_vertex: drei's
    // MeshDistortMaterial deletes the begin_vertex token outright, so
    // anchoring there would silently no-op on any material it owns.
    .replace("#include <project_vertex>", `#include <project_vertex>\n${VERT_BODY}`)

  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
    // BEFORE opaque_fragment, whose whole body is
    //   gl_FragColor = vec4( outgoingLight, diffuseColor.a );
    // Anchoring on tonemapping_fragment instead -- the obvious choice -- is
    // one line too late: outgoingLight has already been consumed and the
    // shader would not compile. Being upstream of opaque_fragment also puts
    // the wave upstream of fog_fragment, so it recedes into the scene's linear
    // fog along with the terrain it is washing.
    .replace("#include <opaque_fragment>", `${FRAG_BODY}\n\t#include <opaque_fragment>`)
}

/** A CONSTANT key, which is correct only because the GLSL above is constant.
 *
 *  three's default is `this.onBeforeCompile.toString()`, and since every
 *  material here is assigned the SAME function object that default would
 *  already be correct. It is pinned anyway because of the failure it guards
 *  against: a closure's toString() does not include its captured values, so
 *  the moment anyone writes `onBeforeCompile = (s) => { if (skip) return; ... }`
 *  both branches key identically and three hands one material the other's
 *  compiled program, non-deterministically. Naming the key forces a second
 *  variant to be named too. */
function scanProgramCacheKey() {
  return "optics-v1"
}

/** Patch every standard material under `root`.
 *
 *  TRAVERSES THE LIVE SCENE GRAPH rather than useGLTF's `materials` record,
 *  because Material.copy() does not carry onBeforeCompile and MergedScene.tsx
 *  clones four of them at runtime -- sandMaterial, rockMaterial,
 *  dockDeckMaterial and dockPostMaterial. Patching the record would miss the
 *  island, the rocks, the dock deck and fifty-odd dock posts: the majority of
 *  what the wave is supposed to cross.
 *
 *  Returns how many distinct materials were patched, for the probe. */
export function patchScanMaterials(root: THREE.Object3D): number {
  const seen = new Set<THREE.Material>()
  let patched = 0
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of list) {
      if (!m || seen.has(m)) continue
      seen.add(m)
      const std = m as THREE.MeshStandardMaterial
      if (std.isMeshStandardMaterial !== true) continue
      // Something already owns this material's compile. drei overrides
      // onBeforeCompile on the PROTOTYPE for MeshDistortMaterial and friends,
      // so hasOwnProperty would not catch it -- compare against the base
      // implementation instead.
      if (std.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) continue
      std.onBeforeCompile = scanOnBeforeCompile
      std.customProgramCacheKey = scanProgramCacheKey
      std.needsUpdate = true
      patched += 1
    }
  })
  return patched
}
