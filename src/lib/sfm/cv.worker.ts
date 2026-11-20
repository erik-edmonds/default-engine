/** OpenCV, off the main thread.
 *
 *  THE SECOND WORKER IN THIS REPO. src/lib/copc/decode.worker.ts is the first
 *  and its header is addressed to whoever wrote this one; both of its notes
 *  apply, plus two that are specific to OpenCV.
 *
 *  1. A CLASSIC WORKER, NOT A MODULE ONE. The decoder is
 *     `{ type: "module" }`, because it imports laz-perf from node_modules.
 *     This cannot be: `@techstark/opencv-js` is a single 10.87 MB Emscripten
 *     bundle with the WebAssembly embedded, and putting that through the
 *     bundler means Turbopack parsing and re-emitting eleven megabytes on
 *     every build to produce something already final. `importScripts` of a
 *     static file under public/wasm/ skips all of it. The cost is that this
 *     file cannot use ESM imports, so every type it needs is declared inline
 *     below.
 *
 *  2. NO locateFile, UNLIKE THE DECODER. That build splits .js from .wasm and
 *     has to be told where the binary is, which under Turbopack is a hashed
 *     path that does not exist. This build has nothing separate to find.
 *
 *  3. There is still no `/// <reference lib="webworker" />`, for the reason
 *     the decoder gives: alongside tsconfig's "dom" lib it produces a wall of
 *     duplicate-identifier errors, and `next build` type-checks for real.
 *     The minimal interface below plus one cast is the whole workaround.
 *
 *  4. EVERY Mat, KeyPointVector AND DMatchVector IS DELETED IN A `finally`.
 *     The Emscripten heap is not garbage collected. The decoder makes the
 *     same point about malloc/free; here the objects are C++ ones with an
 *     explicit `.delete()`, and a throw partway through a frame leaks
 *     megabytes per failure otherwise.
 */

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(type: "message", fn: (event: MessageEvent) => void): void
  importScripts(...urls: string[]): void
  cv?: CvModule
}
const ctx = globalThis as unknown as WorkerScope

// ---------------------------------------------------------------------------
// The slice of OpenCV this worker touches.
//
// Hand-declared rather than imported from @techstark/opencv-js. The package's
// own types are fine, but importing them would mean importing the package,
// which is the eleven megabytes point 1 exists to avoid -- `import type`
// would be erased, but the module specifier still has to resolve and a stray
// value import is one careless edit away. Declaring the surface keeps the
// worker honest about exactly what it uses.
// ---------------------------------------------------------------------------

interface CvMat {
  delete(): void
  rows: number
  cols: number
  /** The 8-bit view, and it is called `data` -- there is NO `data8U`.
   *
   *  Checked against the shipped bundle rather than guessed: it defines
   *  `data`, `data8S`, `data16U`, `data16S`, `data32S`, `data32F` and
   *  `data64F`, and nothing else. Reading `.data8U` returns undefined and
   *  fails on the next property access with a bare "Cannot read properties
   *  of undefined", which says nothing about which property. */
  data: Uint8Array
  data32F: Float32Array
  data32S: Int32Array
  data64F: Float64Array
}
interface CvKeyPoint {
  pt: { x: number; y: number }
  size: number
  angle: number
  response: number
}
interface CvVector<T> {
  size(): number
  get(i: number): T
  delete(): void
}
interface CvDMatch {
  queryIdx: number
  trainIdx: number
  distance: number
}
interface CvOrb {
  detectAndCompute(image: CvMat, mask: CvMat, keypoints: CvVector<CvKeyPoint>, descriptors: CvMat): void
  delete(): void
}
interface CvMatcher {
  knnMatch(a: CvMat, b: CvMat, matches: CvVector<CvVector<CvDMatch>>, k: number): void
  delete(): void
}
interface CvMatConstructor {
  new (rows?: number, cols?: number, type?: number): CvMat
}
interface CvSize { delete?(): void }
interface CvTermCriteria { delete?(): void }
interface CvModule {
  onRuntimeInitialized?: () => void
  Mat: CvMatConstructor
  matFromArray(rows: number, cols: number, type: number, data: ArrayLike<number>): CvMat
  CV_8U: number
  CV_32F: number
  CV_64F: number
  solvePnPRansac(
    objectPoints: CvMat,
    imagePoints: CvMat,
    cameraMatrix: CvMat,
    distCoeffs: CvMat,
    rvec: CvMat,
    tvec: CvMat,
    useExtrinsicGuess: boolean,
    iterationsCount: number,
    reprojectionError: number,
    confidence: number,
    inliers: CvMat,
    flags: number,
  ): boolean
  Rodrigues(src: CvMat, dst: CvMat): void
  SOLVEPNP_ITERATIVE: number
  goodFeaturesToTrack(
    image: CvMat, corners: CvMat, maxCorners: number,
    qualityLevel: number, minDistance: number, mask?: CvMat, blockSize?: number,
  ): void
  calcOpticalFlowPyrLK(
    prevImg: CvMat, nextImg: CvMat, prevPts: CvMat, nextPts: CvMat,
    status: CvMat, err: CvMat, winSize: CvSize, maxLevel: number, criteria: CvTermCriteria,
  ): void
  Size: new (w: number, h: number) => CvSize
  TermCriteria: new (type: number, maxCount: number, epsilon: number) => CvTermCriteria
  /** Named TermCriteria_COUNT / TermCriteria_EPS in this build, NOT the
   *  TERM_CRITERIA_* spelling the Python and C++ docs use. Checked against the
   *  shipped binary; the doc spelling is `undefined`, and `undefined |
   *  undefined` is 0, which is a termination type meaning "never". */
  TermCriteria_COUNT: number
  TermCriteria_EPS: number
  CV_8UC1: number
  CV_32FC2: number
  circle?: unknown
  matFromImageData(data: { data: Uint8ClampedArray; width: number; height: number }): CvMat
  /** A bound C++ class, so it MUST be `new`ed. Calling `cv.ORB(n)` throws
   *  `BindingError: Use 'new' to construct ORB` -- embind rejects it rather
   *  than silently returning something unusable. */
  ORB: new (nfeatures?: number) => CvOrb
  BFMatcher: new (normType?: number, crossCheck?: boolean) => CvMatcher
  KeyPointVector: new () => CvVector<CvKeyPoint>
  DMatchVectorVector: new () => CvVector<CvVector<CvDMatch>>
  cvtColor(src: CvMat, dst: CvMat, code: number): void
  COLOR_RGBA2GRAY: number
  NORM_HAMMING: number
  getBuildInformation?: () => string
}

/** One instance for the life of the worker, exactly as the decoder memoises
 *  its laz-perf module: Emscripten runtimes are expensive to stand up and
 *  entirely reusable.
 *
 *  THE BOX AROUND THE MODULE IS LOAD-BEARING. Do not "simplify" it to
 *  `Promise<CvModule>`.
 *
 *  An Emscripten module is THENABLE -- this build's `cv` object carries its
 *  own `.then`, which is how `await cv` is meant to work. That makes
 *  `resolve(cv)` a trap: the Promise resolution procedure never fulfils with a
 *  thenable, it ADOPTS it, calling `cv.then(resolve, reject)` and waiting for
 *  that to settle. It does not settle, so the promise stays pending forever.
 *
 *  Measured, because it cost a build to find: `onRuntimeInitialized` fired,
 *  the worker logged it, and `await getCv()` on the main thread never
 *  returned. The page sat on "loading OpenCV…" indefinitely with no error
 *  anywhere -- no rejection, no console warning, nothing to grep for.
 *
 *  Boxing it is not enough on its own, either: `cvReady.then(box => box.cv)`
 *  RETURNS the thenable from a then-callback, which adopts it exactly the
 *  same way. One level up, same hang. The module has to stop being thenable.
 *
 *  So `.then` is deleted once the runtime is up. It exists only so that
 *  `await cv` can work as a readiness hook; after readiness it is a loaded
 *  gun, because every promise that ever touches this object will try to adopt
 *  it. Deleting it is the one edit that makes the module safe to pass around,
 *  and the box above then costs nothing to keep as a second guard.
 */
/** Make the module safe to put inside a promise. See the note above. */
function disarm(cv: CvModule): void {
  delete (cv as unknown as { then?: unknown }).then
}

let cvReady: Promise<{ cv: CvModule }> | undefined

function getCv(): Promise<CvModule> {
  if (!cvReady) {
    cvReady = new Promise<{ cv: CvModule }>((resolve, reject) => {
      try {
        // Served from our own origin, never a CDN -- the policy
        // scripts/compress-model.mjs states and app/not-found.tsx is the
        // precedent for. scripts/sync-opencv.mjs puts the file here.
        //
        // The file is a UMD bundle whose worker branch does `root.cv =
        // factory()`, so after this returns the module is on `self.cv`.
        ctx.importScripts("/wasm/opencv.js")
      } catch (error) {
        reject(new Error(`could not load /wasm/opencv.js: ${String(error)}`))
        return
      }
      const cv = ctx.cv
      if (!cv) {
        reject(new Error("/wasm/opencv.js loaded but defined no `cv`"))
        return
      }
      // Already up: possible if a second caller races in after the runtime
      // has initialised. `Mat` is the cheapest proof the bindings are bound.
      if (typeof (cv as unknown as { Mat?: unknown }).Mat === "function") {
        disarm(cv)
        resolve({ cv })
        return
      }
      cv.onRuntimeInitialized = () => {
        if (typeof (cv as unknown as { Mat?: unknown }).Mat !== "function") {
          reject(new Error("OpenCV reported ready but bound no Mat"))
          return
        }
        disarm(cv)
        resolve({ cv })
      }
    })
  }
  return cvReady.then((box) => box.cv)
}

export interface CvRequest {
  id: number
  kind: "ping" | "features" | "match" | "pnp" | "kltSeed" | "kltStep"
  /** RGBA pixels, transferred in. */
  width?: number
  height?: number
  pixels?: ArrayBuffer
  /** Cap on ORB keypoints. */
  maxFeatures?: number
  /** "match": two descriptor blocks, each `rows * cols` bytes. */
  descriptorsA?: ArrayBuffer
  descriptorsB?: ArrayBuffer
  rowsA?: number
  rowsB?: number
  cols?: number
  /** Lowe's ratio. Below this, the best match is accepted. */
  ratio?: number
  /** "pnp": flat xyz triples and their matching xy pairs, plus intrinsics. */
  objectPoints?: Float64Array
  imagePoints?: Float64Array
  k?: { fx: number; fy: number; cx: number; cy: number }
  /** kltSeed: how many corners to look for, and how far apart. */
  maxCorners?: number
  minDistance?: number
  /** kltSeed: keep the points already being tracked and top up around them. */
  keep?: boolean
}

export interface CvResponse {
  id: number
  error?: string
  /** "ping" */
  build?: string
  /** "features": x, y interleaved. */
  points?: Float32Array
  /** "features": one row per keypoint, 32 bytes of ORB descriptor each. */
  descriptors?: Uint8Array
  descriptorCols?: number
  count?: number
  ms?: number
  /** "match": index pairs into A and B, interleaved [a0,b0,a1,b1,...]. */
  pairs?: Int32Array
  /** How many knn candidates existed before the ratio test threw them out --
   *  the denominator for "how selective was this". */
  proposed?: number
  /** klt: surviving point positions, x and y interleaved. */
  tracked?: Float32Array
  /** klt: a stable id per surviving point, parallel to `tracked`. */
  ids?: Int32Array
  /** klt: how many were being tracked before this step. */
  before?: number
  /** "pnp": row-major 3x3 rotation and the translation, world -> camera. */
  R?: Float64Array
  t?: Float64Array
  /** Indices of the object points RANSAC kept. */
  pnpInliers?: Int32Array
}

async function features(req: CvRequest): Promise<CvResponse> {
  const cv = await getCv()
  const started = Date.now()

  let rgba: CvMat | undefined
  let gray: CvMat | undefined
  let orb: CvOrb | undefined
  let keypoints: CvVector<CvKeyPoint> | undefined
  let descriptors: CvMat | undefined
  /** detectAndCompute wants a mask; an empty Mat means "all of it". It is a
   *  named local rather than an inline `new cv.Mat()` because an inline one
   *  has no handle to delete, and that is a leak on the Emscripten heap on
   *  every single frame. */
  let mask: CvMat | undefined
  try {
    rgba = cv.matFromImageData({
      data: new Uint8ClampedArray(req.pixels as ArrayBuffer),
      width: req.width as number,
      height: req.height as number,
    })
    gray = new cv.Mat()
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY)

    orb = new cv.ORB(req.maxFeatures ?? 1200)
    keypoints = new cv.KeyPointVector()
    descriptors = new cv.Mat()
    mask = new cv.Mat()
    orb.detectAndCompute(gray, mask, keypoints, descriptors)

    const n = keypoints.size()
    const points = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      const kp = keypoints.get(i)
      points[i * 2] = kp.pt.x
      points[i * 2 + 1] = kp.pt.y
    }
    // Copied out of the Emscripten heap before anything is deleted: data8U is
    // a view ONTO that heap, and handing it back would be a dangling view the
    // moment `descriptors.delete()` runs below.
    const cols = descriptors.cols
    // ORB gives 32 bytes a keypoint, so `rows` should equal `n`. Trust the
    // Mat rather than the vector: if ORB dropped a keypoint for want of a
    // full patch near the border, this is the one that is right.
    const rows = descriptors.rows
    const desc = new Uint8Array(descriptors.data.slice(0, rows * cols))

    return {
      id: req.id,
      points,
      descriptors: desc,
      descriptorCols: cols,
      count: Math.min(n, rows),
      ms: Date.now() - started,
    }
  } finally {
    rgba?.delete()
    gray?.delete()
    mask?.delete()
    orb?.delete()
    keypoints?.delete()
    descriptors?.delete()
  }
}

/** Brute-force Hamming matching, with Lowe's ratio test.
 *
 *  CROSS-CHECK IS OFF, DELIBERATELY, because it and the ratio test are two
 *  answers to the same question and they do not compose: cross-check keeps
 *  only mutual best matches, and knnMatch with k=2 then has nothing to compare
 *  against. The ratio test is the stronger filter -- it rejects a match whose
 *  best and second-best candidates are similarly close, which is exactly the
 *  repeated-texture case that produces confident, wrong correspondences.
 */
async function match(req: CvRequest): Promise<CvResponse> {
  const cv = await getCv()
  const started = Date.now()

  const cols = req.cols ?? 32
  const rowsA = req.rowsA ?? 0
  const rowsB = req.rowsB ?? 0

  let A: CvMat | undefined
  let B: CvMat | undefined
  let matcher: CvMatcher | undefined
  let knn: CvVector<CvVector<CvDMatch>> | undefined
  try {
    if (rowsA < 2 || rowsB < 2) return { id: req.id, pairs: new Int32Array(0), proposed: 0, ms: 0 }

    A = cv.matFromArray(rowsA, cols, cv.CV_8U, new Uint8Array(req.descriptorsA as ArrayBuffer))
    B = cv.matFromArray(rowsB, cols, cv.CV_8U, new Uint8Array(req.descriptorsB as ArrayBuffer))

    matcher = new cv.BFMatcher(cv.NORM_HAMMING, false)
    knn = new cv.DMatchVectorVector()
    matcher.knnMatch(A, B, knn, 2)

    const ratio = req.ratio ?? 0.75
    const out: number[] = []
    const n = knn.size()
    for (let i = 0; i < n; i++) {
      const pair = knn.get(i)
      if (pair.size() < 2) { pair.delete(); continue }
      const best = pair.get(0)
      const second = pair.get(1)
      if (best.distance < ratio * second.distance) out.push(best.queryIdx, best.trainIdx)
      // Each inner vector is its own C++ object on the Emscripten heap.
      pair.delete()
    }
    return { id: req.id, pairs: Int32Array.from(out), proposed: n, ms: Date.now() - started }
  } finally {
    A?.delete()
    B?.delete()
    matcher?.delete()
    knn?.delete()
  }
}

/** Resection: where was the camera, given points whose 3D position is known.
 *
 *  OPENCV'S, NOT OURS. `solvePnPRansac` IS in the build -- unlike the
 *  essential-matrix family -- and there is no reason to reimplement a solver
 *  that ships. geometry.ts covers only what is genuinely missing.
 *
 *  This is what makes the reconstruction INCREMENTAL rather than a sequence of
 *  unrelated two-view solves: every frame after the bootstrap pair is placed
 *  against the cloud that already exists, so one scale and one coordinate
 *  frame carry through the whole sequence.
 */
async function pnp(req: CvRequest): Promise<CvResponse> {
  const cv = await getCv()
  const started = Date.now()
  const k = req.k as { fx: number; fy: number; cx: number; cy: number }
  const obj = req.objectPoints as Float64Array
  const img = req.imagePoints as Float64Array
  const n = obj.length / 3

  let objMat: CvMat | undefined
  let imgMat: CvMat | undefined
  let K: CvMat | undefined
  let dist: CvMat | undefined
  let rvec: CvMat | undefined
  let tvec: CvMat | undefined
  let inliers: CvMat | undefined
  let R: CvMat | undefined
  try {
    if (n < 6) return { id: req.id, ms: 0 }

    objMat = cv.matFromArray(n, 3, cv.CV_64F, obj)
    imgMat = cv.matFromArray(n, 2, cv.CV_64F, img)
    K = cv.matFromArray(3, 3, cv.CV_64F, [k.fx, 0, k.cx, 0, k.fy, k.cy, 0, 0, 1])
    // Rendered frames are a perfect pinhole, and a webcam's distortion is not
    // something this demo tries to estimate. Zeros, explicitly.
    dist = cv.matFromArray(1, 5, cv.CV_64F, [0, 0, 0, 0, 0])
    rvec = new cv.Mat()
    tvec = new cv.Mat()
    inliers = new cv.Mat()

    const ok = cv.solvePnPRansac(
      objMat, imgMat, K, dist, rvec, tvec,
      false, 200, 4, 0.99, inliers, cv.SOLVEPNP_ITERATIVE,
    )
    if (!ok) return { id: req.id, ms: Date.now() - started }

    // rvec is an axis-angle vector; Rodrigues turns it into the matrix.
    R = new cv.Mat()
    cv.Rodrigues(rvec, R)

    const keep = new Int32Array(inliers.rows)
    for (let i = 0; i < inliers.rows; i++) keep[i] = inliers.data32S ? inliers.data32S[i] : i

    return {
      id: req.id,
      R: Float64Array.from(R.data64F.slice(0, 9)),
      t: Float64Array.from(tvec.data64F.slice(0, 3)),
      pnpInliers: keep,
      ms: Date.now() - started,
    }
  } finally {
    objMat?.delete(); imgMat?.delete(); K?.delete(); dist?.delete()
    rvec?.delete(); tvec?.delete(); inliers?.delete(); R?.delete()
  }
}

// ---------------------------------------------------------------------------
// SPARSE OPTICAL FLOW, WHICH IS WHAT MAKES THE LIVE PATH POSSIBLE AT ALL.
//
// The rendered path runs ORB and brute-force matching on every frame, and at
// roughly 50 ms a frame that is fine for 24 frames and hopeless for a camera.
// Sequential video does not need matching: consecutive frames are nearly the
// same picture, so a corner can be FOLLOWED rather than described and looked
// up. Shi-Tomasi corners plus Lucas-Kanade is the classical answer and is what
// every real-time SLAM front end has used for thirty years.
//
// It also hands the bootstrap its correspondences for free. A point still
// being tracked in frame N is, by construction, the same world point that was
// seen in frame 0 -- which is exactly the pairing twoView() needs, with no
// descriptors involved.
//
// THE WORKER IS STATEFUL HERE, unlike every other operation in this file. KLT
// needs the previous image and the previous point set, and shipping a whole
// greyscale frame back and forth each step to avoid that would cost more than
// the tracking does. One worker, strictly sequential, so there is no race.
// ---------------------------------------------------------------------------

let prevGray: CvMat | undefined
let prevPts: CvMat | undefined
let prevIds: Int32Array = new Int32Array(0)
/** Monotonic, never reused. A recycled id would silently re-associate a new
 *  corner with a dead point's 3D position. */
let nextTrackId = 1

function disposeKlt(): void {
  prevGray?.delete()
  prevPts?.delete()
  prevGray = undefined
  prevPts = undefined
  prevIds = new Int32Array(0)
}

function toGray(cv: CvModule, req: CvRequest): CvMat {
  let rgba: CvMat | undefined
  try {
    rgba = cv.matFromImageData({
      data: new Uint8ClampedArray(req.pixels as ArrayBuffer),
      width: req.width as number,
      height: req.height as number,
    })
    const gray = new cv.Mat()
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY)
    return gray
  } finally {
    rgba?.delete()
  }
}

/** Find corners worth following, and start following them. */
async function kltSeed(req: CvRequest): Promise<CvResponse> {
  const cv = await getCv()
  const started = Date.now()
  let gray: CvMat | undefined
  let corners: CvMat | undefined
  let mask: CvMat | undefined
  try {
    gray = toGray(cv, req)
    corners = new cv.Mat()

    // TOP UP RATHER THAN REPLACE, when asked. Tracking bleeds points -- they
    // leave the frame, fall into shadow, or the flow diverges -- so a keyframe
    // adds corners in the areas that have gone empty. Masking out a radius
    // around every surviving point is what stops goodFeaturesToTrack handing
    // back the corners already being followed.
    const keeping = req.keep === true && prevPts !== undefined && prevIds.length > 0
    // A seed that is not topping up is a restart: drop the old image and the
    // old point set rather than leaking them on the Emscripten heap.
    if (!keeping) disposeKlt()

    // ALWAYS A REAL MAT, NEVER `undefined`.
    //
    // embind binds `mask` to a C++ cv::Mat, and passing JavaScript `undefined`
    // for it is not the same as omitting the argument: omitting it lets
    // OpenCV use its own default, while passing undefined reaches the binding
    // and dies on `Cannot read properties of undefined (reading '$$')` --
    // `$$` being the handle embind expects every bound object to carry. An
    // EMPTY Mat is OpenCV's own spelling of "no mask", so it is both correct
    // and a single code path.
    mask = new cv.Mat()
    if (keeping && prevPts) {
      mask.delete()
      mask = new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1)
      mask.data.fill(255)
      const minDistance = req.minDistance ?? 12
      const r = Math.max(2, Math.round(minDistance))
      for (let i = 0; i < prevIds.length; i++) {
        const px = Math.round(prevPts.data32F[i * 2])
        const py = Math.round(prevPts.data32F[i * 2 + 1])
        for (let y = Math.max(0, py - r); y <= Math.min(gray.rows - 1, py + r); y++) {
          const row = y * gray.cols
          for (let x = Math.max(0, px - r); x <= Math.min(gray.cols - 1, px + r); x++) {
            mask.data[row + x] = 0
          }
        }
      }
    }

    cv.goodFeaturesToTrack(
      gray, corners,
      req.maxCorners ?? 400,
      // Quality is a FRACTION of the best corner's score, not an absolute, so
      // 0.01 adapts to a dim room and a bright one alike.
      0.01,
      req.minDistance ?? 12,
      mask,
    )

    const found = corners.rows
    const existing = keeping ? prevIds.length : 0
    const total = existing + found

    const points = new Float32Array(total * 2)
    const ids = new Int32Array(total)
    if (keeping && prevPts) {
      points.set(prevPts.data32F.subarray(0, existing * 2), 0)
      ids.set(prevIds, 0)
    }
    for (let i = 0; i < found; i++) {
      points[(existing + i) * 2] = corners.data32F[i * 2]
      points[(existing + i) * 2 + 1] = corners.data32F[i * 2 + 1]
      ids[existing + i] = nextTrackId++
    }

    prevGray?.delete()
    prevGray = gray
    gray = undefined // handed over; do not delete in finally
    prevPts?.delete()
    prevPts = cv.matFromArray(total, 1, cv.CV_32FC2, points)
    // A COPY FOR THE WORKER, BECAUSE THE ORIGINAL IS TRANSFERRED AWAY.
    //
    // The response posts `ids.buffer` as a transferable, which DETACHES it
    // here. Keeping the same array as `prevIds` therefore left the worker
    // holding a zero-length view the instant it replied: the next step found
    // nothing to track, the state machine concluded it was lost, re-seeded,
    // and did it again forever. From the outside it looked like healthy
    // tracking -- hundreds of points every frame -- because every frame was a
    // fresh seed. The giveaway was that none of the tracked ids were ever in
    // the seed set.
    //
    // `points` does not need this: matFromArray copies into the Emscripten
    // heap, so the Mat does not alias the array that goes back.
    prevIds = Int32Array.from(ids)

    return {
      id: req.id,
      tracked: points,
      ids,
      before: existing,
      count: total,
      ms: Date.now() - started,
    }
  } finally {
    gray?.delete()
    corners?.delete()
    mask?.delete()
  }
}

/** Follow the points one frame forward. */
async function kltStep(req: CvRequest): Promise<CvResponse> {
  const cv = await getCv()
  const started = Date.now()
  let gray: CvMat | undefined
  let next: CvMat | undefined
  let status: CvMat | undefined
  let err: CvMat | undefined
  let size: CvSize | undefined
  let criteria: CvTermCriteria | undefined
  try {
    gray = toGray(cv, req)
    if (!prevGray || !prevPts || prevIds.length === 0) {
      prevGray?.delete()
      prevGray = gray
      gray = undefined
      return { id: req.id, tracked: new Float32Array(0), ids: new Int32Array(0), before: 0, count: 0, ms: 0 }
    }

    const before = prevIds.length
    next = new cv.Mat()
    status = new cv.Mat()
    err = new cv.Mat()
    size = new cv.Size(21, 21)
    criteria = new cv.TermCriteria(cv.TermCriteria_COUNT | cv.TermCriteria_EPS, 30, 0.01)

    // maxLevel 3: a four-level pyramid. Without it, flow fails on any motion
    // larger than the 21px window -- which a handheld phone produces
    // constantly -- and the tracker drops everything the moment you move at a
    // normal speed.
    cv.calcOpticalFlowPyrLK(prevGray, gray, prevPts, next, status, err, size, 3, criteria)

    const kept: number[] = []
    const keptIds: number[] = []
    for (let i = 0; i < before; i++) {
      if (!status.data[i]) continue
      const x = next.data32F[i * 2]
      const y = next.data32F[i * 2 + 1]
      // Flow happily reports a confident position outside the image. Those
      // points are gone; keeping them poisons the pose solve.
      if (!(x >= 0 && y >= 0 && x < gray.cols && y < gray.rows)) continue
      kept.push(x, y)
      keptIds.push(prevIds[i])
    }

    const points = Float32Array.from(kept)
    const ids = Int32Array.from(keptIds)

    prevGray.delete()
    prevGray = gray
    gray = undefined
    prevPts.delete()
    prevPts = ids.length ? cv.matFromArray(ids.length, 1, cv.CV_32FC2, points) : undefined
    // The same copy, for the same reason -- see kltSeed above.
    prevIds = Int32Array.from(ids)

    return { id: req.id, tracked: points, ids, before, count: ids.length, ms: Date.now() - started }
  } finally {
    gray?.delete()
    next?.delete()
    status?.delete()
    err?.delete()
    size?.delete?.()
    criteria?.delete?.()
  }
}

ctx.addEventListener("message", (event: MessageEvent) => {
  const req = event.data as CvRequest
  const run = async (): Promise<void> => {
    try {
      if (req.kind === "ping") {
        const cv = await getCv()
        const info = cv.getBuildInformation?.() ?? ""
        const version = /OpenCV\s+(\d+\.\d+\.\d+)/.exec(info)?.[1]
        ctx.postMessage({
          id: req.id,
          build: version ? `OpenCV ${version} · wasm` : "OpenCV · wasm",
        } satisfies CvResponse)
        return
      }
      if (req.kind === "kltSeed" || req.kind === "kltStep") {
        const r = req.kind === "kltSeed" ? await kltSeed(req) : await kltStep(req)
        ctx.postMessage(r, [
          (r.tracked as Float32Array).buffer,
          (r.ids as Int32Array).buffer,
        ])
        return
      }
      if (req.kind === "pnp") {
        const solved = await pnp(req)
        ctx.postMessage(solved)
        return
      }
      if (req.kind === "match") {
        const matched = await match(req)
        ctx.postMessage(matched, matched.pairs ? [matched.pairs.buffer] : [])
        return
      }
      const result = await features(req)
      // Transferred, not copied -- the same reasoning the decoder records.
      ctx.postMessage(result, [
        (result.points as Float32Array).buffer,
        (result.descriptors as Uint8Array).buffer,
      ])
    } catch (error) {
      // In band, never thrown: a throw inside a worker message handler
      // surfaces as an untyped `error` event with no job id attached, which
      // would hang the caller's promise forever.
      ctx.postMessage({ id: req.id, error: String(error) } satisfies CvResponse)
    }
  }
  void run()
})
