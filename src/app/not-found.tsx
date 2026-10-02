"use client";

import { useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";

import { Broken } from "@/components/models/Broken";

/** Where the wreck sits, and how big. Its own raw bounds are about
 *  20.7 x 9.5 x 20.5, so at this scale it is roughly 15.5 wide and 7.1 tall --
 *  which is what every distance below is sized against. */
const MODEL_SCALE = 0.75;
const MODEL_POSITION: [number, number, number] = [0, 0, -6];

/** How far the key sits from the subject.
 *
 *  Fixed rather than incidental, because the shadow camera's near and far are
 *  derived from it: pinning the depth range to the subject instead of leaving
 *  three's 0.5..500 default is worth roughly an order of magnitude of depth
 *  precision per unit of bias. */
const KEY_DISTANCE = 22;

/** Half-width of the shadow camera's box, in world units.
 *
 *  The model is ~15.5 across at MODEL_SCALE, so 12 covers it with margin
 *  without spending texels on the empty parts of its 28-unit ground plane.
 *  2048 texels over 24 units is 0.0117 units per texel, which is what the
 *  bias values below are chosen against. */
const SHADOW_EXTENT = 12;

/** Unit direction the key comes FROM: high, front-left, and well off the
 *  camera's own axis. A light near the lens is what produces the flat,
 *  shadowless look -- the shadows it casts fall behind the thing casting
 *  them, where the camera cannot see them.
 *
 *  AND DELIBERATELY LOW. At y 0.78 the key sat about 52 degrees up, which is
 *  nearly overhead: every shadow pools under the thing that cast it and the
 *  floor stays empty. This is 39 degrees, which stretches the same shadows
 *  about 1.5x across the ground (tan 52 / tan 39 = 1.58) -- and a shadow
 *  whose shape you can read is the whole of what was asked for. */
const KEY_DIRECTION = new THREE.Vector3(-0.62, 0.58, 0.34).normalize();

/** The key, and the two things about it that have to happen in an effect.
 *
 *  ITS OWN COMPONENT, INSIDE THE CANVAS, and that is the point rather than
 *  tidiness. The ref was previously held by the component that RENDERS the
 *  <Canvas>, and its effect ran with `key.current` still null: the light is
 *  committed by r3f's reconciler, which is not the one driving the outer
 *  tree, so the outer effect fires before the scene children exist. The
 *  aiming below silently did nothing, and the probe caught it -- the light's
 *  target was still sitting at the world origin.
 *
 *  Declared inside the Canvas, the ref is attached and this effect runs after
 *  it, which is the whole fix. */
function KeyLight() {
  const key = useRef<THREE.DirectionalLight>(null);

  useEffect(() => {
    const light = key.current;
    if (!light) return;

    // AIM AT THE WRECK, NOT THE WORLD ORIGIN.
    //
    // A directional light's target defaults to a fresh Object3D at (0,0,0),
    // and the shadow camera is built around that target -- so with the wreck
    // at z -6 spanning z -16.7..4.7, a box centred on the origin leaves a
    // third of it outside the frustum casting nothing.
    //
    // The light's OWN target is moved rather than a separate <object3D> being
    // handed to it: that target is not a child of the scene, so three never
    // walks it during the render traversal and its world matrix would stay at
    // the identity. Hence the explicit update -- once is enough, nothing here
    // moves afterwards.
    light.target.position.set(...MODEL_POSITION);
    light.target.updateMatrixWorld();

    // REQUIRED for the shadow-camera-* props below to mean anything. r3f's
    // applyProps writes light.shadow.camera.left/.near/.far, but it only
    // calls updateProjectionMatrix() for the Canvas's own default camera, not
    // for a nested prop path like shadow-camera-far; and three does not
    // rescue it either, since LightShadow.updateMatrices reads
    // shadowCamera.projectionMatrix as it stands and never rebuilds it.
    // Without this the shadows render through DirectionalLightShadow's
    // constructor default -- a +/-5 box at the world origin. The island rig
    // documents hitting exactly this.
    light.shadow.camera.updateProjectionMatrix();

    // Proof the effect ran at all, for the probe. The two calls above are
    // both silent when they fail, and a shadow that looks wrong gives no clue
    // which of them did not happen.
    light.userData.aimed = true;
  }, []);

  return (
    <directionalLight
      ref={key}
      castShadow
      color="#fff3e0"
      intensity={3.6}
      position={[
        MODEL_POSITION[0] + KEY_DIRECTION.x * KEY_DISTANCE,
        MODEL_POSITION[1] + KEY_DIRECTION.y * KEY_DISTANCE,
        MODEL_POSITION[2] + KEY_DIRECTION.z * KEY_DISTANCE,
      ]}
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-SHADOW_EXTENT}
      shadow-camera-right={SHADOW_EXTENT}
      shadow-camera-top={SHADOW_EXTENT}
      shadow-camera-bottom={-SHADOW_EXTENT}
      // Only this tight because KEY_DISTANCE fixes how far the light sits.
      shadow-camera-near={KEY_DISTANCE - SHADOW_EXTENT - 6}
      shadow-camera-far={KEY_DISTANCE + SHADOW_EXTENT + 6}
      // Sign matters and is easy to get backwards: r185's PCF path does
      // `shadowCoord.z += shadowBias` against a LEQUAL sampler2DShadow, so
      // NEGATIVE is what pushes the comparison clear of self-shadowing.
      shadow-bias={-0.0006}
      // World units, and the main defence against acne. A texel here is
      // 0.0117 units; at the key's 39 degree elevation a ground texel
      // stretches to 0.0117 / sin(39) = 0.0186, so 0.04 still covers it. A
      // grazing key is exactly when this matters: the lower the light, the
      // longer each texel's footprint on the floor and the easier it acnes.
      shadow-normalBias={0.04}
      // Scales a TEXEL-sized disk, so ~0.06 units of blur. Tight on purpose:
      // this is a heap of hard-edged metal, and spreading the darkening wider
      // turns a shadow into a smudge.
      shadow-radius={5}
    />
  );
}

export default function NotFound() {
  return (
    <>
      <Canvas
        // SHADOWS ARE OFF UNLESS THE CANVAS ASKS FOR THEM. This was the whole
        // of "it has no shadows": every mesh in Broken.tsx already declares
        // castShadow and receiveShadow, and the model even brings its own
        // ground plane to catch them, but with no `shadows` prop the renderer
        // never allocates a shadow map and all of that is inert.
        //
        // "percentage" is PCF soft, and is what the island canvas uses.
        shadows="percentage"
        // The camera is declared HERE rather than as a <PerspectiveCamera> in
        // the scene. A drei camera without `makeDefault` is just an object in
        // the graph -- it is not the camera anything renders through -- so the
        // previous one, and the lookAt pointed at it, had no effect on the
        // picture at all; what you were seeing was r3f's default camera at
        // [0, 0, 5].
        camera={{ position: [0, 5.4, 10], fov: 45, near: 0.5, far: 200 }}
        gl={{
          // The same curve the island renders through (it applies AgX as a
          // postprocessing pass). These materials come out of Maya as blinn and
          // lambert, which convert to standard materials with real specular --
          // on the default linear clamp their highlights blow straight out to
          // white, which is half of "poorly lit".
          toneMapping: THREE.AgXToneMapping,
          toneMappingExposure: 1.15,
        }}
        style={{ width: "100%", height: "100dvh" }}
      >
        <color attach="background" args={["#456363"]} />

        {/* FILL, NOT THE LIGHT ITSELF.

          This was an ambientLight at intensity 5, and that is the other half
          of "poorly lit": ambient light arrives equally from every direction,
          so it cannot model form. Turned up far enough to expose the scene it
          washes every surface to the same value and the wreck reads as a flat
          silhouette. Kept low here and left to do what fill is for -- keeping
          the shadow side readable rather than black.
          
          THE RATIO IS WHAT DECIDES WHETHER A SHADOW READS. Measured by
          toggling the shadow map and differencing the frames: shadows were
          being drawn the whole time (9.2% of pixels changed) and simply did
          not show, because a surface in shadow still collected 0.35 ambient
          plus 0.9 hemisphere plus 1.1 rim -- about 2.35 against the key's
          2.6. Losing the key halved the light and no more. These numbers now
          leave roughly 1.0 in shadow against 4.6 in light. */}
        <ambientLight intensity={0.12} />

        {/* Sky above, ground bounce below. Cheap directional variation across
          every surface, and the reason this rig needs no environment map:
          drei's <Environment preset> fetches an HDRI from a CDN at runtime,
          which is a poor thing to put on the page someone lands on when
          something has already gone wrong. */}
        <hemisphereLight args={["#bcd9dd", "#3a4a44", 0.4]} />

        {/* KEY, and the only light that casts. */}
        <KeyLight />

        {/* RIM, from behind and the opposite side, to lift the wreck's edge off
          a background it is very close to in value. No shadow: a second
          shadow-casting light doubles the shadow cost and gives a machine
          this cluttered two overlapping sets of shadows to read. */}
        <directionalLight
          color="#9fd0ff"
          intensity={0.5}
          position={[
            MODEL_POSITION[0] + 10,
            MODEL_POSITION[1] + 6,
            MODEL_POSITION[2] - 12,
          ]}
        />

        <Broken scale={MODEL_SCALE} position={MODEL_POSITION} />
      </Canvas>

      {/* BOTTOM-LEFT, not top-left: the root layout pins the home logo at
          top-left on every route (see app/layout.tsx), and this would sit
          under it.
          
          Outside the <Canvas>, as DOM. It could be drawn in the scene, but
          type on a canvas cannot be selected, read by a screen reader, or
          scaled by the browser -- and this is the one sentence on the page
          that has to be read.
          
          Safe-area insets folded in the same way the rest of the site's
          chrome does it; they resolve to 0px on hardware without a notch. */}
      <p
        className="pointer-events-none fixed z-10 font-nunito font-semibold text-white"
        style={{
          left: "calc(1.5rem + var(--safe-left, 0px))",
          bottom: "calc(1.5rem + var(--safe-bottom, 0px))",
          fontSize: "clamp(1.05rem, 3.4vw, 1.6rem)",
          letterSpacing: "0.01em",
          // The background is a single mid teal and the wreck sits right in
          // it, so the type brings its own separation rather than relying on
          // whatever happens to be behind it.
          textShadow: "0 2px 14px rgba(12, 28, 30, 0.55)",
        }}
      >
        Uh oh, we&rsquo;ve hit a snag.
      </p>
    </>
  );
}
