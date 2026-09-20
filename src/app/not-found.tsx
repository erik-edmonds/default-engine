import Link from "next/link"

/**
 * The 404.
 *
 * Next's default is unbranded and offers nowhere to go, which is the same gap
 * error.tsx had until it was added -- and a mistyped URL is a likelier way to
 * arrive here than a crash is. Deliberately plain DOM, not the 3D scene: this
 * page may be the first thing a visitor ever sees, and making them wait on a
 * 40MB island to be told a link was wrong would be its own insult.
 *
 * Not a client component and not using SceneFallback, whose retry button needs
 * an onClick: there is nothing to retry here, only somewhere to go.
 */
export default function NotFound() {
  return (
    <main
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
        fontFamily: "var(--font-nunito), system-ui, sans-serif",
      }}
    >
      <h1 style={{ margin: 0, fontSize: "clamp(1.1rem, 3.4vw, 1.5rem)", fontWeight: 700, letterSpacing: "0.01em" }}>
        There is no island here
      </h1>
      <p style={{ margin: 0, maxWidth: "34ch", fontSize: "0.95rem", lineHeight: 1.5, color: "rgba(237,237,237,0.72)" }}>
        That link does not lead anywhere. The island does.
      </p>
      <Link
        href="/"
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
          textDecoration: "none",
        }}
      >
        Take me there
      </Link>
    </main>
  )
}
