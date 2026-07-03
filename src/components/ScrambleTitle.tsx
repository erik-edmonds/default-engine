"use client"

import { useLayoutEffect, useRef } from "react"

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
const STEP_MS = 80

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

    // A step counter driven by setInterval (rather than a tween that tracks
    // elapsed wall-clock time, e.g. GSAP) so that a long main-thread stall
    // (the 3D scene's assets compiling shortly after mount) just pauses the
    // reveal instead of "catching up" by jumping straight to the final text.
    if (bg) {
      bg.style.transition = `transform ${text.length * STEP_MS}ms ease-out`
      bg.style.transform = "scaleX(0)"
      void bg.offsetWidth
      bg.style.transform = "scaleX(1)"
    }

    let revealedCount = 0
    const render = () => {
      let out = ""
      for (let i = 0; i < text.length; i++) {
        out += i < revealedCount || text[i] === " " ? text[i] : randomChar()
      }
      el.textContent = out
    }

    render()
    const interval = setInterval(() => {
      revealedCount++
      render()
      if (revealedCount >= text.length) clearInterval(interval)
    }, STEP_MS)

    return () => clearInterval(interval)
  }, [text])

  return (
    <span className="relative inline-block -rotate-3 px-3 py-1">
      <span
        ref={backgroundRef}
        className="absolute inset-0 origin-left rounded-sm border-2 border-[#f4ead8] bg-[#1c3a5e]"
      />
      <span
        ref={textRef}
        className="relative font-mono text-lg font-bold uppercase tracking-widest text-white"
      />
    </span>
  )
}
