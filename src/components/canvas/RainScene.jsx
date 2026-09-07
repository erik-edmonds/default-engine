"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { raining } from "@/helpers/StateProvider";

export default function RainScene() {
  const isRaining = useAtomValue(raining);

  // Two patches live in public/scripts/raindrop.js, both commented there:
  //  - premultipliedAlpha:false on its WebGL context. Its shader's blend()
  //    divides the colour back out by alpha, so it emits STRAIGHT alpha, but
  //    the context defaulted to premultiplied -- the compositor then drew each
  //    droplet's soft antialiased edge at full strength rather than scaled by
  //    its alpha. That was the hard white outline round every drop, brightest
  //    exactly where the drop was most transparent.
  //  - the renderer instance and its foreground canvas stashed on window, for
  //    the live-scene refresh below.
  useEffect(() => {
    if (document.querySelector("script[data-original-raindrop]")) return;

    const script = document.createElement("script");
    // Served straight out of public/ -- it used to come from an API route
    // that read the file from disk per request and sent Cache-Control:
    // no-store, so 694KB crossed the wire uncached, through a Node function,
    // on every single visit. As a static asset it is edge-cached and
    // compressed like everything else.
    script.src = "/scripts/raindrop.js?v=transparent-raindrops";
    script.async = false;
    script.dataset.originalRaindrop = "true";
    document.body.appendChild(script);
    // No cleanup: this now mounts once for the page's whole lifetime (see
    // page.tsx), and raindrop.js's rAF loops have no dispose method to call
    // even if we wanted to tear it down. The guard above still matters --
    // React Strict Mode double-invokes effects on first mount in dev, and
    // without it that alone would load the 693KB bundle twice.
  }, []);

  // The live-scene refresh that used to run here on a setInterval now lives in
  // canvas/RainRefraction.tsx, inside the frame loop. Reading the drawing
  // buffer from a timer is what forced preserveDrawingBuffer on the main
  // Canvas for every frame of every session; doing it right after the
  // composer's render needs no such flag. Same effect, same 120ms cadence.

  return (
    <canvas
      id="bg-canvas"
      className={`pointer-events-none fixed inset-0 z-20 h-full w-full transition-opacity duration-[2500ms] ${isRaining ? "opacity-100" : "opacity-0"}`}
      width="1920"
      height="993"
      aria-label="Animated raindrops on glass"
      role="img"
    />
  );
}
