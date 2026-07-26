"use client";

import { useCallback, useMemo, useState } from "react";
import { SectionRailProps } from "@/helpers/Interfaces";

const ROW = 24; // row height, px — dot sits centered in it

/* ------------------------------------------------------------------ *
 * Rail
 * ------------------------------------------------------------------ */

export default function SectionRail({
  items,
  value,
  defaultValue = 0,
  onChange,
  showDetail = true,
  gap = 40,
}: SectionRailProps) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState(defaultValue);
  const active = controlled ? value! : internal;

  const select = useCallback(
    (i: number) => {
      if (!controlled) setInternal(i);
      onChange?.(i, items[i]);
    },
    [controlled, items, onChange]
  );

  const { height, fill } = useMemo(() => {
    const n = items.length;
    const h = n * ROW + Math.max(0, n - 1) * gap;
    const track = h - ROW; // first dot centre -> last dot centre
    return { height: h, fill: n > 1 ? (active / (n - 1)) * track : 0 };
  }, [items.length, gap, active]);

  return (
    <div className="srail">
      <style>{CSS}</style>

      <div className="srail-panel">
        <div className="srail-track" style={{ height }}>
          <span className="srail-line" aria-hidden="true" />
          <span className="srail-line srail-line--fill" style={{ height: fill }} aria-hidden="true" />

          <ul className="srail-list" style={{ height }}>
            {items.map((it, i) => (
              <li key={it.id ?? it.label}>
                <button
                  type="button"
                  className="srail-item"
                  data-state={i === active ? "active" : i < active ? "passed" : "idle"}
                  aria-current={i === active ? "true" : undefined}
                  onClick={() => select(i)}
                >
                  <span className="srail-dot" aria-hidden="true" />
                  <span className="srail-label">{it.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {showDetail && (
          <div className="srail-detail">
            <p className="srail-eyebrow">Now viewing</p>
            <p className="srail-title">{items[active]?.label}</p>
            <p className="srail-desc">{items[active]?.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Optional legend — the four states, side by side
 * ------------------------------------------------------------------ */

const LEGEND: { state: string; name: string; note: string; label?: string }[] = [
  { state: "idle", name: "Idle", note: "Small, hollow, low contrast" },
  { state: "hover", name: "Hover", note: "Grows, label slides out", label: "Reef" },
  { state: "active", name: "Active", note: "Filled, ring halo, label persists" },
  { state: "passed", name: "Passed", note: "Filled but small, rail behind it" },
];

export function SectionRailLegend() {
  return (
    <div className="srail">
      <style>{CSS}</style>
      <div className="srail-legend">
        <p className="srail-eyebrow">State reference</p>
        <div className="srail-legend-grid">
          {LEGEND.map((l) => (
            <div key={l.state} className="srail-legend-cell">
              <div className="srail-legend-swatch">
                <span className="srail-dot" data-state={l.state} aria-hidden="true" />
                {l.label && <span className="srail-legend-label">{l.label}</span>}
              </div>
              <p className="srail-legend-name">{l.name}</p>
              <p className="srail-legend-note">{l.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Styles
 *
 * Tokens are declared with fallbacks on .srail, so the component works
 * standalone. Override any of them from an ancestor to theme it.
 * ------------------------------------------------------------------ */

const CSS = `
.srail{
  --srail-text:      var(--text-primary,   #16150f);
  --srail-secondary: var(--text-secondary, #5a5852);
  --srail-muted:     var(--text-muted,     #8b8880);
  --srail-surface:   var(--surface-1,      #f4f3ee);
  --srail-border:    var(--border,         #dedcd4);
  --srail-ease:      cubic-bezier(.22, 1, .36, 1);
  color:var(--srail-text);
  font-family:var(--font-ui, system-ui, -apple-system, sans-serif);
}

.srail-panel{
  background:var(--srail-surface); border-radius:12px;
  padding:1.5rem 1.25rem; display:flex; gap:28px; align-items:center;
  flex-wrap:wrap;
}

.srail-track{ position:relative; width:120px; flex:0 0 auto; }

.srail-line{
  position:absolute; left:11px; top:12px; width:2px; bottom:12px;
  background:var(--srail-border); border-radius:2px;
}
.srail-line--fill{
  bottom:auto; background:var(--srail-text);
  transition:height 700ms var(--srail-ease);
}

.srail-list{
  position:relative; margin:0; padding:0; list-style:none;
  display:flex; flex-direction:column; justify-content:space-between;
}

.srail-item{
  display:flex; align-items:center; gap:8px;
  height:${ROW}px; padding:0; margin:0;
  background:none; border:0; cursor:pointer; color:inherit;
  font:inherit; font-size:12px;
}
.srail-item:focus{ outline:none; }
.srail-item:focus-visible{ outline:2px solid var(--srail-text); outline-offset:3px; border-radius:14px; }

.srail-dot{
  display:block; flex:0 0 auto; border-radius:50%;
  width:9px; height:9px; margin-left:6px;
  background:transparent; border:1.5px solid var(--srail-muted);
  transition:width .32s var(--srail-ease), height .32s var(--srail-ease),
             margin .32s var(--srail-ease), background-color .32s ease,
             border-color .32s ease, box-shadow .32s ease;
}
.srail-label{
  white-space:nowrap; opacity:0; transform:translateX(-4px);
  color:var(--srail-secondary);
  transition:opacity .26s ease, transform .26s var(--srail-ease), color .26s ease;
}

/* hover — only meaningful on the ones that aren't already active */
.srail-item[data-state="idle"]:hover .srail-dot,
.srail-item[data-state="passed"]:hover .srail-dot,
.srail-item[data-state="idle"]:focus-visible .srail-dot,
.srail-item[data-state="passed"]:focus-visible .srail-dot{
  width:13px; height:13px; margin-left:4px; border-color:var(--srail-text);
}
.srail-item:hover .srail-label,
.srail-item:focus-visible .srail-label{ opacity:1; transform:translateX(0); }

.srail-item[data-state="passed"] .srail-dot{
  background:var(--srail-secondary); border-color:transparent;
}
.srail-item[data-state="passed"]:hover .srail-dot{ border-color:transparent; }

.srail-item[data-state="active"] .srail-dot{
  width:13px; height:13px; margin-left:4px;
  background:var(--srail-text); border-color:transparent;
  box-shadow:0 0 0 4px var(--srail-border);
}
.srail-item[data-state="active"] .srail-label{
  opacity:1; transform:translateX(0);
  color:var(--srail-text); font-weight:500;
}

.srail-detail{ flex:1; min-width:180px; display:flex; flex-direction:column; gap:10px; }
.srail-eyebrow{ margin:0; font-size:12px; color:var(--srail-muted); }
.srail-title{ margin:0; font-size:22px; font-weight:500; }
.srail-desc{ margin:0; font-size:14px; line-height:1.6; color:var(--srail-secondary); }

.srail-legend{ background:var(--srail-surface); border-radius:12px; padding:1.25rem; }
.srail-legend-grid{
  display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr));
  gap:16px; margin-top:14px;
}
.srail-legend-cell{ display:flex; flex-direction:column; align-items:center; gap:8px; }
.srail-legend-swatch{ height:28px; display:flex; align-items:center; gap:6px; }
.srail-legend-label{ font-size:11px; color:var(--srail-text); }
.srail-legend-name{ margin:0; font-size:13px; font-weight:500; }
.srail-legend-note{
  margin:0; font-size:12px; line-height:1.5; text-align:center;
  color:var(--srail-secondary);
}

/* legend swatches are static, driven by the same data-state contract */
.srail-legend .srail-dot{ margin-left:0; }
.srail-legend .srail-dot[data-state="hover"],
.srail-legend .srail-dot[data-state="active"]{ width:13px; height:13px; }
.srail-legend .srail-dot[data-state="hover"]{ border-color:var(--srail-text); }
.srail-legend .srail-dot[data-state="active"]{
  background:var(--srail-text); border-color:transparent;
  box-shadow:0 0 0 4px var(--srail-border);
}
.srail-legend .srail-dot[data-state="passed"]{
  background:var(--srail-secondary); border-color:transparent;
}

@media (prefers-reduced-motion: reduce){
  .srail-line--fill, .srail-dot, .srail-label{ transition-duration:.01ms; }
}
`;

/* ------------------------------------------------------------------ *
 * Usage
 *
 * const SECTIONS: RailItem[] = [
 *   { id: "island", label: "Island", description: "Home anchor. Camera eases in over ~1.2s." },
 *   { id: "reef",   label: "Reef",   description: "Dot fills as the camera arrives, not on click." },
 *   { id: "ridge",  label: "Ridge",  description: "Rail fills behind the active dot." },
 *   { id: "summit", label: "Summit", description: "Label stays pinned while active." },
 * ];
 *
 * // uncontrolled
 * <SectionRail items={SECTIONS} />
 *
 * // controlled — camera proximity drives it, clicks request travel
 * <SectionRail
 *   items={SECTIONS}
 *   value={activeIndex}
 *   onChange={(i) => travelTo(ANCHORS[i].scroll)}
 * />
 *
 * <SectionRailLegend />
 * ------------------------------------------------------------------ */
