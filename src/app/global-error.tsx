"use client"

import { useEffect } from "react"

/**
 * The last resort: a throw in the root layout itself.
 *
 * error.tsx cannot catch that one, because the layout it lives inside is the
 * thing that failed -- so this file has to supply its own <html> and <body>,
 * and it cannot rely on anything the layout would normally provide. That is
 * why the markup is inline rather than reusing SceneFallback: the fonts, the
 * stylesheet and the CSS custom properties are all set up in the layout that
 * just threw, so importing a component that expects them would be building on
 * the thing that is already broken.
 *
 * Styles are therefore literal values, not tokens, and match SceneFallback by
 * hand so the two read as the same panel.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[global-error]", error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0a0a0a" }}>
        <div
          role="alert"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.9rem",
            padding: "2rem",
            textAlign: "center",
            background: "#0a0a0a",
            color: "#ededed",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "clamp(1.1rem, 3.4vw, 1.5rem)", fontWeight: 700 }}>
            Something broke
          </h2>
          <p style={{ margin: 0, maxWidth: "34ch", fontSize: "0.95rem", lineHeight: 1.5, color: "rgba(237,237,237,0.72)" }}>
            The site failed to start. Reloading usually clears it.
          </p>
          <button
            type="button"
            onClick={reset}
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
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
