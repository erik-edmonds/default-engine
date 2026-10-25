"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { useXRInputSourceState } from "@react-three/xr"

import { XR_BUDGET_STEPS } from "@/config/xrScan"

/** The controller bindings.
 *
 *  HARDWARE BUTTONS, NOT A MENU, for the two things you do constantly while
 *  measuring: changing scale and changing the budget. A menu costs a ray, an
 *  aim and a click for something you will do fifty times in a session.
 *
 *  Edge-detected in `useFrame` against the previous frame's state, because
 *  `useXRInputSourceState` reports the button as held, not as pressed —
 *  without the edge every frame of a half-second press would step the budget
 *  once, and one press would run the whole range.
 *
 *  Renders nothing. It is a frame subscriber, not a thing in the scene, and
 *  it deliberately takes no frame priority: this Canvas has no prioritised
 *  subscribers and that is what keeps fiber's render gate open.
 */
export function XrControls({
  onToggleScale,
  onBudgetStep,
}: {
  onToggleScale: () => void
  onBudgetStep: (direction: 1 | -1) => void
}) {
  const right = useXRInputSourceState("controller", "right")
  const left = useXRInputSourceState("controller", "left")
  const was = useRef({ b: false, a: false, y: false, x: false })

  useFrame(() => {
    const b = right?.gamepad?.["b-button"]?.state === "pressed"
    const a = right?.gamepad?.["a-button"]?.state === "pressed"
    const y = left?.gamepad?.["y-button"]?.state === "pressed"
    const x = left?.gamepad?.["x-button"]?.state === "pressed"

    // B: the headline control. Tabletop <-> life size.
    if (b && !was.current.b) onToggleScale()
    // A / X: walk the budget up and down. This is the measurement.
    if (a && !was.current.a) onBudgetStep(1)
    if (x && !was.current.x) onBudgetStep(-1)

    was.current = { b, a, y, x }
  })

  return null
}

/** Step through the geometric budget ladder, clamped at both ends. */
export function stepBudget(current: number, direction: 1 | -1): number {
  // Nearest rung first, so a budget that arrived from `?budget=` and is not
  // on the ladder still steps sensibly rather than jumping to one end.
  let nearest = 0
  for (let i = 1; i < XR_BUDGET_STEPS.length; i++) {
    if (Math.abs(XR_BUDGET_STEPS[i] - current) < Math.abs(XR_BUDGET_STEPS[nearest] - current)) nearest = i
  }
  const next = Math.min(Math.max(nearest + direction, 0), XR_BUDGET_STEPS.length - 1)
  return XR_BUDGET_STEPS[next]
}
