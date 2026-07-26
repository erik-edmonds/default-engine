"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Phase, GLYPH_COLOR, DialProps, LABEL } from "@/helpers/Interfaces";

export const PHASES: Phase[] = ["night", "dawn", "day", "evening"];

function Glyph({ phase, size }: { phase: Phase; size: number }) {
  const c = GLYPH_COLOR[phase];
  const common = { width: size, height: size, viewBox: "0 0 24 24" } as const;

  if (phase === "night") {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill={c} />
        <circle cx="15.5" cy="9.5" r="1.6" fill="#85B7EB" opacity="0.6" />
        <circle cx="9.5" cy="14" r="1.1" fill="#85B7EB" opacity="0.5" />
      </svg>
    );
  }

  if (phase === "dawn") {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="8" fill="#B5D4F4" />
        <path d="M12 4a8 8 0 0 1 0 16z" fill={c} />
      </svg>
    );
  }

  if (phase === "day") {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="6.5" fill={c} />
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <line
              key={i}
              x1={12 + Math.cos(a) * 9.5}
              y1={12 + Math.sin(a) * 9.5}
              x2={12 + Math.cos(a) * 11.5}
              y2={12 + Math.sin(a) * 11.5}
              stroke={c}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden="true">
      <circle cx="12" cy="13" r="6" fill={c} />
      {Array.from({ length: 5 }, (_, i) => {
        const a = Math.PI + (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={12 + Math.cos(a) * 8.5}
            y1={13 + Math.sin(a) * 8.5}
            x2={12 + Math.cos(a) * 10.5}
            y2={13 + Math.sin(a) * 10.5}
            stroke={c}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        );
      })}
      <line x1="3" y1="20" x2="21" y2="20" stroke={c} strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
    </svg>
  );
}

export default function Dial({
  phase,
  defaultPhase = "night",
  onPhaseChange,
  durationMs = 1200,
  easing = "cubic-bezier(0.4, 0, 0.2, 1)",
  size = 50,
  surface = "rgba(255,255,255,0.08)",
}: DialProps) {
  const controlled = phase !== undefined;

  const [steps, setSteps] = useState(() => PHASES.indexOf(controlled ? phase! : defaultPhase));
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!controlled) return;
    const target = PHASES.indexOf(phase!);
    setSteps((s) => s + ((target - (s % 4) + 4) % 4));
  }, [controlled, phase]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const index = ((steps % 4) + 4) % 4;
  const current = PHASES[index];
  const next = PHASES[(index + 1) % 4];

  const ms = reduced ? 0 : durationMs;

  const advance = useCallback(() => {
    if (busy) return; // don't let clicks outrun the scene
    setBusy(true);
    setSteps((s) => s + 1);
    onPhaseChange?.(PHASES[(((steps + 1) % 4) + 4) % 4]);
    timer.current = setTimeout(() => setBusy(false), ms);
  }, [busy, ms, onPhaseChange, steps]);

  const R = size * 0.75;
  const rotation = -steps * 90;
  const transition = `transform ${ms}ms ${easing}`;

  const positions = useMemo(
    () =>
      PHASES.map((_, i) => {
        const a = ((-90 + i * 90) * Math.PI) / 180;
        return { left: R + Math.cos(a) * R, top: R + Math.sin(a) * R };
      }),
    [R]
  );

  return (
    <button
      type="button"
      onClick={advance}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={`Time of day: ${LABEL[current]}. Change to ${LABEL[next]}.`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: surface,
        border: "1px solid rgba(255,255,255,0.25)",
        position: "relative",
        overflow: "hidden",
        cursor: busy ? "default" : "pointer",
        padding: 0,
        outline: "none",
        outlineOffset: 2,
        backdropFilter: "blur(6px)",
        transition: `background ${ms}ms ${easing}`,
      }}
    >
      <span
        style={{
          position: "absolute",
          width: R * 2,
          height: R * 2,
          left: size / 2 - R,
          top: size / 2,
          transform: `rotate(${rotation}deg)`,
          transition,
          display: "block",
        }}
      >
        {PHASES.map((p, i) => (
          <span
            key={p}
            style={{
              position: "absolute",
              left: positions[i].left,
              top: positions[i].top,
              width: 26,
              height: 26,
              margin: "-13px 0 0 -13px",
              // cancel the wheel's spin so the moon doesn't tumble
              transform: `rotate(${-rotation}deg)`,
              transition,
              display: "block",
            }}
          >
            <Glyph phase={p} size={26} />
          </span>
        ))}
      </span>
    </button>
  );
}

