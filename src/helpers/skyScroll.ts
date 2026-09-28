/** Where the sky journey has been scrolled to, published for anything that
 *  needs to move with it.
 *
 *  `skyOffset` lived as a useRef private to app/page.tsx, so the only things
 *  that could see it were the two controllers it was handed to imperatively.
 *  The fly-past needs a third reader -- the paper world itself -- and a fourth,
 *  the velocity lines, which need to know how FAST it is changing.
 *
 *  Module state rather than an atom, for the reason cameraBase.ts already gives
 *  for the same decision: this changes every frame while a gesture is in
 *  flight, and a React re-render per change would be absurd. pointerState and
 *  sunState are the same pattern.
 *
 *  TWO numbers, and the distinction matters:
 *
 *  - `target` is where the wheel has been scrolled to. Written by page.tsx.
 *  - `display` is the damped value the camera is actually at. Written by
 *    CameraController, which already computes it.
 *
 *  Consumers should read `display` and must NOT damp it again. config/
 *  skyJourney.ts warns that two smoothing constants let the camera and the
 *  avatar slide apart, and that is already latent between those two -- the
 *  camera clamps its delta to 1/30 and the avatar does not, so on a long frame
 *  they disagree. A third independent damp would be a third thing to drift. */
export const skyScroll = {
  /** 0 .. SKY_JOURNEY_DISTANCE. Where the scroll has been taken. */
  target: 0,
  /** 0 .. SKY_JOURNEY_DISTANCE. Where the camera actually is, damped. */
  display: 0,
  /** Units per second, damped, signed. The velocity lines read this; so does
   *  anything that should only appear while you are actually travelling. */
  speed: 0,
  /** Units per second, the momentum the wheel has put into the journey. The
   *  wheel no longer moves `target` itself -- it pushes this, and this carries
   *  `target`. See advanceSkyScroll. */
  velocity: 0,
}

/** THE JOURNEY COASTS, AND IT STICKS AT THE WORDS.
 *
 *  The wheel used to write `target` outright, so the sky moved exactly as far
 *  as your fingers did and stopped dead the instant they did. The reference
 *  reads quite differently: a flick keeps travelling and decays, and as a
 *  section of text comes up the scroll is helped into it and holds there for a
 *  beat before the next flick breaks it loose again. That is the same idea as
 *  the island's hotspot magnets, applied to a one-dimensional axis.
 *
 *  Three constants, and they trade against each other:
 *
 *  FRICTION is how fast a flick dies -- a little over a second of coast.
 *
 *  CAPTURE is how near a hold has to be before it starts pulling. Kept well
 *  under half a section, so there is always a stretch in the middle of each
 *  span that is pure coasting; a capture radius that met the next one would
 *  turn the whole journey into a rail. It is also what one gesture has to beat
 *  to leave a block cold, so it cannot be much wider than a wheel flick.
 *
 *  STIFFNESS and STICK_FRICTION are the hold itself. The first accelerates you
 *  toward the hold point, the second bleeds the coast once you are inside it,
 *  which together are what "sticks for a bit" is. They are deliberately weak
 *  enough that one ordinary wheel gesture escapes -- a hold you cannot leave
 *  is a trap, not a beat. */
const FRICTION = 2.6
const CAPTURE = 150
const STIFFNESS = 2.4
const STICK_FRICTION = 3.1
/** The speed above which a hold has no grip at all, in journey units per
 *  second. One wheel gesture starts at roughly twice this, so it always gets
 *  clear of the block it is leaving before the magnet can have an opinion. */
const ESCAPE_SPEED = 280
/** Under this, the journey is treated as stopped: without it the spring and
 *  the friction chase each other around the hold point forever, and `speed`
 *  never settles, so the velocity lines never quite go out. */
const REST_SPEED = 0.6
/** How quickly the last of the gap to a hold is closed once the coast is
 *  spent, in e-folds per second. Slow enough to read as settling rather than
 *  snapping. */
const SETTLE_RATE = 1.8

/** Where the wheel's push goes. Called once per wheel event.
 *
 *  Takes the DISTANCE the gesture should ultimately carry the journey, not a
 *  velocity, and converts. A flick of momentum v against a friction f coasts
 *  v/f before it dies, so the impulse is the distance times the friction --
 *  which means the sensitivity above stays the honest "units of journey per
 *  unit of wheel" it always was, and retuning the coast does not silently
 *  retune how far a gesture takes you. */
export function impulseSkyScroll(distance: number) {
  skyScroll.velocity += distance * FRICTION
}

/** Integrate one frame. Called by whoever owns the sky's frame loop, before it
 *  damps `display` -- so `target` is a position under momentum and `display`
 *  is still the smoothed follow of it that everything else reads.
 *
 *  `holds` are the scroll positions the journey should settle at: the middle
 *  of each block of text. Passed in rather than imported, because this file is
 *  the one thing in the chain that must not depend on the choreography. */
export function advanceSkyScroll(delta: number, limit: number, holds: readonly number[]) {
  if (delta <= 0) return skyScroll.target
  // SUB-STEPPED, not clamped.
  //
  // A spring cannot be integrated in one big jump -- a long frame would step
  // straight through a hold and out the far side -- so the step is bounded.
  // Bounding it by CLAMPING the delta was the easy version and it is wrong in
  // a way that shows: the physics then runs slower than the clock whenever
  // frames are slow, so on a struggling machine the journey coasts and settles
  // in slow motion. Measured under a software renderer at two frames a second,
  // where a twelve-second wait advanced the integrator by eight tenths of one.
  // Splitting the frame into whole steps keeps the maths stable and the clock
  // honest. The cap is a spiral guard: after a stall, a couple of dropped
  // steps is better than a hundred catch-up ones.
  const MAX_STEP = 1 / 30
  const steps = Math.min(8, Math.max(1, Math.ceil(delta / MAX_STEP)))
  for (let i = 0; i < steps; i++) advanceOneStep(delta / steps, limit, holds)
  return skyScroll.target
}

function advanceOneStep(dt: number, limit: number, holds: readonly number[]) {

  // The nearest hold, and only if it is close enough to have any say.
  let nearest = null as number | null
  let best = CAPTURE
  for (const h of holds) {
    const d = Math.abs(h - skyScroll.target)
    if (d < best) {
      best = d
      nearest = h
    }
  }

  if (nearest !== null) {
    // Eased by how deep into the capture band you are, so the pull arrives
    // gradually instead of switching on at the edge -- a step change in
    // acceleration is felt as a bump.
    const depth = 1 - best / CAPTURE
    // AND BY HOW FAST YOU ARE ALREADY GOING, which is what keeps a hold from
    // being a trap.
    //
    // Without this the magnet pulls just as hard on a scroll that is sailing
    // through as on one that is running out -- so leaving a block took two or
    // three gestures where one should do: measured, a full flick off a hold
    // netted 30 units of the 200 it carried. A fresh flick is moving several
    // hundred units a second and passes straight over; by the time the coast
    // has decayed to walking pace the grip is full and it settles. Which is
    // also the behaviour asked for -- assisted as it arrives, inertial again
    // once you push on.
    // AND IT DOES NOT PULL ON SOMETHING LEAVING.
    //
    // A hold is a landing aid. Fighting momentum that is already heading away
    // from it made the block hard to leave in a way that showed: a wheel
    // gesture of nine notches carried 120 units, the capture band is wider
    // than that, and the magnet simply reeled it back in -- so a reader who
    // nudged forward went nowhere and the journey never reached its third
    // block at all. Departing under your own steam is released immediately;
    // arriving, or dawdling, is still caught.
    const leaving =
      Math.sign(skyScroll.velocity) === Math.sign(skyScroll.target - nearest) &&
      Math.abs(skyScroll.velocity) > REST_SPEED * 4
    const grip = leaving ? 0 : depth * Math.max(0, 1 - Math.abs(skyScroll.velocity) / ESCAPE_SPEED)
    skyScroll.velocity += (nearest - skyScroll.target) * STIFFNESS * grip * dt
    skyScroll.velocity *= Math.exp(-STICK_FRICTION * grip * dt)
  }
  skyScroll.velocity *= Math.exp(-FRICTION * dt)

  // THE LAST FEW UNITS ARE CLOSED BY HAND.
  //
  // A spring's pull falls away with the distance left, so the closer it gets
  // the weaker it pulls -- and REST_SPEED, which exists so the journey can
  // actually stop rather than creep forever, was cutting the velocity off
  // before the hold was reached. Measured: it came to rest 53 units short of
  // the block it was being drawn into, which reads as "nearly" sticking.
  //
  // Inside the band, once the coast has died, the remaining gap is simply
  // damped out. The spring still does all the work you can feel; this only
  // finishes the approach.
  if (nearest !== null && Math.abs(skyScroll.velocity) < REST_SPEED) {
    skyScroll.velocity = 0
    const gap = nearest - skyScroll.target
    if (Math.abs(gap) < 0.05) {
      skyScroll.target = nearest
    } else {
      skyScroll.target += gap * (1 - Math.exp(-SETTLE_RATE * dt))
    }
    return skyScroll.target
  }
  if (Math.abs(skyScroll.velocity) < REST_SPEED) skyScroll.velocity = 0

  const next = skyScroll.target + skyScroll.velocity * dt
  // The ends are walls, not wrap-arounds: hitting one kills the momentum
  // rather than letting it press against the clamp.
  if (next <= 0) {
    skyScroll.target = 0
    skyScroll.velocity = 0
  } else if (next >= limit) {
    skyScroll.target = limit
    skyScroll.velocity = 0
  } else {
    skyScroll.target = next
  }
  return skyScroll.target
}

/** Called by whoever owns the damp, once per frame, so `speed` stays consistent
 *  with `display` rather than being differentiated independently by each
 *  consumer at a different point in the frame. */
export function publishSkyDisplay(display: number, delta: number) {
  if (delta > 0) {
    const instant = (display - skyScroll.display) / delta
    // Light smoothing: the raw derivative of a damped value is noisy at small
    // deltas, and this drives something visual.
    skyScroll.speed += (instant - skyScroll.speed) * Math.min(1, delta * 8)
  }
  skyScroll.display = display
}

export function resetSkyScroll() {
  skyScroll.target = 0
  skyScroll.display = 0
  skyScroll.speed = 0
  skyScroll.velocity = 0
}
