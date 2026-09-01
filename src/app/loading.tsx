"use client"

import { useProgress } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

// This renders as a persistent overlay alongside page.tsx, not a Suspense
// fallback that unmounts once page.tsx is ready (confirmed: both are
// simultaneously present in the DOM) -- so, like drei's own default
// <Loader/> it replaced, it must hide *itself* once nothing is loading,
// via useProgress().active, rather than relying on ever being unmounted
// from outside. Without this, this overlay -- being opaque and full-screen,
// unlike drei's original -- would permanently block the real scene the
// moment anything (e.g. Bloom mounting for the first time right as the
// loading screen is dismissed) briefly ticks `active` back to true.
const HIDE_DEBOUNCE_MS = 300 // matches drei's own Loader

export default function Loading() {
  const { active } = useProgress();
  const [shown, setShown] = useState(active);

  useEffect(() => {
    if (active === shown) return;
    const timer = setTimeout(() => setShown(active), HIDE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, shown]);

  if (!shown) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ backgroundColor: "#0a0a0a", opacity: active ? 1 : 0, transition: "opacity 300ms ease" }}
    >
      <LoadingIcon />
    </div>
  )
}

function LoadingIcon() {
  const { progress } = useProgress(); // 0 → 100
  const target = progress / 100;

  const [displayProgress, setDisplayProgress] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const animate = () => {
      setDisplayProgress((prev) => {
        const diff = target - prev;

        // 🔥 premium easing
        const next = prev + diff * 0.08;

        if (Math.abs(diff) < 0.001) return target;
        return next;
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  const height = 140 * displayProgress;

  return (
    <svg viewBox="0 0 140 140" width={140} height={140}>
      <defs>
        <linearGradient id="grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ffb37a" />
          <stop offset="100%" stopColor="#d25a1a" />
        </linearGradient>

        <clipPath id="clipCircle">
          <circle cx="70" cy="70" r="70" />
        </clipPath>
      </defs>

      {/* Base */}
      <circle cx="70" cy="70" r="70" fill="black" />

      {/* 🔥 Progress Fill */}
      <g clipPath="url(#clipCircle)">
        <rect
          x="0"
          y={140 - height}
          width="140"
          height={height}
          fill="url(#grad)"
          style={{
            filter: "drop-shadow(0 0 12px rgba(255,179,122,0.35))",
          }}
        />
      </g>

      {/* Icon overlay */}
      <g fill="#f5f2ec">
        <path d="M70 10 L114 35 L70 60 Z" />
        <path d="M117 40 L117 96 L70 67 Z" />
        <path d="M114 102 L70 128 L70 74 Z" />
        <path d="M22 35 L65 10 L64 60 Z" />
        <g transform="translate(45,0) rotate(30)">
          <rect x="8" y="58" width="42" height="6" rx="4" />
          <rect x="21" y="73" width="35" height="6" rx="4" />
          <rect x="27" y="88" width="42" height="6" rx="4" />
        </g>
      </g>
    </svg>
  );
}



