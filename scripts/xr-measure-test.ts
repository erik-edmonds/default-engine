/** The measurement apparatus, against sequences whose answers are known.
 *
 *  Run: node --experimental-strip-types --import ./scripts/alias-hook.mjs \
 *       scripts/xr-measure-test.ts
 *
 *  WORTH A TEST RATHER THAN A GLANCE, because this is the instrument. Every
 *  number Phase 1 produces — the point budget, whether 1:1 is worth having,
 *  what a 300M-point farm scan will need — is read off these percentiles, and
 *  a ring buffer with an off-by-one in its wrap would report confidently
 *  wrong figures that no amount of time in a headset would reveal. A probe in
 *  a browser cannot check this: it would have to know the right answer, which
 *  means knowing the frame times, which means not measuring them.
 *
 *  The second reason is the ring. `CAPACITY` is 1200 and a ten-second window
 *  at 72Hz is ~720 frames, so a long window runs near the wrap. The wrap is
 *  exactly where a buffer like this goes wrong, and it goes wrong silently.
 */
import { DROP_FACTOR, FrameTimes, frameBudgetMs } from "@/helpers/frameStats"
import { WRIST_ROWS, wristValues } from "@/helpers/wristRows"
import { samplesToCsv, type Sample } from "@/helpers/sampleLog"
import * as THREE from "three"
import { fileToWorld, lifeSizeRig, tabletopRig, worldToFile } from "@/lib/copc/scale"
import {
  beginTwoHand,
  deadzone,
  oneHandMatrix,
  snapTurnPosition,
  twoHandMatrix,
  walkDelta,
} from "@/lib/xr/manipulate"

let failures = 0
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`)
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

// --- percentiles on a sequence with an arithmetic answer ----------------
{
  const f = new FrameTimes()
  // 1..100 ms. Nearest-rank: p50 is the 50th value, p95 the 95th.
  for (let i = 1; i <= 100; i++) f.push(i)
  check("count tracks what was pushed", f.count === 100, `${f.count}`)
  check("p50 of 1..100 is 50", near(f.percentile(0.5), 50), `${f.percentile(0.5)}`)
  check("p95 of 1..100 is 95", near(f.percentile(0.95), 95), `${f.percentile(0.95)}`)
  check("p100 is the worst frame", near(f.percentile(1), 100), `${f.percentile(1)}`)
  // Order must not matter. Shuffle the same multiset and demand the same
  // answers -- a percentile that depended on arrival order would track the
  // most recent frames rather than the distribution.
  const g = new FrameTimes()
  const shuffled = Array.from({ length: 100 }, (_, i) => i + 1)
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (i * 7919 + 13) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  for (const v of shuffled) g.push(v)
  check("percentiles are order-independent",
    near(g.percentile(0.5), 50) && near(g.percentile(0.95), 95),
    `shuffled: p50 ${g.percentile(0.5)}, p95 ${g.percentile(0.95)}`)
}

// --- the window argument ------------------------------------------------
{
  const f = new FrameTimes()
  // 500 cheap frames, then 100 expensive ones.
  for (let i = 0; i < 500; i++) f.push(5)
  for (let i = 0; i < 100; i++) f.push(50)
  check("a short window sees only recent frames",
    near(f.percentile(0.5, 100), 50),
    `last 100: p50 ${f.percentile(0.5, 100)} -- all 50s`)
  check("a long window sees the whole run",
    near(f.percentile(0.5, 600), 5),
    `last 600: p50 ${f.percentile(0.5, 600)} -- 500 fives against 100 fifties`)
  check("asking for more than exists is not an error",
    near(f.percentile(0.5, 100_000), 5),
    `${f.percentile(0.5, 100_000)}`)
}

// --- THE WRAP. 1200 is CAPACITY; this is where a ring goes wrong --------
{
  const f = new FrameTimes()
  // 1200 frames of 99, then 1200 of 10. After the second batch NOTHING of
  // the first may survive -- the buffer has been completely overwritten.
  for (let i = 0; i < 1200; i++) f.push(99)
  for (let i = 0; i < 1200; i++) f.push(10)
  check("the ring caps at capacity", f.count === 1200, `${f.count}`)
  check("a full overwrite leaves nothing of the old data",
    near(f.percentile(1), 10),
    `worst frame is ${f.percentile(1)}; a 99 here means the wrap reads stale slots`)

  // Half-overwritten: 600 of each, so the median sits exactly at the seam.
  const g = new FrameTimes()
  for (let i = 0; i < 1200; i++) g.push(99)
  for (let i = 0; i < 600; i++) g.push(10)
  check("a half overwrite keeps exactly half",
    near(g.percentile(0.25), 10) && near(g.percentile(0.75), 99),
    `p25 ${g.percentile(0.25)} (10), p75 ${g.percentile(0.75)} (99) -- 600 of each across the wrap`)

  // The newest 600 must be the 10s regardless of where the write head sits.
  check("the window reads backwards from the write head, not from slot 0",
    near(g.percentile(1, 600), 10),
    `worst of the last 600 is ${g.percentile(1, 600)}`)
}

// --- dropped frames -----------------------------------------------------
{
  const budget = frameBudgetMs(72)
  check("the 72Hz slot is 13.89ms", near(budget, 1000 / 72), `${budget.toFixed(4)}`)
  const f = new FrameTimes()
  // 90 frames inside the slot, 10 at double. Only the doubles overrun 1.5x.
  for (let i = 0; i < 90; i++) f.push(13.0)
  for (let i = 0; i < 10; i++) f.push(27.8)
  check("only real overruns are counted",
    f.droppedAbove(budget * DROP_FACTOR) === 10,
    `${f.droppedAbove(budget * DROP_FACTOR)} of 100 -- the 13.0ms frames are inside the slot`)

  // THE REASON FOR 1.5x. A viewer sitting right at the slot width jitters
  // either side of it; at a 1.0x threshold half those frames would be
  // reported dropped and the viewer would look broken in the log while
  // looking perfect in the headset.
  const g = new FrameTimes()
  for (let i = 0; i < 100; i++) g.push(i % 2 === 0 ? 13.8 : 14.0)
  check("jitter around the slot is not a dropped frame",
    g.droppedAbove(budget * DROP_FACTOR) === 0,
    `${g.droppedAbove(budget * DROP_FACTOR)} dropped at 1.5x, against ${g.droppedAbove(budget)} at 1.0x`)
}

// --- an empty meter must not report zeros as measurements ---------------
{
  const f = new FrameTimes()
  check("an empty meter reports 0, not NaN",
    f.percentile(0.5) === 0 && f.droppedAbove(10) === 0 && f.count === 0,
    `p50 ${f.percentile(0.5)}, dropped ${f.droppedAbove(10)}`)
  f.push(16)
  f.reset()
  check("reset empties it", f.count === 0 && f.percentile(0.5) === 0, `${f.count}`)
}

// --- spanMs, which is what tells you a window really lasted 10s ---------
{
  const f = new FrameTimes()
  for (let i = 0; i < 720; i++) f.push(13.889)
  check("720 frames at 13.889ms is ten seconds",
    near(f.spanMs(), 10_000, 1),
    `${(f.spanMs() / 1000).toFixed(3)}s -- a window that reports fewer frames than this was cut short`)
}

// --- THE WRIST PANEL'S ROW INVARIANT ------------------------------------
//
// The labels and the values are two separate troika objects sharing a line
// height. If their row counts ever diverge the panel does not throw, does not
// warn and does not look broken -- every row below the divergence shows the
// wrong label, so you read "p95: 31" off a line that is really the draw-call
// count. A wrong number that looks like a right one, in a headset, while
// measuring. This is the assertion that makes that impossible.
{
  const frames = new FrameTimes()
  for (let i = 0; i < 300; i++) frames.push(13.2)
  frames.push(31.4)
  const readout = {
    cloud: { points: 1_234_567, nodes: 65, bytes: 20_600_000, requests: 71, loading: 3, ready: true },
    budget: 750_000,
    scaleMode: "table" as const,
    ratio: 710,
    frames,
    hz: 72,
    framebuffer: [2208, 2112] as [number, number],
    foveation: 1,
    drawCalls: 65,
    programs: 1,
    pointSize: 1.6,
    pixelRatio: 1,
  }
  const vals = wristValues(readout)
  check("the panel's labels and values have the same row count",
    WRIST_ROWS.length === vals.length,
    `${WRIST_ROWS.length} labels, ${vals.length} values -- a mismatch mislabels every row below it, silently`)

  // Blank spacer rows must line up too, or the groups drift apart.
  const labelBlanks = WRIST_ROWS.map((l, i) => (l === "" ? i : -1)).filter((i) => i >= 0)
  const valueBlanks = vals.map((v, i) => (v === "" ? i : -1)).filter((i) => i >= 0)
  check("the spacer rows are at the same indices in both columns",
    JSON.stringify(labelBlanks) === JSON.stringify(valueBlanks),
    `labels blank at [${labelBlanks}], values blank at [${valueBlanks}]`)

  const row = (label: string) => vals[WRIST_ROWS.indexOf(label as never)]
  check("median is formatted in milliseconds", row("median") === "13.2 ms", `"${row("median")}"`)
  check("worst picks up the one slow frame", row("worst") === "31.4 ms", `"${row("worst")}"`)
  check("dropped is shown against the refresh slot",
    row("dropped") === "1 / 13.9",
    `"${row("dropped")}" -- one frame over 1.5x the 13.9ms slot`)
  check("the eye framebuffer is the runtime's, not the window's",
    row("eye") === "2208x2112", `"${row("eye")}"`)
  check("the tabletop ratio reads as a ratio", row("scale") === "1:710", `"${row("scale")}"`)
  // THE SHIMMER NUMBER. pointsMaterial.size x pixelRatio is what the shader
  // uses, and a session's ratio is 1 -- so the panel must show 1.6, not the
  // 3.2 the same material gives on a retina monitor.
  check("point size is reported in DEVICE pixels",
    row("point") === "1.6 px",
    `"${row("point")}" at size ${readout.pointSize} x ratio ${readout.pixelRatio} -- under the 3px floor, which is the finding`)

  const lifeVals = wristValues({ ...readout, scaleMode: "life", ratio: 1 })
  check("life size reads 1:1 rather than 1:1-the-number",
    lifeVals[WRIST_ROWS.indexOf("scale" as never)] === "1:1",
    `"${lifeVals[WRIST_ROWS.indexOf("scale" as never)]}"`)

  const empty = wristValues({ ...readout, frames: new FrameTimes(), framebuffer: [0, 0], hz: 0 })
  check("before any frames, the panel shows a dash rather than 0.0 ms",
    empty[0] === "—" && empty[WRIST_ROWS.indexOf("eye" as never)] === "—",
    `median "${empty[0]}", eye "${empty[WRIST_ROWS.indexOf("eye" as never)]}" -- a confident 0.0 would read as a measurement`)
}

// --- THE RIG, and the two ways it was wrong ----------------------------
//
// Autzen's real numbers: 4655.5 ft longest extent, in a file whose WKT says
// UNIT["foot", 0.3048], so the site is 1419 m across.
{
  const size: [number, number, number] = [4655.5, 3421.0, 208.0]
  // `source.origin` is the octree CUBE centre, and the data sits far below it
  // in Z -- which is what makes the anchor's rotation matter so much.
  const centre: [number, number, number] = [0, 0, -2233]
  const rig = tabletopRig(size, centre, 2.0, [0, 0.9, -1.2], 0.3048)

  check("the tabletop normalises the longest edge to two metres",
    near(rig.k * size[0], 2.0, 1e-9),
    `k ${rig.k.toExponential(4)} x ${size[0]} = ${(rig.k * size[0]).toFixed(4)} m`)

  // THE RATIO BUG. 1/k is 2328 -- file units per metre, a mixed-unit number.
  // The site is 1419 m long and the model is 2 m, so the scale is 1:710.
  // 4655.5 ft is 1418.99 m, so the exact ratio is 709.495 and rounds to 709.
  // The plan says 710 because it rounded the metres to 1419 first; both are
  // the same number and neither is the point. Asserted as a tolerance rather
  // than an integer, because an exact expectation at a rounding boundary
  // tests the boundary and not the behaviour.
  check("the reported ratio is a real scale, not 1/k",
    Math.abs(rig.ratio - 709.5) <= 0.5,
    `1:${rig.ratio}, where 1/k would have said 1:${Math.round(1 / rig.k)} -- wrong by exactly the 3.28 ft/m conversion, and plausible enough on a wrist panel to be believed`)

  check("life size is 1:1 and the file's own unit scale",
    lifeSizeRig(0.3048, centre).ratio === 1 && near(lifeSizeRig(0.3048, centre).k, 0.3048),
    `k ${lifeSizeRig(0.3048, centre).k}, ratio 1:${lifeSizeRig(0.3048, centre).ratio}`)

  // THE TRANSFORM-ORDER BUG, as arithmetic. The recentre group is the parent
  // of PointCloud's -90-about-X rotation, so its translation applies AFTER R
  // and must therefore be -R*A rather than -A. `fileToWorld` is the authority
  // on what the chain is supposed to compute; this asserts the group chain
  // agrees with it.
  const R = new THREE.Euler(-Math.PI / 2, 0, 0)
  const anchorRotated: [number, number, number] = [rig.anchor[0], rig.anchor[2], -rig.anchor[1]]
  const probe: [number, number, number] = [1200, -900, -2100]

  // What the group chain does: T + k*(R*p + d), with d the recentre position.
  const chain = (d: [number, number, number]) => {
    const v = new THREE.Vector3(...probe).applyEuler(R)
    return v.add(new THREE.Vector3(...d)).multiplyScalar(rig.k).add(new THREE.Vector3(...rig.placement))
  }
  const correct = chain([-anchorRotated[0], -anchorRotated[1], -anchorRotated[2]])
  const naive = chain([-rig.anchor[0], -rig.anchor[1], -rig.anchor[2]])
  const want = fileToWorld(probe, rig, R)

  check("the group chain with a ROTATED anchor matches fileToWorld",
    correct.distanceTo(want) < 1e-6,
    `(${correct.toArray().map((v) => v.toFixed(4)).join(', ')}) vs (${want.toArray().map((v) => v.toFixed(4)).join(', ')})`)

  check("and subtracting the anchor unrotated misplaces the model",
    naive.distanceTo(want) > 1.0,
    `off by ${naive.distanceTo(want).toFixed(3)} m at tabletop -- the model on the floor at your feet rather than on a table; the same error at 1:1 (k ${0.3048}) is ${(naive.distanceTo(want) * (0.3048 / rig.k)).toFixed(0)} m, which is simply a black screen`)

  // The claim the whole scale design rests on: a uniform k cancels out of the
  // LOD, so the same viewpoint picks the same nodes at any scale.
  const tiny = tabletopRig(size, centre, 2.0, [0, 0.9, -1.2], 0.3048)
  const life = lifeSizeRig(0.3048, centre)
  const roundTrip = (rigToUse: typeof rig) =>
    worldToFile(fileToWorld(probe, rigToUse, R), rigToUse, R)
  for (const [name, r] of [["tabletop", tiny], ["life size", life]] as const) {
    const back = roundTrip(r)
    check(`${name}: file -> world -> file is lossless`,
      back.every((v, i) => Math.abs(v - probe[i]) < 1e-3),
      `(${back.map((v) => v.toFixed(3)).join(', ')}) from (${probe.join(', ')})`)
  }
}

// --- MOVING ABOUT, AND HANDLING THE MODEL ------------------------------
//
// None of this can be reached by a browser probe: a real XR session cannot be
// driven headless here (headless Chromium ships a native XRSystem with no
// device, and iwer will not install over one), so without these checks the
// two-handed grab would be verified only by someone in a headset deciding it
// "feels wrong". Each one below is an invariant that is either exactly true
// or quietly broken.
{
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

  check("a resting stick reads as centred",
    deadzone(0.04, 0.18) === 0 && deadzone(-0.05, 0.18) === 0 && deadzone(0.9, 0.18) === 0.9,
    "0.04 and -0.05 are zero, 0.9 is untouched -- Quest sticks rest around 0.02-0.05 and drift with wear, and without this the view creeps while nobody is touching anything")

  // Walking is relative to the HEAD, not to the play space.
  {
    const forward = walkDelta(0, -1, 0, 1, 1)
    check("pushing the stick forward walks forward",
      near(forward.x, 0, 1e-9) && near(forward.z, -1, 1e-9),
      `(${forward.toArray().map((v) => v.toFixed(3)).join(', ')}) -- stick Y is positive BACKWARD in the WebXR mapping, and -Z is forward in three`)

    const turned = walkDelta(0, -1, Math.PI / 2, 1, 1)
    check("and after turning 90 degrees it walks the new way",
      near(turned.x, -1, 1e-6) && near(turned.z, 0, 1e-6),
      `(${turned.toArray().map((v) => v.toFixed(3)).join(', ')}) at a head yaw of 90 degrees`)

    const down = walkDelta(0, -1, 0, 1, 1)
    check("walking is always level, never into the floor",
      down.y === 0,
      "y is 0 by construction -- the head's YAW is used and its pitch is discarded, or glancing down would drive you into the ground")
  }

  // THE SNAP TURN INVARIANT. The head must not move.
  {
    // The wearer is standing 2m from the play-space origin.
    const originPos = V(0, 0, 0)
    const head = V(2, 1.6, -1)
    const angle = (30 * Math.PI) / 180
    const moved = snapTurnPosition(originPos, head, angle)
    // Where does the head end up? Apply the same yaw about the new origin.
    const headLocal = V(head.x - originPos.x, 0, head.z - originPos.z)
    const rotated = headLocal.clone().applyAxisAngle(V(0, 1, 0), angle)
    const headAfter = V(moved.x + rotated.x, head.y, moved.z + rotated.z)
    check("a snap turn leaves the wearer's head exactly where it was",
      Math.abs(headAfter.x - head.x) < 1e-9 && Math.abs(headAfter.z - head.z) < 1e-9,
      `head (${head.x}, ${head.z}) -> (${headAfter.x.toFixed(9)}, ${headAfter.z.toFixed(9)}) -- turning about the play space's ORIGIN instead would swing anyone standing away from it through an arc, which feels like being shoved sideways`)
  }

  // THE TWO-HANDED GRAB. Scale and rotate about the point between the hands.
  {
    const model = new THREE.Matrix4().identity()
    const l0 = V(-0.2, 1.2, -0.5)
    const r0 = V(0.2, 1.2, -0.5)
    const start = beginTwoHand(l0, r0, model, 1)
    check("a grab records the span between the hands",
      near(start.span, 0.4, 1e-9) && near(start.mid.x, 0, 1e-9),
      `${(start.span * 100).toFixed(0)}cm apart, midpoint at (${start.mid.toArray().map((v) => v.toFixed(2)).join(', ')})`)

    // Hands stay put: nothing may move.
    const still = twoHandMatrix(start, l0, r0, 0.05, 40)
    check("holding still changes nothing",
      still.equals(model),
      "the identity model is returned unchanged -- a grab that drifts while your hands are still is the most unnerving version of this bug")

    // Pull the hands twice as far apart, about the same midpoint.
    const l1 = V(-0.4, 1.2, -0.5)
    const r1 = V(0.4, 1.2, -0.5)
    const doubled = twoHandMatrix(start, l1, r1, 0.05, 40)
    const p = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    doubled.decompose(p, q, sc)
    check("pulling your hands twice as far apart doubles the model",
      near(sc.x, 2, 1e-6) && near(sc.y, 2, 1e-6) && near(sc.z, 2, 1e-6),
      `scale ${sc.x.toFixed(4)} -- and uniform in all three axes, which is what keeps the LOD scale-invariant`)

    // THE ONE THAT MATTERS: the midpoint is a fixed point of the transform.
    const midPoint = start.mid.clone().applyMatrix4(doubled)
    check("and the point between your hands does not move while it grows",
      midPoint.distanceTo(start.mid) < 1e-6,
      `midpoint (${start.mid.toArray().map((v) => v.toFixed(3)).join(', ')}) maps to (${midPoint.toArray().map((v) => v.toFixed(3)).join(', ')}) -- scaling an Object3D's own .scale instead would scale about the MODEL's origin, which on a survey is nowhere near your hands, and it would shoot off sideways as it grew`)

    // Rotate the hands 90 degrees about the midpoint; the model must follow.
    const l2 = V(0, 1.2, -0.3)
    const r2 = V(0, 1.2, -0.7)
    const turned = twoHandMatrix(start, l2, r2, 0.05, 40)
    turned.decompose(p, q, sc)
    const yaw = new THREE.Euler().setFromQuaternion(q, "YXZ").y
    check("turning your hands turns the model by the same angle",
      near(Math.abs(yaw), Math.PI / 2, 1e-6) && near(sc.x, 1, 1e-6),
      `${((yaw * 180) / Math.PI).toFixed(1)} degrees of yaw at scale ${sc.x.toFixed(3)} -- a quarter turn of the hands, no change of size`)
    const turnedMid = start.mid.clone().applyMatrix4(turned)
    check("and it turns about your hands, not about its own origin",
      turnedMid.distanceTo(start.mid) < 1e-6,
      `midpoint stays at (${turnedMid.toArray().map((v) => v.toFixed(3)).join(', ')})`)

    // The clamp bounds the MODEL, not the hand travel.
    const far = twoHandMatrix(start, V(-50, 1.2, -0.5), V(50, 1.2, -0.5), 0.05, 40)
    far.decompose(p, q, sc)
    check("the model cannot be grown past the clamp",
      near(sc.x, 40, 1e-6),
      `hands 100m apart would be 250x; clamped to ${sc.x.toFixed(1)}x -- the clamp exists so the model cannot be lost`)
    const tiny = twoHandMatrix(start, V(-0.0005, 1.2, -0.5), V(0.0005, 1.2, -0.5), 0.05, 40)
    tiny.decompose(p, q, sc)
    check("nor shrunk past it",
      near(sc.x, 0.05, 1e-6),
      `clamped to ${sc.x.toFixed(3)}x`)
  }

  // ONE HAND: the model keeps its pose relative to that hand.
  {
    const hand0 = new THREE.Matrix4().makeTranslation(0.3, 1.1, -0.4)
    const model0 = new THREE.Matrix4().makeTranslation(0, 0.9, -1.2)
    const captured = hand0.clone().invert().multiply(model0)

    const still = oneHandMatrix(hand0, captured)
    check("a one-handed grab does not jump when it starts",
      still.equals(model0),
      "the model's matrix is returned unchanged at the instant of the squeeze")

    // Move the hand half a metre right and the model must come with it.
    const hand1 = new THREE.Matrix4().makeTranslation(0.8, 1.1, -0.4)
    const moved = oneHandMatrix(hand1, captured)
    const p = new THREE.Vector3()
    moved.decompose(p, new THREE.Quaternion(), new THREE.Vector3())
    check("moving your hand moves the model with it, one for one",
      near(p.x, 0.5, 1e-9) && near(p.y, 0.9, 1e-9) && near(p.z, -1.2, 1e-9),
      `model at (${p.toArray().map((v) => v.toFixed(3)).join(', ')}) after a 0.5m move -- translation only, no drift in the other axes`)

    // Rotating the hand must orbit the model about the HAND.
    const hand2 = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(
      new THREE.Matrix4().makeTranslation(0.3, 1.1, -0.4),
    )
    const orbited = oneHandMatrix(hand2, captured)
    orbited.decompose(p, new THREE.Quaternion(), new THREE.Vector3())
    const handPos = new THREE.Vector3(0.3, 1.1, -0.4)
    const before = new THREE.Vector3(0, 0.9, -1.2).distanceTo(handPos)
    check("and turning your wrist orbits it about your hand",
      Math.abs(p.distanceTo(handPos) - before) < 1e-6,
      `distance from the hand is ${p.distanceTo(handPos).toFixed(4)}m before and after -- a rigid motion, so nothing is stretched or sheared by a wrist turn`)
  }
}

// --- the CSV export generates its own header --------------------------
{
  const row: Sample = {
    at: 1, sinceSessionStartMs: 2, scan: "autzen", budget: 3, scaleMode: "table", ratio: 4,
    frames: 5, medianMs: 6, p95Ms: 7, worstMs: 8, dropped: 9, points: 10, nodes: 11,
    drawCalls: 12, programs: 13, framebuffer: [14, 15], foveation: 16, hz: 17, settled: true,
  }
  const csv = samplesToCsv([row])
  const [header, body] = csv.split("\n")
  check("the CSV header covers every field of a Sample",
    header.split(",").length === Object.keys(row).length,
    `${header.split(",").length} columns for ${Object.keys(row).length} fields -- derived from the row, so a new field cannot go missing`)
  check("the framebuffer pair survives as one cell",
    body.includes("14x15") && body.split(",").length === header.split(",").length,
    `${body.split(",").length} cells against ${header.split(",").length} headers -- a bare array would emit a comma and shift every column right`)
  check("an empty log exports nothing rather than a bare header",
    samplesToCsv([]) === "", `"${samplesToCsv([])}"`)
}

console.log(`\n  ${failures === 0 ? "all checks passed" : `${failures} FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
