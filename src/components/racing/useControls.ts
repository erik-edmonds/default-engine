import { useEffect, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { RaycastVehiclePublicApi, BoxProps, PublicApi } from "@react-three/cannon"

/** The keys the game uses, and the only ones it will swallow. */
const GAME_KEYS = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "KeyR",
  "ShiftLeft", "Space",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
])

/** Driving. W/S drive, A/D steer, Shift boosts, Space brakes, R resets, and
 *  the arrow keys nudge the car in the air.
 *
 *  TWO DELIBERATE CHANGES FROM THE ORIGINAL, both forced by the move out of
 *  a standalone Vite page and into a route on this site:
 *
 *  1. The held keys live in a ref read from useFrame, where they were React
 *     state read from an effect with no dependency array -- an effect that
 *     therefore ran on every render and depended on a re-render happening to
 *     apply anything. It worked because a keypress was the only thing that
 *     ever re-rendered that component. Here the controls are read on the
 *     frame loop instead: no re-render per keystroke, and the arrow-key
 *     impulses apply smoothly while held rather than once per state change.
 *
 *  2. The game keys are swallowed. On a page that can scroll -- which the
 *     original could not -- Space and the arrows scroll the document, so
 *     braking jumped the view down a screen. Only the keys above are taken,
 *     so Tab, the browser's own shortcuts and everything else still work. */
export function useControls(
  vehicleApi: RaycastVehiclePublicApi | null,
  chassisApi: PublicApi | null,
) {
  const held = useRef<Record<string, boolean>>({})
  /** Keys whose effect fires ONCE PER PRESS rather than for as long as they
   *  are down: the four air-control nudges and the reset.
   *
   *  This distinction is load-bearing and easy to lose in the port. The
   *  original applied its impulses from a render-driven effect, so one
   *  keydown produced exactly one impulse. Reading the same keys off the
   *  frame loop instead would apply sixty impulses a second for as long as
   *  the key was held and fire the car into orbit. Pressing is the event;
   *  holding is not. */
  const pressed = useRef<Record<string, boolean>>({})

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (!GAME_KEYS.has(event.code)) return
      // Never steal a key from a text field, and never from a browser
      // shortcut the user meant for the browser.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      held.current[event.code] = true
      // The OS repeats a held key, and the original responded to each
      // repeat, so repeats are deliberately kept rather than filtered on
      // event.repeat -- that is what makes holding an arrow read as a
      // sustained nudge instead of a single tap.
      pressed.current[event.code] = true
    }
    const up = (event: KeyboardEvent) => {
      if (!GAME_KEYS.has(event.code)) return
      held.current[event.code] = false
    }
    // Without this a key held while the tab loses focus is never released,
    // and the car drives off on its own when you come back.
    const blur = () => { held.current = {}; pressed.current = {} }

    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", blur)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      window.removeEventListener("blur", blur)
    }
  }, [])

  useFrame(() => {
    if (!vehicleApi || !chassisApi) return
    const controls = held.current

    const engineForce = controls.ShiftLeft ? 275 : 150
    const frontSteering = 0.5
    const backSteering = 0.1

    if (controls.KeyW) {
      vehicleApi.applyEngineForce(-engineForce, 2)
      vehicleApi.applyEngineForce(-engineForce, 3)
    } else if (controls.KeyS) {
      vehicleApi.applyEngineForce(engineForce, 2)
      vehicleApi.applyEngineForce(engineForce, 3)
    } else {
      vehicleApi.applyEngineForce(0, 2)
      vehicleApi.applyEngineForce(0, 3)
    }

    for (let i = 0; i < 4; i++) vehicleApi.setBrake(controls.Space ? 5 : 0, i)

    if (controls.KeyA) {
      vehicleApi.setSteeringValue(frontSteering, 0)
      vehicleApi.setSteeringValue(frontSteering, 1)
      vehicleApi.setSteeringValue(-backSteering, 2)
      vehicleApi.setSteeringValue(-backSteering, 3)
    } else if (controls.KeyD) {
      vehicleApi.setSteeringValue(-frontSteering, 0)
      vehicleApi.setSteeringValue(-frontSteering, 1)
      vehicleApi.setSteeringValue(backSteering, 2)
      vehicleApi.setSteeringValue(backSteering, 3)
    } else {
      for (let i = 0; i < 4; i++) vehicleApi.setSteeringValue(0, i)
    }

    // Edge-triggered from here down -- see `pressed`. Each flag is consumed
    // as it is read, so one press is one impulse however many frames it
    // spans.
    const once = pressed.current
    pressed.current = {}

    if (once.KeyR) {
      chassisApi.position.set(-10, 1, -3)
      chassisApi.velocity.set(0, 0, 0)
      chassisApi.angularVelocity.set(0, 0, 0)
      chassisApi.rotation.set(0, Math.PI / 2, 0)
    }

    if (once.ArrowRight) chassisApi.applyLocalImpulse([-0.6, -6, 0], [-0.6, 0, 0])
    if (once.ArrowDown) chassisApi.applyLocalImpulse([0, -6, -1.4], [0, 0, -1.4])
    if (once.ArrowLeft) chassisApi.applyLocalImpulse([0.6, -6, 0], [0.6, 0, 0])
    if (once.ArrowUp) chassisApi.applyLocalImpulse([0, -6, 1.4], [0, 0, 1.4])
  })
}

/** Re-exported so Car.tsx can keep its own prop types honest without
 *  importing cannon's types twice. */
export type { BoxProps }
