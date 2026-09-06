import * as THREE from 'three'
import {  useCallback, useEffect, useRef, useState } from 'react'
import { useFrame, extend, type ThreeEvent } from '@react-three/fiber'
import { useCursor, MeshPortalMaterial, Text} from '@react-three/drei'
import { useRoute, useLocation } from 'wouter'
import { easing, geometry } from 'maath'
import { suspend } from 'suspend-react'
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX } from '@/helpers/hints'
import { useCoarsePointer } from '@/helpers/useCoarsePointer'

extend({ RoundedPlaneGeometry: geometry.RoundedPlaneGeometry })
const regular = import('@pmndrs/assets/fonts/inter_regular.woff')
const medium = import('@pmndrs/assets/fonts/inter_medium.woff')
const GOLDEN_RATIO = 1.61803398875
const WIDTH = 1

// `interactive` gates whether this portal can be opened at all. Defaults true,
// so app/portfolio -- where every frame is meant to be reachable from one
// standing position -- is unaffected. The island passes false for portals the
// camera hasn't travelled to: they stay permanently visible in the scene, but
// entering one has to go through its hotspot, or you arrive inside a portal
// the app still believes you're nowhere near.
export default function Frame({ id, name, author, bg = '#f0f0f0', width = WIDTH * 1.5, height = GOLDEN_RATIO * 1.5, interactive = true, children, ...props }) {
  const portal = useRef()
  const [, setLocation] = useLocation()
  const [, params] = useRoute('/item/:id')
  const [hovered, hover] = useState(false)
  const coarse = useCoarsePointer()
  useCursor(hovered)
  useFrame((state, dt) => easing.damp(portal.current, 'blend', params?.id === id ? 1 : 0, 0.2, dt))

  // Touch entry. `dblclick` is what onDoubleClick listens for, and touch
  // browsers fire it inconsistently -- iOS Safari in particular spends
  // double-taps on its own zoom gesture -- so a portal that opens only on a
  // double-click is effectively unopenable on a phone. A press-and-hold is
  // unambiguous there and doesn't collide with anything else in the scene
  // (nothing here drags). Mouse users keep the double-click untouched.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdOrigin = useRef({ x: 0, y: 0 })
  const cancelHold = useCallback(() => {
    if (holdTimer.current === null) return
    clearTimeout(holdTimer.current)
    holdTimer.current = null
  }, [])
  useEffect(() => cancelHold, [cancelHold])

  const holdHandlers = coarse && interactive
    ? {
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          // Already inside this portal -- a hold in there is aimed at whatever
          // the interior is showing, not at re-entering.
          if (params?.id === id) return
          e.stopPropagation()
          cancelHold()
          holdOrigin.current = { x: e.clientX, y: e.clientY }
          holdTimer.current = setTimeout(() => {
            holdTimer.current = null
            setLocation('/item/' + id)
          }, LONG_PRESS_MS)
        },
        // A finger that travels is a drag, not a press. Without this the
        // portal would open under anyone who happened to rest a thumb on it
        // while moving.
        onPointerMove: (e: ThreeEvent<PointerEvent>) => {
          if (holdTimer.current === null) return
          const drift = Math.hypot(e.clientX - holdOrigin.current.x, e.clientY - holdOrigin.current.y)
          if (drift > LONG_PRESS_SLOP_PX) cancelHold()
        },
        onPointerUp: cancelHold,
        onPointerCancel: cancelHold,
        onPointerLeave: cancelHold,
      }
    : {}

  return (
    <group {...props}>
      <Text font={suspend(medium).default} fontSize={0.3} anchorY="top" anchorX="left" lineHeight={0.8} position={[-0.375, 0.715, 0.01]} material-toneMapped={false}>
        {name}
      </Text>
      <Text font={suspend(regular).default} fontSize={0.1} anchorX="right" position={[0.4, -0.659, 0.01]} material-toneMapped={false}>
        /{id}
      </Text>
      <Text font={suspend(regular).default} fontSize={0.04} anchorX="right" position={[0.0, -0.677, 0.01]} material-toneMapped={false}>
        {author}
      </Text>
      <mesh
        name={id}
        {...holdHandlers}
        onDoubleClick={interactive ? (e) => (e.stopPropagation(), setLocation('/item/' + e.object.name)) : undefined}
        // No hover cursor when it can't be opened -- a pointer over a portal
        // that ignores you is worse than no affordance at all.
        onPointerOver={() => hover(interactive)}
        onPointerOut={() => hover(false)}
      >
        <boxGeometry args={[width, height, 0.1]} />
        <MeshPortalMaterial ref={portal} events={params?.id === id} side={THREE.DoubleSide}>
          <color attach="background" args={[bg]} />
          {children}
        </MeshPortalMaterial>
      </mesh>
    </group>
  )
}
