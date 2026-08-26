"use client"

import { useEffect, useRef, useState } from "react"
import { useAtom } from "jotai"
import gsap from "gsap"
import { Howl } from "howler"
import { sfxEnabled } from "@/helpers/StateProvider"
import { useSfx } from "@/helpers/useSfx"

// Same warm palette already used across the HUD (Favicon/PhaseCube/Rail
// accent) and, notably, the actual 3D Speaker prop in the scene itself
// (materials.emissive on its glow ring in Speaker.tsx) -- built from that
// instead of generic black/white icon-font strokes so this control reads
// as the same "material" as the rest of the site and the object it
// controls, not a stock UI import.
const GLOW_TOP = "#ffb37a"
const GLOW_BOTTOM = "#ff7d1c"
const DIM_COLOR = "#8a8a8a"

// Both faces share one speaker-cone silhouette -- on/off is expressed as
// whether it's *lit*, not a different glyph, the same way the real Speaker
// prop's glow ring is either glowing or dark. That mirrors this site's own
// established metaphor instead of an arbitrary icon swap.
function LitSpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="55%"
      height="55%"
      style={{ filter: "drop-shadow(0 0 4px rgba(255, 125, 28, 0.9))" }}
    >
      <defs>
        <linearGradient id="soundtoggle-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GLOW_TOP} />
          <stop offset="100%" stopColor={GLOW_BOTTOM} />
        </linearGradient>
      </defs>
      <polygon points="3,9 8,9 13,4 13,20 8,15 3,15" fill="url(#soundtoggle-glow)" />
      <g fill="none" stroke={GLOW_BOTTOM} strokeWidth={2} strokeLinecap="round">
        <path d="M16 8a5 5 0 0 1 0 8" />
        <path d="M19 5a9 9 0 0 1 0 14" />
      </g>
    </svg>
  )
}

function DimSpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="55%" height="55%">
      <polygon points="3,9 8,9 13,4 13,20 8,15 3,15" fill={DIM_COLOR} />
      <line x1="15" y1="7" x2="20" y2="17" stroke={DIM_COLOR} strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

export default function SoundToggle({ size = 56 }: { size?: number }) {
  const [enabled, setEnabled] = useAtom(sfxEnabled)
  const play = useSfx()
  const flipRef = useRef<HTMLDivElement | null>(null)
  // Absolute rotation target (steps * 180deg), not a relative "+= 180" --
  // same reasoning as PhaseCube's stepsRef: self-correcting if a click
  // interrupts an in-flight flip, rather than compounding drift.
  const stepsRef = useRef(0)

  const [waves] = useState(() => new Howl({
    src: ["/sound/waves.mp3"],
    volume: 0.35,
    loop: true,
    preload: false,
    // Howler's default (Web Audio API) decoding has to fetch AND fully
    // decode the whole file before any playback can start -- for a 29MB
    // file that's the multi-second delay before waves audibly starts.
    // html5: true switches to native <audio> streaming instead, which
    // starts as soon as the first chunk buffers.
    html5: true,
  }))

  useEffect(() => {
    if (enabled) {
      if (waves.state() === "unloaded") waves.load()
      waves.play()
    } else {
      waves.pause()
    }
  }, [enabled, waves])

  // Same orphaned-instance risk Speaker.tsx has -- stop cleanly on unmount
  // rather than leaving a looping ambient track running with nothing left
  // to control it.
  useEffect(() => () => { waves.stop() }, [waves])

  useEffect(() => {
    if (!flipRef.current) return
    gsap.to(flipRef.current, {
      rotationY: stepsRef.current * 180,
      duration: 0.6,
      ease: "power2.inOut",
      overwrite: true,
    })
  }, [enabled])

  const handleClick = () => {
    stepsRef.current += 1
    setEnabled((v) => !v)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => play("click")}
      aria-label={enabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={enabled}
      style={{
        width: size,
        height: size,
        perspective: 400,
        border: enabled ? "1px solid rgba(255,180,120,0.5)" : "1px solid rgba(255,255,255,0.25)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(6px)",
        // A soft amber halo when lit, echoing the actual glow ring on the
        // 3D Speaker prop -- gives this control its own distinct, "lit up"
        // identity rather than sharing PhaseCube's neutral glass look.
        boxShadow: enabled ? "0 0 14px 2px rgba(255, 125, 28, 0.45)" : "none",
        transition: "box-shadow 0.4s ease, border-color 0.4s ease",
        cursor: "pointer",
        padding: 0,
        outlineOffset: 2,
      }}
    >
      <div
        ref={flipRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          pointerEvents: "none",
        }}
      >
        {/* Front face -- unrotated, visible when stepsRef is even (0, 2, 4...
            clicks), which includes the very first render before any click.
            sfxEnabled starts false, so the dim icon has to be the one
            showing with zero rotation applied, not the lit one.
            pointerEvents: none on this whole subtree (not just here) --
            a backface-visibility:hidden face pointing away from the viewer
            is unreliable for hover/click hit-testing in some browsers, so
            all pointer interaction is left to the outer <button>, same as
            PhaseCube's inner <Canvas>. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backfaceVisibility: "hidden",
          }}
        >
          <DimSpeakerIcon />
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <LitSpeakerIcon />
        </div>
      </div>
    </button>
  )
}
