"use client"

import { useBox } from "@react-three/cannon"

/** An invisible static box. The track model has no collision of its own, so
 *  every tree, arch, hut and sign it draws is given one of these by hand --
 *  the coordinates below come from the original project and were placed
 *  against that model. */
export function ColliderBox({
  position,
  scale = [0.25, 4, 0.25],
  rotation,
}: {
  position: [number, number, number]
  scale?: [number, number, number]
  rotation?: [number, number, number]
}) {
  useBox(() => ({ args: scale, position, rotation, type: "Static" }))
  return null
}
