import { ReactNode } from "react"

/* --------------------------VARIABLES------------------------------- */

const STAR: Pt[] = Array.from({ length: 12 }, (_, i) => {
  const t = ((-90 + i * 30) * Math.PI) / 180;
  const r = i % 2 === 0 ? 50 : 23;
  return [50 + r * Math.cos(t), 50 + r * Math.sin(t)];
});

const HEXAGON: Pt[] = (() => {
  const a = 50 * Math.sin(Math.PI / 3);
  const m = 37.5;
  const my = a / 2;
  return [
    [50, 50 - a], [75, 50 - a], [50 + m, 50 - my],
    [100, 50], [50 + m, 50 + my], [75, 50 + a],
    [50, 50 + a], [25, 50 + a], [50 - m, 50 + my],
    [0, 50], [50 - m, 50 - my], [25, 50 - a],
  ];
})();

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

export const DURATION_MS = 1200;
export const EASE_CSS = "cubic-bezier(0.4, 0, 0.2, 1)";

/* ------------------------------TYPES-------------------------------- */

export type Phase = "night" | "dawn" | "day" | "evening";
export type Pt = [number, number];

/* -----------------------------INTERFACES------------------------------ */

export interface PortfolioFrameProps {
  position: number[]
  rotation: number[]
  child: ReactNode
  color: string
  url: string
  name: string
}

export interface AppState {
  theme: string;
  setTheme: (theme: string) => void;
}

export interface Anchor {
  id: string;
  /** Shown on hover and while active. One or two words. */
  label: string;
  /** World-space point the dot pins to. */
  position: [number, number, number];
  /** Normalized scroll offset (0..1) where the camera rests at this anchor. */
  scroll: number;
}

export interface NavContext {
  nodes: React.RefObject<(HTMLButtonElement | null)[]>;
  active: number;
  setActive: (i: number) => void;
}

export interface RailItem {
  id?: string;
  /** Shown on hover and while active. */
  label: string;
  /** Copy for the detail panel. */
  description: string;
}

export interface SectionRailProps {
  items: RailItem[];
  /** Controlled index. Omit to let the rail own its state. */
  value?: number;
  defaultValue?: number;
  onChange?: (index: number, item: RailItem) => void;
  /** Hide the right-hand detail panel and render the rail alone. */
  showDetail?: boolean;
  /** Vertical gap between dots, px. */
  gap?: number;
}

export interface RailSection {
  id: string;
}

export interface SceneRailProps {
  sections: RailSection[];
  active: number;
  onSelect: (section: RailSection, index: number) => void;
  phase: Phase;
  side?: "left" | "right";
  inset?: number;
  strokeWidth?: number;
  durationMs?: number;
  zIndex?: number;
}

/* -----------------------------RECORDS------------------------------ */

export const INK: Record<Phase, string> = {
  night: "#FFFFFF",
  dawn: "#000000",
  day: "#b5510f",
  evening: "#FFFFFF",
};

export const INK_DIM: Record<Phase, string> = {
  night: "rgba(255, 255, 255, 0.45)",
  dawn: "rgba(0, 0, 0, 0.45)",
  day: "rgba(181, 81, 15, 0.42)",
  evening: "rgba(255, 255, 255, 0.45)",
};

export const SHAPES: Record<Phase, Pt[]> = {
  night: STAR,
  dawn: HEXAGON,
  day: DIAMOND,
  evening: HALFMOON,
};

export const themes: Record<string, Record<string, string>> = {
  dawn: {
    background: "black",
    lines: "#ffb37a"
  },
  day: {
    background: "black",
    lines: "white"
  },
  evening: {
    background: "white",
    lines: "black"
  },
  night: {
    background: "white",
    lines: "#d15c0f"
  }
};