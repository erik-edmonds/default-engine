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

  return (
    <canvas
      id="bg-canvas"
      className="pointer-events-none fixed inset-0 z-20 h-full w-full invert opacity-60"
      width="1920"
      height="993"
      aria-label="Animated raindrops on glass"
      role="img"
    />
  );
}
