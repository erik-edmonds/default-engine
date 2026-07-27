import { ReactNode } from "react"

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