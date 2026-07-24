"use client";

import { useEffect } from "react";

export default function RainScene() {
  useEffect(() => {
    if (document.querySelector("script[data-original-raindrop]")) return;

    const script = document.createElement("script");
    script.src = "/api/original-raindrop";
    script.async = false;
    script.dataset.originalRaindrop = "true";
    document.body.appendChild(script);
  }, []);

  return (
    <canvas
      id="bg-canvas"
      className="canvas-background-overlay"
      width="1920"
      height="993"
      aria-label="Animated raindrops on glass"
      role="img"
    />
  );
}
