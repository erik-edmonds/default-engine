"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { Anchor, NavContext } from "@/helpers/Interfaces";

const DotNavContext = createContext<NavContext | null>(null);

function useDotNav() {
  const ctx = useContext(DotNavContext);
  if (!ctx) throw new Error("DotNav components must be inside <DotNavProvider>");
  return ctx;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const nodes = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const value = useMemo(() => ({ nodes, active, setActive }), [active]);
  return <DotNavContext.Provider value={value}>{children}</DotNavContext.Provider>;
}

/* ------------------------------------------------------------------ *
 * Projector — lives INSIDE <Canvas>. Renders nothing.
 * Each frame it projects world anchors to screen space and writes the
 * result straight to the DOM nodes, bypassing React re-renders.
 * ------------------------------------------------------------------ */

export function NavigationProjector({
  anchors,
  /** Raycast to fade dots hidden behind geometry. Costs a little; throttled. */
  occlusionTest = true,
  /** Run the occlusion raycast every N frames. */
  occlusionInterval = 6,
}: {
  anchors: Anchor[];
  occlusionTest?: boolean;
  occlusionInterval?: number;
}) {
  const { nodes, active, setActive } = useDotNav();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);

  const v = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const frame = useRef(0);
  const occluded = useRef<boolean[]>([]);

  useFrame(() => {
    frame.current++;
    const doOcclusion = occlusionTest && frame.current % occlusionInterval === 0;

    let bestIndex = 0;
    let bestDist = Infinity;

    for (let i = 0; i < anchors.length; i++) {
      const el = nodes.current[i];
      const a = anchors[i];

      v.set(a.position[0], a.position[1], a.position[2]);

      // active state follows the camera, so scroll and clicks both drive it
      const dist = camera.position.distanceTo(v);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = i;
      }

      if (doOcclusion) {
        dir.copy(v).sub(camera.position);
        const len = dir.length();
        ray.set(camera.position, dir.normalize());
        ray.far = len - 0.25; // stop just short of the anchor itself
        occluded.current[i] = ray.intersectObjects(scene.children, true).length > 0;
      }

      if (!el) continue;

      v.project(camera);
      const behind = v.z > 1;
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;

      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      el.style.visibility = behind ? "hidden" : "visible";
      // never fully hide an occluded dot — that strands the user
      el.dataset.occluded = occluded.current[i] ? "true" : "false";
    }

    if (bestIndex !== active) setActive(bestIndex);
  });

  return null;
}

/* ------------------------------------------------------------------ *
 * Overlay — lives OUTSIDE <Canvas>, as a sibling.
 * Real buttons: keyboard order, focus rings, aria labels, CSS hover.
 * ------------------------------------------------------------------ */

export function NavigationOverlay({
  anchors,
  onSelect,
}: {
  anchors: Anchor[];
  onSelect: (anchor: Anchor, index: number) => void;
}) {
  const { nodes, active } = useDotNav();

  return (
    <>
      <style>{CSS}</style>
      <nav className="tdn-layer" aria-label="Scene sections">
        {anchors.map((a, i) => (
          <button
            key={a.id}
            ref={(el) => {
              nodes.current[i] = el;
            }}
            type="button"
            className="tdn-dot"
            data-state={i === active ? "active" : i < active ? "passed" : "idle"}
            aria-label={a.label}
            aria-current={i === active ? "true" : undefined}
            onClick={() => onSelect(a, i)}
          >
            <span className="tdn-mark" aria-hidden="true" />
            <span className="tdn-label" aria-hidden="true">
              {a.label}
            </span>
          </button>
        ))}
      </nav>
    </>
  );
}

const CSS = `
.tdn-layer{
  position:fixed; inset:0; pointer-events:none; z-index:20;
}
.tdn-dot{
  position:absolute; top:0; left:0;
  display:flex; align-items:center; gap:8px;
  background:none; border:0; padding:10px; margin:0;
  pointer-events:auto; cursor:pointer;
  color:#fff; font:400 12px/1 var(--font-ui, system-ui, sans-serif);
  will-change:transform;
}
.tdn-dot[data-occluded="true"]{ opacity:.35; }

.tdn-mark{
  width:9px; height:9px; border-radius:50%; flex:0 0 auto;
  border:1.5px solid rgba(255,255,255,.65); background:transparent;
  transition:width .32s cubic-bezier(.22,1,.36,1),
             height .32s cubic-bezier(.22,1,.36,1),
             background-color .32s ease, border-color .32s ease,
             box-shadow .32s ease;
}
.tdn-label{
  white-space:nowrap; opacity:0; transform:translateX(-4px);
  text-shadow:0 1px 6px rgba(0,0,0,.6);
  transition:opacity .26s ease, transform .26s cubic-bezier(.22,1,.36,1);
}

/* idle: slow breath so it reads as interactive without shouting */
.tdn-dot[data-state="idle"] .tdn-mark{ animation:tdn-breathe 3.2s ease-in-out infinite; }

.tdn-dot:hover .tdn-mark,
.tdn-dot:focus-visible .tdn-mark{
  width:13px; height:13px; border-color:#fff; animation:none;
}
.tdn-dot:hover .tdn-label,
.tdn-dot:focus-visible .tdn-label{ opacity:1; transform:translateX(0); }

.tdn-dot[data-state="passed"] .tdn-mark{
  background:rgba(255,255,255,.7); border-color:transparent; animation:none;
}
.tdn-dot[data-state="active"] .tdn-mark{
  width:13px; height:13px; background:#fff; border-color:transparent;
  box-shadow:0 0 0 4px rgba(255,255,255,.22); animation:none;
}
.tdn-dot[data-state="active"] .tdn-label{ opacity:1; transform:translateX(0); font-weight:500; }

.tdn-dot:focus{ outline:none; }
.tdn-dot:focus-visible{ outline:2px solid #fff; outline-offset:2px; border-radius:20px; }

@keyframes tdn-breathe{
  0%,100%{ transform:scale(1);   opacity:.65; }
  50%    { transform:scale(1.18);opacity:1; }
}
@media (prefers-reduced-motion:reduce){
  .tdn-mark,.tdn-label{ transition-duration:.01ms; }
  .tdn-dot[data-state="idle"] .tdn-mark{ animation:none; }
}
`;

/* ------------------------------------------------------------------ *
 * Eased scroll travel
 *
 * Drives the real scroll position rather than the camera, so the page
 * and the camera can never desync. Cancels the moment the visitor
 * touches the wheel — never fight the user for control.
 * ------------------------------------------------------------------ */

export function useScrollTravel(durationMs = 1200) {
  const raf = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const travelTo = useCallback(
    (scroll: number) => {
      cancel();

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const to = Math.max(0, Math.min(1, scroll)) * max;
      const from = window.scrollY;
      const delta = to - from;

      if (reduced || Math.abs(delta) < 1) {
        window.scrollTo(0, to);
        return;
      }

      const bail = () => {
        cancel();
        window.removeEventListener("wheel", bail);
        window.removeEventListener("touchstart", bail);
      };
      window.addEventListener("wheel", bail, { passive: true, once: true });
      window.addEventListener("touchstart", bail, { passive: true, once: true });

      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / durationMs);
        // easeInOutCubic — slow out, committed middle, soft settle
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        window.scrollTo(0, from + delta * e);
        if (t < 1) {
          raf.current = requestAnimationFrame(step);
        } else {
          bail();
        }
      };
      raf.current = requestAnimationFrame(step);
    },
    [cancel, durationMs]
  );

  return travelTo;
}

/* ------------------------------------------------------------------ *
 * Usage
 *
 * const ANCHORS: Anchor[] = [
 *   { id: "island", label: "Island",  position: [0, 1.2, 0],   scroll: 0.00 },
 *   { id: "reef",   label: "Reef",    position: [-8, 0.4, -3], scroll: 0.33 },
 *   { id: "ridge",  label: "Ridge",   position: [4, 5.0, -6],  scroll: 0.66 },
 *   { id: "summit", label: "Summit",  position: [9, 7.5, -11], scroll: 1.00 },
 * ];
 *
 * function Page() {
 *   const travelTo = useScrollTravel(1200);
 *   return (
 *     <DotNavProvider>
 *       <Canvas>
 *         <DotNavProjector anchors={ANCHORS} />
 *       </Canvas>
 *       <DotNavOverlay
 *         anchors={ANCHORS}
 *         onSelect={(a) => travelTo(a.scroll)}
 *       />
 *     </DotNavProvider>
 *   );
 * }
 * ------------------------------------------------------------------ */
