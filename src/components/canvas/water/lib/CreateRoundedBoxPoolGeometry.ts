import * as THREE from 'three'

const MIN_STRAIGHT_POOL_EDGE = 0.0

// Ported verbatim from water/src/rendering/CreateRoundedBoxPoolGeometry.ts.
// Builds a stadium-shaped floor (triangle-fan from center) + extruded walls
// with inward-pointing normals. Bakes exact dimensions into vertex
// positions, so must be regenerated (old geometry disposed) whenever R/
// poolWidth/poolHeight/poolLength change -- it's not a stable memoized
// geometry like the box pool's.
export function createRoundedBoxPoolGeometry(
  R: number,
  poolWidth: number,
  poolHeight: number,
  poolLength: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  const cornerRadius = Math.min(R, Math.max(0, Math.min(poolWidth, poolLength) - MIN_STRAIGHT_POOL_EDGE))

  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  const yFloor = -poolHeight
  const yRim = 2.0 / 12.0
  const rSubX = poolWidth - cornerRadius
  const rSubZ = poolLength - cornerRadius

  const segmentsPerCorner = 16
  const totalPoints = 4 * segmentsPerCorner

  const floorVertices: THREE.Vector3[] = []

  for (let c = 0; c < 4; c++) {
    let cx = 0,
      cz = 0
    let startAngle = 0
    if (c === 0) {
      cx = rSubX
      cz = rSubZ
      startAngle = 0
    } else if (c === 1) {
      cx = -rSubX
      cz = rSubZ
      startAngle = Math.PI / 2
    } else if (c === 2) {
      cx = -rSubX
      cz = -rSubZ
      startAngle = Math.PI
    } else {
      cx = rSubX
      cz = -rSubZ
      startAngle = 1.5 * Math.PI
    }

    for (let i = 0; i < segmentsPerCorner; i++) {
      const angle = startAngle + (i / segmentsPerCorner) * (Math.PI / 2)
      const x = cx + cornerRadius * Math.cos(angle)
      const z = cz + cornerRadius * Math.sin(angle)
      floorVertices.push(new THREE.Vector3(x, yFloor, z))
    }
  }

  positions.push(0, yFloor, 0)
  normals.push(0, 1, 0)

  for (let i = 0; i < totalPoints; i++) {
    const v = floorVertices[i]
    positions.push(v.x, v.y, v.z)
    normals.push(0, 1, 0)
  }

  for (let i = 0; i < totalPoints; i++) {
    const next = (i + 1) % totalPoints
    indices.push(0, next + 1, i + 1)
  }

  const wallNormals: THREE.Vector3[] = []
  for (let i = 0; i < totalPoints; i++) {
    const v = floorVertices[i]
    const normal = new THREE.Vector3()
    if (cornerRadius > 0) {
      const cx = Math.sign(v.x) * rSubX
      const cz = Math.sign(v.z) * rSubZ
      normal.set(v.x - cx, 0, v.z - cz).normalize().negate()
    } else {
      if (Math.abs(v.x) >= poolWidth - 0.001) {
        normal.set(-Math.sign(v.x), 0, 0)
      } else {
        normal.set(0, 0, -Math.sign(v.z))
      }
    }
    wallNormals.push(normal)
  }

  const wallStartIndex = positions.length / 3

  for (let i = 0; i < totalPoints; i++) {
    const v = floorVertices[i]
    const n = wallNormals[i]

    positions.push(v.x, yFloor, v.z)
    normals.push(n.x, n.y, n.z)

    positions.push(v.x, yRim, v.z)
    normals.push(n.x, n.y, n.z)
  }

  for (let i = 0; i < totalPoints; i++) {
    const next = (i + 1) % totalPoints

    const bCurr = wallStartIndex + 2 * i
    const tCurr = wallStartIndex + 2 * i + 1
    const bNext = wallStartIndex + 2 * next
    const tNext = wallStartIndex + 2 * next + 1

    indices.push(bCurr, bNext, tNext)
    indices.push(bCurr, tNext, tCurr)
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)

  return geometry
}
