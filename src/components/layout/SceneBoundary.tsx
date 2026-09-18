"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { SceneFallback } from "@/components/layout/SceneFallback"

interface Props {
  children: ReactNode
  /** Named in the console so a report says which boundary caught it. */
  label: string
}

interface State {
  error: Error | null
}

/**
 * The only error boundary in the app, wrapped around the 3D scene.
 *
 * There was none anywhere before this -- no `error.tsx`, no `global-error.tsx`,
 * no `componentDidCatch` -- so ANY throw from inside <Canvas> replaced the whole
 * site with Next's generic error page. That includes the React-19 <Bloom> ref
 * hazard documented in app/page.tsx, and any GLB that fails to load: Suspense
 * catches a pending promise, never a rejected one, so a 404'd model throws on
 * its retry render with nothing above it to catch.
 *
 * A class component because that is still the only way to catch a render error
 * in React. It keeps the boundary tight around the canvas on purpose: the name
 * stamp, the home button and the sound toggle are plain DOM and survive a dead
 * scene, so they should stay on screen rather than being taken down with it.
 */
export class SceneBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Left in production deliberately. A visitor who reports "it went dark"
    // is otherwise the only diagnostic available, and this is the one place
    // that knows what actually threw.
    console.error(`[${this.props.label}]`, error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <SceneFallback
        title="The scene stopped"
        detail="Something in the 3D scene failed to render. Reloading usually clears it."
        action="Reload"
        onAction={() => window.location.reload()}
      />
    )
  }
}
