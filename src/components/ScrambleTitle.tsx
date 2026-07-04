"use client"

import { useLayoutEffect, useRef } from "react"

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const BANNER_DURATION_MS = 450
const REVEAL_START_DELAY_MS = 150
const TICK_MS = 45
const FLICKER_TICKS_PER_CHAR = 3

function randomChar() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]
}

export function ScrambleTitle({ text }: { text: string }) {
  const textRef = useRef<HTMLSpanElement>(null)
  const backgroundRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const el = textRef.current
    const bg = backgroundRef.current
    if (!el) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reducedMotion) {
      el.textContent = text
      if (bg) bg.style.transform = "scaleX(1)"
      return
    }

    // Stage 1: the banner box grows in with no text yet.
    el.textContent = text.replace(/\S/g, " ")
    if (bg) {
      bg.style.transition = `transform ${BANNER_DURATION_MS}ms ease-out`
      bg.style.transform = "scaleX(0)"
      void bg.offsetWidth
      bg.style.transform = "scaleX(1)"
    }

    // Stage 2 (after the banner settles): reveal one character at a time,
    // left to right. Only the current character flickers; everything after
    // it stays blank until its turn, so the reveal reads as a left-to-right
    // sweep instead of the whole word flickering at once. A tick counter
    // (not elapsed wall-clock time) drives it, so a main-thread stall just
    // pauses the reveal instead of jumping ahead once it clears.
    let tick = 0
    const render = () => {
      const activeIndex = Math.floor(tick / FLICKER_TICKS_PER_CHAR)
      let out = ""
      for (let i = 0; i < text.length; i++) {
        if (i < activeIndex || text[i] === " ") out += text[i]
        else if (i === activeIndex) out += randomChar()
        else out += " "
      }
      el.textContent = out
    }

    let interval: ReturnType<typeof setInterval> | undefined
    const startTimeout = setTimeout(() => {
      render()
      interval = setInterval(() => {
        tick++
        if (Math.floor(tick / FLICKER_TICKS_PER_CHAR) >= text.length) {
          el.textContent = text
          clearInterval(interval)
          return
        }
        render()
      }, TICK_MS)
    }, BANNER_DURATION_MS + REVEAL_START_DELAY_MS)

    return () => {
      clearTimeout(startTimeout)
      clearInterval(interval)
    }
  }, [text])

  return (
    <span className="relative inline-block -rotate-6 px-3 py-1">
      <span
        ref={backgroundRef}
        className="absolute inset-0 origin-left border-2 border-[#f4ead8] bg-[#d15c0f]"
      />
      <span
        ref={textRef}
        className="relative font-mono text-lg font-bold uppercase tracking-widest text-white"
      />
    </span>
  )
}
