// Converts the site's own logo mark (see Icon.tsx's Favicon SVG -- the
// exact same path data is reproduced here) into a set of normalized (0..1)
// points particles can converge onto, so the loading screen's dot field
// resolves into a shape that's actually the site's real logo rather than an
// approximation of it. Pure/no React, so it's a one-time, deterministic
// computation independent of the component lifecycle.

export interface LogoSample {
  x: number
  y: number
}

const LOGO_VIEWBOX = 140 // matches Icon.tsx's viewBox="0 0 140 140"
const ALPHA_THRESHOLD = 128 // out of 255 -- center-of-pixel opacity cutoff
const GRID_STRIDE = 2 // px, at rasterize resolution -- coarse-scan step for finding opaque pixels

function buildTrianglePaths(): Path2D[] {
  return [
    new Path2D("M70 10 L114 35 L70 60 Z"),
    new Path2D("M117 40 L117 96 L70 67 Z"),
    new Path2D("M114 102 L70 128 L70 74 Z"),
    new Path2D("M22 35 L65 10 L64 60 Z"),
  ]
}

// Renders the logo (4 triangles + the <g transform="translate(45,0)
// rotate(30)"> rounded-rect accent group) into an offscreen canvas at
// resolution x resolution px, matching Icon.tsx's path data exactly.
// Filled solid white on transparent so alpha-channel thresholding below
// can't be fooled by anti-aliased partial coverage at shape edges.
function rasterizeLogo(resolution: number): ImageData {
  const canvas = document.createElement("canvas")
  canvas.width = resolution
  canvas.height = resolution
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  const scale = resolution / LOGO_VIEWBOX
  ctx.scale(scale, scale)
  ctx.fillStyle = "#fff"

  for (const path of buildTrianglePaths()) ctx.fill(path)

  // SVG transform="translate(45,0) rotate(30)" applies to a point as
  // T * (R * p) -- rotate first, then translate -- which is exactly what
  // ctx.translate() followed by ctx.rotate() reproduces for subsequent
  // draws (canvas transforms post-multiply the CTM in call order).
  ctx.save()
  ctx.translate(45, 0)
  ctx.rotate((30 * Math.PI) / 180)
  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    const p = new Path2D()
    p.roundRect(x, y, w, h, r)
    ctx.fill(p)
  }
  roundRect(8, 58, 42, 6, 4)
  roundRect(21, 73, 35, 6, 4)
  roundRect(27, 88, 42, 6, 4)
  ctx.restore()

  return ctx.getImageData(0, 0, resolution, resolution)
}

// Samples opaque pixels from the rasterized logo into a roughly even point
// cloud. A fixed-stride grid scan (not "every opaque pixel", which at
// resolution=256 would be tens of thousands of points, and not pure random
// rejection sampling, which clumps/leaves gaps at low counts) collects
// candidate coordinates, then an evenly-spaced walk subsamples down/up to
// exactly `count` points -- deterministic for a given `count` so repeated
// calls (or reduced-motion's single static draw) always produce the same
// layout.
export function sampleLogoPoints(count: number, resolution = 256): LogoSample[] {
  const { data, width, height } = rasterizeLogo(resolution)
  const isOpaque = (px: number, py: number) => data[(py * width + px) * 4 + 3] >= ALPHA_THRESHOLD

  const opaqueCoords: [number, number][] = []
  for (let y = 0; y < height; y += GRID_STRIDE) {
    for (let x = 0; x < width; x += GRID_STRIDE) {
      if (isOpaque(x, y)) opaqueCoords.push([x, y])
    }
  }
  if (opaqueCoords.length === 0) return []

  const points: LogoSample[] = []
  const step = opaqueCoords.length / count
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(i * step) % opaqueCoords.length
    const [px, py] = opaqueCoords[idx]
    // Jitter within +/- GRID_STRIDE px so samples landing on the same
    // coarse coordinate (count > opaqueCoords.length) don't stack exactly.
    const jx = px + (Math.random() - 0.5) * GRID_STRIDE
    const jy = py + (Math.random() - 0.5) * GRID_STRIDE
    points.push({ x: jx / width, y: jy / height })
  }
  return points
}
