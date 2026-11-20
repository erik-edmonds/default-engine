import * as THREE from "three"

/** A scene to reconstruct, rendered here so its true camera poses are known.
 *
 *  WHY SYNTHETIC AT ALL. Structure from motion can only be scored against
 *  something. A phone video gives you a reconstruction and no way to say
 *  whether it is right; rendering the input means the true pose of every frame
 *  is recorded, so the demo can draw the estimate against the truth and print
 *  the error. That is the same separation `sim/truth.py` insists on for the
 *  lidar pipeline, and for the same reason -- the answer is kept beside the
 *  question, never inside it. The pipeline downstream sees PIXELS ONLY. It is
 *  never handed a pose, a depth or a 3D point.
 *
 *  WHY IT LOOKS LIKE THIS. ORB finds corners, and a smooth flat-shaded model
 *  has almost none -- pointing this at phone.glb produces a handful of
 *  keypoints along one chamfer and no reconstruction at all. So the scene is
 *  built out of high-frequency procedural texture on boxes at genuinely
 *  different depths: corners everywhere, and real parallax between near and
 *  far as the camera moves.
 *
 *  EVERYTHING IS DETERMINISTIC. A seeded PRNG, never Math.random. Two reasons,
 *  both of which this codebase states elsewhere: the React Compiler is on and
 *  rejects impure render, and a scene that differs between loads is one no
 *  screenshot or probe can pin down.
 */

/** Mulberry32. Small, fast, and good enough for scattering boxes. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A texture made of corners.
 *
 *  Not noise: pure noise gives ORB thousands of unstable keypoints that match
 *  each other badly, which looks busy and reconstructs poorly. Hard-edged
 *  shapes at mixed scales give FEWER and far more repeatable corners, which is
 *  what the matcher actually wants.
 */
function cornerTexture(seed: number, size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d context for the synthetic texture")
  const rand = prng(seed)

  ctx.fillStyle = "#101820"
  ctx.fillRect(0, 0, size, size)

  const palette = ["#e8e3d8", "#d98f5a", "#6fa8ff", "#7fd4c1", "#c2708f", "#d9c23f"]
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)]
    const w = 12 + rand() * 90
    const h = 12 + rand() * 90
    ctx.fillRect(rand() * (size - w), rand() * (size - h), w, h)
  }
  // A grid over the top. Regular structure gives the matcher something with
  // unambiguous local geometry, and the offset keeps it from being perfectly
  // self-similar (which would make every corner look like every other).
  ctx.strokeStyle = "rgba(255,255,255,0.5)"
  ctx.lineWidth = 2
  for (let i = 0; i < 9; i++) {
    const p = (i / 9) * size + (rand() - 0.5) * 10
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export interface TruePose {
  /** World position of the camera. */
  position: THREE.Vector3
  /** World rotation, as the renderer used it. */
  quaternion: THREE.Quaternion
}

export interface Frame {
  index: number
  width: number
  height: number
  /** RGBA, ready to transfer to the worker. */
  pixels: ImageData
  /** Kept OUT of everything the pipeline can see. Scoring only. */
  truth: TruePose
}

export interface SyntheticSequence {
  frames: Frame[]
  /** Pinhole intrinsics the renderer actually used, which the pipeline IS
   *  allowed: a calibrated camera is a normal assumption, an unknown pose is
   *  not. */
  intrinsics: { fx: number; fy: number; cx: number; cy: number }
  dispose(): void
}

/** Build the scene, fly the camera around it, and hand back the frames.
 *
 *  Rendered once up front rather than streamed: the frames at 640x480 are a
 *  few tens of MB of RGBA held briefly, the whole thing takes well under a
 *  second, and having the sequence in hand means the demo can be scrubbed,
 *  replayed and stepped without re-rendering anything.
 *
 *  TWENTY-FOUR FRAMES, NOT FORTY-EIGHT, and the reason is visual as much as
 *  numerical. Across the same arc, half as many frames means twice the camera
 *  motion between neighbours. At 48 the match lines drawn between consecutive
 *  frames were one or two pixels long -- invisible under the keypoint markers
 *  sitting on top of them, so the pane claimed to show matches and showed
 *  none. The longer baseline also triangulates better: a pair a pixel apart
 *  puts its points somewhere very uncertain along the ray.
 */
export function renderSyntheticSequence(count = 24, width = 640, height = 480): SyntheticSequence {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  renderer.setClearColor("#0b0f14", 1)

  const scene = new THREE.Scene()
  const disposables: { dispose(): void }[] = []
  const rand = prng(20261118)

  // A loose cluster of boxes spread through depth. The spread in z is what
  // produces parallax; without it every point moves together and the
  // reconstruction is degenerate no matter how good the matching is.
  for (let i = 0; i < 26; i++) {
    const texture = cornerTexture(1000 + i, 256)
    const material = new THREE.MeshBasicMaterial({ map: texture })
    const s = 0.35 + rand() * 0.9
    const geometry = new THREE.BoxGeometry(s, s, s)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set((rand() - 0.5) * 4.6, (rand() - 0.5) * 2.8, (rand() - 0.5) * 4.6)
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
    scene.add(mesh)
    disposables.push(texture, material, geometry)
  }

  // A back wall and a floor, so there is far structure as well as near.
  for (const [pos, rot, size, seed] of [
    [new THREE.Vector3(0, 0, -3.6), new THREE.Euler(0, 0, 0), 11, 7001],
    [new THREE.Vector3(0, -2.2, 0), new THREE.Euler(-Math.PI / 2, 0, 0), 11, 7002],
  ] as const) {
    const texture = cornerTexture(seed, 512)
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    const geometry = new THREE.PlaneGeometry(size, size)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.copy(pos)
    mesh.rotation.copy(rot)
    scene.add(mesh)
    disposables.push(texture, material, geometry)
  }

  // MeshBasicMaterial throughout, so no lights: shading that changes with the
  // camera would change a patch's appearance between views, which is exactly
  // what a descriptor is trying to be invariant to. Unlit texture keeps the
  // demo about geometry rather than about photometric robustness.

  const fov = 50
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100)

  // An arc, not a full orbit, and it TRANSLATES. A camera that only rotates
  // has no baseline and triangulates nothing -- the single most common way a
  // real capture fails, and the demo's own guard checks for it later.
  const radius = 6.2
  const sweep = Math.PI * 0.55

  const capture = document.createElement("canvas")
  capture.width = width
  capture.height = height
  const ctx = capture.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("no 2d context for frame capture")

  const frames: Frame[] = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1)
    const angle = -sweep / 2 + sweep * t
    camera.position.set(Math.sin(angle) * radius, 0.5 + Math.sin(t * Math.PI) * 0.5, Math.cos(angle) * radius)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    renderer.render(scene, camera)

    // WebGL's framebuffer is bottom-up and a 2D canvas is top-down, so this
    // draw is also the flip. Reading with gl.readPixels instead would hand
    // back an upside-down image and every recovered pose would be mirrored.
    ctx.drawImage(renderer.domElement, 0, 0)

    frames.push({
      index: i,
      width,
      height,
      pixels: ctx.getImageData(0, 0, width, height),
      truth: { position: camera.position.clone(), quaternion: camera.quaternion.clone() },
    })
  }

  // The intrinsics three actually rendered with, derived from the same fov.
  const fy = height / 2 / Math.tan((fov * Math.PI) / 180 / 2)
  const intrinsics = { fx: fy, fy, cx: width / 2, cy: height / 2 }

  return {
    frames,
    intrinsics,
    dispose() {
      for (const d of disposables) d.dispose()
      renderer.dispose()
    },
  }
}
