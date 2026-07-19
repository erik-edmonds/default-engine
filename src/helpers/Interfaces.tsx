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

export const themes: Record<string, Record<string, string>> = {
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