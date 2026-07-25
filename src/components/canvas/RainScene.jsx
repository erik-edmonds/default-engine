"use client";

import { useEffect } from "react";

export default function RainScene() {
  useEffect(() => {
    if (document.querySelector("script[data-original-raindrop]")) return;

    const script = document.createElement("script");
    script.src = "/api/original-raindrop?v=transparent-raindrops";
    script.async = false;
    script.dataset.originalRaindrop = "true";
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
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
  }, []);

  return (
    <canvas
      id="bg-canvas"
      className="pointer-events-none fixed inset-0 z-20 h-full w-full"
      width="1920"
      height="993"
      aria-label="Animated raindrops on glass"
      role="img"
    />
  );
}
