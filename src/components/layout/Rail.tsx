"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { 
  SceneRailProps, Phase, 
  SHAPES, INK, INK_DIM, Pt,
  DURATION_MS, EASE_CSS
 } from "@/helpers/Interfaces";






const toAttr = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
function makeEase(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= (((ax * t + bx) * t + cx) * t - x) / d;
    }
    t = Math.max(0, Math.min(1, t));
    return ((ay * t + by) * t + cy) * t;
  };
}
const ease = makeEase(0.4, 0, 0.2, 1);

/* ------------------------------------------------------------------ */

export default function Rail({
  sections,
  active,
  onSelect,
  phase,
  strokeWidth = 1.5,
  durationMs = DURATION_MS,
  zIndex = 9999,
}: SceneRailProps) {
  // fall back rather than crash on a bad prop
  const safePhase: Phase = SHAPES[phase] ? phase : "night";
  const ink = INK[safePhase];
  const dim = INK_DIM[safePhase];

  const [hover, setHover] = useState<number | null>(null);

  const polys = useRef<(SVGPolygonElement | null)[]>([]);
  const live = useRef<Pt[]>(SHAPES[safePhase]);
  const liveAttr = useRef<string>(toAttr(SHAPES[safePhase]));
  const raf = useRef<number | null>(null);
  const mounted = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => toAttr(SHAPES[safePhase]), []);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    const target = SHAPES[safePhase];
    const start = live.current;

    const write = (pts: Pt[]) => {
      live.current = pts;
      liveAttr.current = toAttr(pts);
      for (const p of polys.current) p?.setAttribute("points", liveAttr.current);
    };

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      write(target);
      return;
    }

    if (raf.current !== null) cancelAnimationFrame(raf.current);

    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const e = ease(p);
      write(
        target.map(([tx, ty], i) => [
          start[i][0] + (tx - start[i][0]) * e,
          start[i][1] + (ty - start[i][1]) * e,
        ]) as Pt[]
      );
      if (p < 1) raf.current = requestAnimationFrame(step);
      else raf.current = null;
    };
    raf.current = requestAnimationFrame(step);

    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [safePhase, durationMs]);

  if (!Array.isArray(sections) || sections.length === 0) return null;

  return (
    <nav
      aria-label="Scene sections"
      style={{
        display: "flex",
        flexDirection: "column",
        justifyItems: "center",
        gap: 10,
        zIndex,
        pointerEvents: "none",
        margin: 0,
        padding: 0,
      }}
    > 
      {sections.map((s, i) => {
        const on = i === active;
        const idle = i > active;
        const size = on ? 18 : 13;
        // Hover-only -- an active item used to also force its label on,
        // but that read as a label "stuck" next to whichever glyph is
        // current even when nothing is being pointed at.
        const showLabel = hover === i;
        return (
          <button
            key={s.id ?? i}
            type="button"
            aria-current={on ? "true" : undefined}
            onClick={() => onSelect(s, i)}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            style={{
              display: "flex",
              alignItems: "end",
              gap: 12,
              background: "none",
              border: 0,
              margin: 0,
              padding: "6px 10px",
              cursor: "pointer",
              pointerEvents: "auto",
              font: "inherit",
              color: ink,
              outline: "none",
            }}
          >
            <svg
              viewBox="-10 -10 120 120"
              aria-hidden="true"
              style={{
                display: "flex",
                alignItems: "center",
                flex: "0 0 auto",
                overflow: "visible",
                width: size,
                height: size,
                transition: `width 300ms ${EASE_CSS}, height 300ms ${EASE_CSS}`,
              }}
            >
              <polygon
                ref={(el) => {
                  polys.current[i] = el;
                }}
                points={initial}
                /* only the active glyph is solid — the rest are outlines */
                fill={on ? ink : "none"}
                /* passed keeps full-strength stroke so progress still reads;
                   change `idle ? dim : ink` to just `dim` for uniform */
                stroke={idle ? dim : ink}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                style={{ transition: `fill ${durationMs}ms ease, stroke ${durationMs}ms ease` }}
              />
            </svg>
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                color: ink,
                fontWeight: on ? 500 : 400,
                opacity: showLabel ? 1 : 0,
                textShadow: "0 1px 8px rgba(0,0,0,0.45)",
                transition: `opacity 260ms ease, color ${durationMs}ms ease`,
              }}
            >
            </span>
          </button>
        );
      })}
    </nav>
  );
}
