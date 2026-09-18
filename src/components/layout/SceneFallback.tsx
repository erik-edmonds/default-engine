"use client"

import type { ReactNode } from "react"

/** The one panel every failure path lands on.
 *
 *  Before this existed there were three outcomes when something went wrong, and
 *  a visitor could tell none of them apart:
 *
 *    - a throw inside <Canvas> replaced the entire site with Next's built-in
 *      "Application error: a client-side exception has occurred", unbranded,
 *      with no retry;
 *    - a GLB that 404'd threw on its retry render and did the same, because
 *      <Suspense> catches pending and never rejected;
 *    - a lost WebGL context painted the canvas black and said nothing at all.
 *      That last one already cost a day of this project: the "missing texture"
 *      hunt was Chrome dropping the GPU context, and the app had no way to say
 *      so, so it read as a broken asset pipeline.
 *
 *  Deliberately plain DOM and inline styles: this has to render when the scene,
 *  the GPU, or a stylesheet is the thing that failed. Nothing here imports
 *  three, and nothing here can suspend. */
export function SceneFallback({
  title,
  detail,
  action,
  onAction,
}: {
  title: string
  detail: ReactNode
  /** Omitted when there is nothing honest to offer -- a dead button is worse
   *  than none. */
  action?: string
  onAction?: () => void
}) {
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.9rem",
        padding: "2rem",
        textAlign: "center",
        background: "#0a0a0a",
        color: "#ededed",
        fontFamily: "var(--font-nunito), system-ui, sans-serif",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "clamp(1.1rem, 3.4vw, 1.5rem)", fontWeight: 700, letterSpacing: "0.01em" }}>{title}</h2>
      <p style={{ margin: 0, maxWidth: "34ch", fontSize: "0.95rem", lineHeight: 1.5, color: "rgba(237,237,237,0.72)" }}>{detail}</p>
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          style={{
            marginTop: "0.4rem",
            padding: "0.6rem 1.4rem",
            border: "1px solid rgba(210,90,26,0.7)",
            borderRadius: 999,
            background: "rgba(210,90,26,0.12)",
            color: "#ffb37a",
            font: "inherit",
            fontSize: "0.8rem",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          {action}
        </button>
      )}
    </div>
  )
}
