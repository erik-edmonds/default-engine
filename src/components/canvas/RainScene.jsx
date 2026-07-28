"use client";

import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { raining } from "@/helpers/StateProvider";

export default function RainScene() {
  const isRaining = useAtomValue(raining);

  useEffect(() => {
    if (document.querySelector("script[data-original-raindrop]")) return;

    const script = document.createElement("script");
    script.src = "/api/original-raindrop?v=transparent-raindrops";
    script.async = false;
    script.dataset.originalRaindrop = "true";
    document.body.appendChild(script);
    // No cleanup: this now mounts once for the page's whole lifetime (see
    // page.tsx), and raindrop.js's rAF loops have no dispose method to call
    // even if we wanted to tear it down. The guard above still matters --
    // React Strict Mode double-invokes effects on first mount in dev, and
    // without it that alone would load the 693KB bundle twice.
  }, []);

  useEffect(() => {
    if (!isRaining) return;
    // raindrop.js only draws its foreground (what each droplet refracts)
    // once, at load, from a static photo baked into the bundle -- droplets
    // show real detail, but always the same frozen, unrelated scene, never
    // what's actually behind them. It does expose an updateTextures() method
    // for refreshing that content, it's just never called from its own
    // per-frame render loop. Patched raindrop.js additionally stashes the
    // renderer instance and its small foreground canvas on window, so here
    // we redraw the live Three.js canvas onto that foreground canvas and
    // re-upload it on an interval -- droplets end up refracting an
    // actually-current, actually-matching glimpse of the real scene instead
    // of a fixed photo. A plain interval (rather than rAF) keeps the
    // GPU-to-CPU readback this requires from competing with every single
    // render frame; a few times a second reads as live for a mostly-static
    // island scene.
    const interval = setInterval(() => {
      const sceneCanvas = document.querySelector("#three-scene-canvas canvas");
      const fgCtx = window.__rainFgCtx;
      const renderer = window.__rainRenderer;
      if (!sceneCanvas || !fgCtx || !renderer) return;
      fgCtx.drawImage(sceneCanvas, 0, 0, fgCtx.canvas.width, fgCtx.canvas.height);
      renderer.updateTextures();
    }, 120);

    return () => clearInterval(interval);
  }, [isRaining]);

  return (
    <canvas
      id="bg-canvas"
      className={`pointer-events-none fixed inset-0 z-20 h-full w-full ${isRaining ? "visible" : "invisible"}`}
      width="1920"
      height="993"
      aria-label="Animated raindrops on glass"
      role="img"
    />
  );
}
