"use client"

import { useEffect, useMemo, useState } from "react"
import { MenuOutlined, CloseOutlined } from "@ant-design/icons"

const NAV_ITEMS = ["Home", "About", "Projects", "Contact"]
const GRID_COLS = 10
const GRID_ROWS = 6
const TILE_DURATION_MS = 220
const STEP_MS = 28
const MAX_DIAGONAL = GRID_COLS - 1 + GRID_ROWS - 1
const MAX_DELAY_MS = MAX_DIAGONAL * STEP_MS

export function Menu() {
  const [open, setOpen] = useState(false)

  const tiles = useMemo(
    () =>
      Array.from({ length: GRID_ROWS }, (_, row) =>
        Array.from({ length: GRID_COLS }, (_, col) => (row + col) * STEP_MS),
      ).flat(),
    [],
  )

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="fixed top-10 right-6 z-50 flex items-center justify-center text-2xl text-white transition-colors hover:text-[#ff7d1c]"
      >
        {open ? <CloseOutlined /> : <MenuOutlined />}
      </button>

      <div
        className={`fixed inset-0 z-40 backdrop-blur-2xl transition-[backdrop-filter] duration-300 ${
          open ? "" : "pointer-events-none backdrop-blur-none"
        }`}
      >
        <div
          className="grid h-full w-full"
          style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}
        >
          {tiles.map((diagonalDelay, i) => (
            <div
              key={i}
              className="bg-black/70"
              style={{
                transform: open ? "scale(1)" : "scale(0)",
                transition: `transform ${TILE_DURATION_MS}ms ease-out`,
                transitionDelay: `${open ? diagonalDelay : MAX_DELAY_MS - diagonalDelay}ms`,
              }}
            />
          ))}
        </div>

        <nav className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <ul
            className="pointer-events-auto flex flex-col items-center gap-8 transition-opacity"
            style={{
              opacity: open ? 1 : 0,
              transitionDuration: "300ms",
              transitionDelay: open ? `${MAX_DELAY_MS}ms` : "0ms",
            }}
          >
            {NAV_ITEMS.map((item) => (
              <li key={item}>
                <a
                  href="#"
                  onClick={() => setOpen(false)}
                  className="font-sans text-5xl font-bold tracking-tight text-white transition-colors hover:text-[#ff7d1c]"
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  )
}
