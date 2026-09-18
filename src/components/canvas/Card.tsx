import * as THREE from 'three'
import {  useCallback, useEffect, useRef, useState } from 'react'
import { useFrame, extend, type ThreeEvent, type ThreeElements } from '@react-three/fiber'
import { MeshPortalMaterial, Text} from '@react-three/drei'
import { useRoute, useLocation } from 'wouter'
import { easing, geometry } from 'maath'
import { suspend } from 'suspend-react'
import { LONG_PRESS_MS, LONG_PRESS_SLOP_PX } from '@/helpers/hints'
import { useCoarsePointer } from '@/helpers/useCoarsePointer'
import { useCursorHover } from '@/helpers/useCursorHover'
import { MAGNETIC_RADIUS, MAGNETIC_SNAP_RADIUS, registerMagneticTarget, type MagneticTarget } from '@/helpers/cursor'

/** Portals are the strongest focus target in the scene -- "focus here" rather
 *  than a hotspot's "look here" -- so they reach further and hold harder. */
const PORTAL_MAGNETIC_STRENGTH = 1.35
const PORTAL_MAGNETIC_RADIUS = MAGNETIC_RADIUS * 1.25

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
/** A type alias rather than an interface: an interface cannot `extend` an
 *  indexed-access type like ThreeElements['group']. */
export type FrameProps = {
  /** Matches the `/item/:id` route this portal blends open on. */
  id: string
  name: string
  author: string
  bg?: string
  width?: number
  height?: number
  interactive?: boolean
  /** What entering does, when it is not "open this portal in place".
   *
   *  The island wants the default: push /item/:id, which damps this portal's
   *  blend open and flies the camera the last few units in. /portfolio wants
   *  something else entirely -- each card there IS a project, so entering one
   *  should go to that project's page rather than open a window onto it. */
  onEnter?: () => void
  children?: React.ReactNode
  // `id` is omitted from the group props deliberately: Object3D already has a
  // numeric `id`, and intersecting it with our string one collapses to `never`.
} & Omit<ThreeElements['group'], 'children' | 'id'>

/** drei's own ref type for MeshPortalMaterial. Taken from the component rather
 *  than hand-written: the material carries required props (`resolution`,
 *  `blur`) that a hand-rolled intersection turns into a type error at the JSX
 *  site, which is how the first attempt at this went wrong. */
type PortalMaterial = React.ComponentRef<typeof MeshPortalMaterial>

export default function Frame({ id, name, author, bg = '#f0f0f0', width = WIDTH * 1.5, height = GOLDEN_RATIO * 1.5, interactive = true, onEnter, children, ...props }: FrameProps) {
  const portal = useRef<PortalMaterial>(null)
  const [, setLocation] = useLocation()
  const [, params] = useRoute('/item/:id')
  const [hovered, hover] = useState(false)
  const enter = useCallback((entered: string) => {
    if (onEnter) onEnter()
    else setLocation('/item/' + entered)
  }, [onEnter, setLocation])
  const coarse = useCoarsePointer()
  useCursorHover(hovered, 'project')
  useFrame((state, dt) => {
    if (portal.current) easing.damp(portal.current, 'blend', params?.id === id ? 1 : 0, 0.2, dt)
  })

  // Magnetic target, gated on the same `interactive` flag as the handlers. A
  // portal you can't open must not pull the cursor toward it -- from home,
  // three of these are in shot and none of them are enterable.
  const groupRef = useRef(null)
  const latest = useRef({ interactive, id })
  latest.current = { interactive, id }
  useEffect(() => {
    const node = groupRef.current
    if (!node) return
    const target: MagneticTarget = {
      object: node,
      type: 'project',
      strength: PORTAL_MAGNETIC_STRENGTH,
      radius: PORTAL_MAGNETIC_RADIUS,
      snapRadius: MAGNETIC_SNAP_RADIUS,
      isEnabled: () => latest.current.interactive,
      // Entering is a double-click/long-press gesture, so a single assisted
      // click deliberately does nothing here -- the magnetism helps you aim at
      // the portal, it doesn't lower the bar for entering one.
    }
    return registerMagneticTarget(target)
  }, [])

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
            enter(id)
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
    <group ref={groupRef} {...props}>
      <Text font={(suspend(medium) as { default: string }).default} fontSize={0.3} anchorY="top" anchorX="left" lineHeight={0.8} position={[-0.375, 0.715, 0.01]} material-toneMapped={false}>
        {name}
      </Text>
      <Text font={(suspend(regular) as { default: string }).default} fontSize={0.1} anchorX="right" position={[0.4, -0.659, 0.01]} material-toneMapped={false}>
        /{id}
      </Text>
      <Text font={(suspend(regular) as { default: string }).default} fontSize={0.04} anchorX="right" position={[0.0, -0.677, 0.01]} material-toneMapped={false}>
        {author}
      </Text>
      <mesh
        name={id}
        {...holdHandlers}
        onDoubleClick={interactive ? (e) => (e.stopPropagation(), enter(e.object.name)) : undefined}
        // No hover cursor when it can't be opened -- a pointer over a portal
        // that ignores you is worse than no affordance at all.
        onPointerOver={() => hover(interactive)}
        onPointerOut={() => hover(false)}
      >
        <boxGeometry args={[width, height, 0.1]} />
        {/* blur and resolution restate drei's own runtime defaults (0 and 512).
            They are optional in practice but REQUIRED by PortalProps, which
            Omits them from portalMaterialImpl as required and then re-adds
            them as optional -- an intersection that stays required. Stating
            them changes nothing and satisfies the type. */}
        <MeshPortalMaterial ref={portal} events={params?.id === id} side={THREE.DoubleSide} blur={0} resolution={512}>
          <color attach="background" args={[bg]} />
          {children}
        </MeshPortalMaterial>
      </mesh>
    </group>
  )
}
