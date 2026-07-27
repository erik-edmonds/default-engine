"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * Rail — self-contained. Types, geometry, morph logic and the
 * component all live here, and every style is inline: no injected CSS,
 * no class names, nothing external to collide with.
 *
 * IMPORTANT: this renders DOM (nav / button / svg). It must be a SIBLING
 * of your <Canvas>, never a child — R3F will try to build DOM tags as
 * Three.js objects and take the whole tree down.
 *
 *   <>
 *     <Canvas>{/* scene only *_/}</Canvas>
 *     <Rail ... />
 *   </>
 * ------------------------------------------------------------------ */

export type Phase = "night" | "dawn" | "day" | "evening";

export const DURATION_MS = 1200;
const EASE_CSS = "cubic-bezier(0.4, 0, 0.2, 1)";

/** Night is the only dark sky, so it's the only phase with light ink. */
export const INK: Record<Phase, string> = {
  night: "#EDE4CF",
  dawn: "#b5510f",
  day: "#22303F",
  evening: "#b5510f",
};

export const INK_DIM: Record<Phase, string> = {
  night: "rgba(237, 228, 207, 0.45)",
  dawn: "rgba(181, 81, 15, 0.45)",
  day: "rgba(34, 48, 63, 0.42)",
  evening: "rgba(181, 81, 15, 0.45)",
};

/* ---------------- geometry ----------------
 * Twelve points each, index 0 at top-centre and index 6 at bottom-centre.
 * Matching counts and landmarks let one shape tween into another cleanly.
 *
 *   star      — one point straight up
 *   square    — axis aligned, flat edges up / down / left / right
 *   diamond   — square rotated 45deg, sharp points up / right / down / left
 *   half-moon — flat straight edge on the left, curved bulge opening right
 *               (toward the setting sun, same direction the old, too-thin
 *               crescent opened)
 */

type Pt = [number, number];

const STAR: Pt[] = Array.from({ length: 12 }, (_, i) => {
  const t = ((-90 + i * 30) * Math.PI) / 180;
  const r = i % 2 === 0 ? 50 : 23;
  return [50 + r * Math.cos(t), 50 + r * Math.sin(t)];
});

const SQUARE: Pt[] = (() => {
  const h = 50 / Math.SQRT2;
  const t = (2 * h) / 3;
  return [
    [50, 50 - h], [50 + t, 50 - h], [50 + h, 50 - t],
    [50 + h, 50], [50 + h, 50 + t], [50 + t, 50 + h],
    [50, 50 + h], [50 - t, 50 + h], [50 - h, 50 + t],
    [50 - h, 50], [50 - h, 50 - t], [50 - t, 50 - h],
  ];
})();

// 4 sharp corners (N/E/S/W) + 2 evenly-spaced points per edge -- same
// "corner, third, two-thirds" structure SQUARE already uses, just without
// SQUARE's flat-top treatment, so it reads as an unambiguous diamond
// rather than something a 13-18px icon could still pass for a rounded
// square.
const DIAMOND: Pt[] = (() => {
  const corners: Pt[] = [[50, 0], [100, 50], [50, 100], [0, 50]];
  const pts: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % 4];
    pts.push([x0, y0]);
    pts.push([x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3]);
    pts.push([x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3]);
  }
  return pts;
})();

// Right half of a circle (7 points, top to bottom through the right edge)
// plus 5 evenly-spaced points on the straight return trip up the vertical
// diameter -- an actual half-moon silhouette, not the sliver the old
// CRESCENT (a thin lune between two offset circles) read as.
const HALFMOON: Pt[] = (() => {
  const pts: Pt[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = ((-90 + i * 30) * Math.PI) / 180;
    pts.push([50 + 50 * Math.cos(t), 50 + 50 * Math.sin(t)]);
  }
  for (let k = 1; k <= 5; k++) {
    pts.push([50, 100 - (100 * k) / 6]);
  }
  return pts;
})();

const SHAPES: Record<Phase, Pt[]> = {
  night: STAR,
  dawn: SQUARE,
  day: DIAMOND,
  evening: HALFMOON,
};

const toAttr = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");

/** JS twin of EASE_CSS, so the morph and the CSS transitions land together. */
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

export interface RailSection {
  id: string;
  label: string;
}

export interface SceneRailProps {
  sections: RailSection[];
  /** Index of the section the camera is nearest. */
  active: number;
  onSelect: (section: RailSection, index: number) => void;
  /** Change this and every glyph morphs to the new shape and ink. */
  phase: Phase;
  side?: "left" | "right";
  inset?: number;
  /** Rendered stroke weight in CSS px, constant at any glyph size. */
  strokeWidth?: number;
  durationMs?: number;
  /** Raise this if your canvas paints over the rail. */
  zIndex?: number;
}

export default function Rail({
  sections,
  active,
  onSelect,
  phase,
  side = "left",
  inset = 40,
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
  // live interpolated shape, so a phase change mid-morph continues from
  // where the glyphs actually are -- read only imperatively (setAttribute
  // in the rAF loop below), never during render, so JSX below uses the
  // separate `initial` value instead for its one-time initial paint.
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
        position: "fixed",
        top: "50%",
        transform: "translateY(-50%)",
        ...(side === "left" ? { left: inset } : { right: inset }),
        display: "flex",
        flexDirection: "column",
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
              flexDirection: side === "right" ? "row-reverse" : "row",
              alignItems: "center",
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
                display: "block",
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
              {s.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------------ *
 * Usage
 *
 * const SECTIONS = [
 *   { id: "home",  label: "Home"  },
 *   { id: "work",  label: "Work"  },
 *   { id: "about", label: "About" },
 * ];
 *
 * const [phase, setPhase] = useState<Phase>("night");
 * const [active, setActive] = useState(0);
 *
 * <Rail
 *   sections={SECTIONS}
 *   active={active}
 *   onSelect={(s, i) => setActive(i)}
 *   phase={phase}
 * />
 *
 * Pass the same phase your scene lighting uses. On every change the glyphs
 * morph and recolour over durationMs — hand that constant to the scene
 * tween too and they'll land together.
 *
 * SSR: if you seed phase from the visitor's clock, do it inside a
 * useEffect, not in useState's initializer — otherwise server and client
 * disagree and React throws a hydration mismatch.
 * ------------------------------------------------------------------ */
