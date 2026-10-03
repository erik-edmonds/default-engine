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
 *  CAPTURE is how near a hold has to be before it starts pulling. Still under
 *  half a section -- blocks are 675 apart and this is 260, so 155 units in the
 *  middle of every span are pure coasting and the journey is not a rail -- but
 *  much wider than the 150 it was. At 150 a flick carried 144 units, which is
 *  to say a reader could come to rest almost anywhere with no block in reach
 *  at all, and most of them did.
 *
 *  The cost is honest and worth stating: a single flick thrown from a standing
 *  start ON a block now carries about 30 units instead of 69, because the far
 *  side of the band catches what is left of it. Leaving takes a real scroll
 *  rather than a nudge. That is the trade "sticks for a bit" asks for, and a
 *  steady spin is unaffected -- it crosses at 163 u/s against 201 in the open,
 *  so it slows at the words and keeps going.
 *
 *  STIFFNESS and STICK_FRICTION are the hold itself. The first accelerates you
 *  toward the hold point, the second bleeds the coast once you are inside it,
 *  which together are what "sticks for a bit" is. They are deliberately weak
 *  enough that one ordinary wheel gesture escapes -- a hold you cannot leave
 *  is a trap, not a beat. */
const FRICTION = 2.6
const CAPTURE = 260
const STIFFNESS = 3.4
const STICK_FRICTION = 3.1
/** The speed above which a hold has no grip at all, in journey units per
 *  second.
 *
 *  THIS USED TO BE 280 AND THE COMMENT HERE USED TO BOAST ABOUT IT: "one wheel
 *  gesture starts at roughly twice this, so it always gets clear of the block
 *  it is leaving before the magnet can have an opinion." That is a description
 *  of the magnet never working. A steady wheel spin holds a few hundred units
 *  a second the whole way down the journey, so the grip term
 *  `1 - |v| / ESCAPE_SPEED` sat at or near zero for the entire scroll and the
 *  hold could only ever act on a journey that had already stopped.
 *
 *  Measured, over a thirty-second steady spin, as the difference between the
 *  speed within 70 units of a block and the speed more than 250 units from
 *  one -- which is what "sticks for a bit around the text" has to mean if it
 *  means anything:
 *
 *      CAPTURE 150, STIFFNESS 2.4, ESCAPE 280   200 vs 201 u/s    1% slower
 *      CAPTURE 260, STIFFNESS 3.4, ESCAPE 700   163 vs 201 u/s   19% slower
 *
 *  One per cent is the report -- "still no assistance in scrolling when the
 *  text is close, and there's still no stickiness around the texts."
 *
 *  The same change is what makes the assistance land: a trackpad flick thrown
 *  from the middle of a span used to die 103 units short of the block it was
 *  heading for, and now stops 18 short, which the settle below closes. */
const ESCAPE_SPEED = 700
/** Under this, the journey is treated as stopped: without it the spring and
 *  the friction chase each other around the hold point forever, and `speed`
 *  never settles, so the velocity lines never quite go out. */
const REST_SPEED = 0.6
/** How quickly the last of the gap to a hold is closed once the coast is
 *  spent, in e-folds per second. Slow enough to read as settling rather than
 *  snapping. */
const SETTLE_RATE = 1.8

/** Which way the reader is travelling, remembered across the gaps between
 *  gestures. +1 is deeper into the journey.
 *
 *  Module state rather than a field on skyScroll: nothing outside this file
 *  has any business with it, and it is an implementation detail of the magnet
 *  rather than a fact about the journey. See the grip, which is the only
 *  thing that reads it. */
let heading: -1 | 1 = 1

/** Where the wheel's push goes. Called once per wheel event.
 *
 *  Takes the DISTANCE the gesture should ultimately carry the journey, not a
 *  velocity, and converts. A flick of momentum v against a friction f coasts
 *  v/f before it dies, so the impulse is the distance times the friction --
 *  which means the sensitivity above stays the honest "units of journey per
 *  unit of wheel" it always was, and retuning the coast does not silently
 *  retune how far a gesture takes you. */
export function impulseSkyScroll(distance: number) {
  // The first push after a quiet spell starts a new gesture, and where the
  // journey was standing at that moment is the fact the settle below cannot
  // work without. See departedFrom.
  if (sincePush >= SETTLE_DELAY) departedFrom = skyScroll.target
  skyScroll.velocity += distance * FRICTION
  sincePush = 0
}

/** Seconds since the last wheel event.
 *
 *  The settle below needs to tell "the reader has finished and is reading"
 *  from "the reader is mid-gesture", and velocity alone cannot: a reader
 *  nudging the wheel every second is at rest for most of each second. That
 *  ambiguity is what produced the original trap -- the spring reeling in what
 *  each nudge had just won, so that a hundred and twenty nudges never reached
 *  the second block. */
let sincePush = Infinity

/** How long the wheel must be quiet before the journey will settle BACKWARD
 *  onto a block it has gone past. Long enough that a sequence of nudges is
 *  never reeled in, short enough that letting go reads as the scroll coming
 *  to rest on the words rather than wherever it happened to stop. */
const SETTLE_DELAY = 0.45

/** Where the journey was standing when the current gesture began, or null if
 *  no gesture has been thrown yet.
 *
 *  THIS IS THE FACT THAT MAKES THE SETTLE POSSIBLE, and three rounds of tuning
 *  failed for want of it. Coming to rest a little past a block is two entirely
 *  different events that look identical from a position alone:
 *
 *    - the reader was parked ON that block, flicked, and the coast died just
 *      past it. They asked to move on. Pulling them back is the trap.
 *    - the reader came through from somewhere else and overshot by a few
 *      units. They were aiming at that block. Pulling them back is the help.
 *
 *  Measured, the two are indistinguishable by distance: a flick thrown from a
 *  standing start on a hold nets about 74 units (traced at 100ms: 635 ->
 *  713.8), so the departure and the overshoot occupy the same band. Every
 *  value tried for that band therefore did one job or the other and never
 *  both -- 120 swallowed all four departures in a row, 25 let the reader
 *  wander and 5 of 7 rests had no text up at all.
 *
 *  Remembering the START of the gesture separates them exactly, because that
 *  is what actually differs: the departure begins on the hold, the overshoot
 *  begins far from it. */
let departedFrom: number | null = null

/** How near a hold the journey must have been standing for the gesture to
 *  count as LEAVING that hold rather than arriving at it. A hold the reader
 *  has just departed is never settled back onto. */
const LEAVING_RADIUS = 40

/** The speed below which the reader's own gesture counts as spent, so the
 *  settle may take over the landing.
 *
 *  THIS GATE USED TO BE REST_SPEED, 0.6, AND THAT IS WHY NOTHING EVER
 *  SETTLED. Traced: six seconds after the last wheel event the journey was
 *  still travelling at 48.6 units per second, a hundred times the gate, so
 *  the settle was unreachable in exactly the situation it exists for.
 *
 *  The velocity was not the reader's -- it was the spring's own. A hold's
 *  pull against the two frictions is a first-order chase with a terminal
 *  speed of `gap * STIFFNESS * depth / (STICK_FRICTION * depth + FRICTION)`,
 *  which at a 131-unit gap is 53 u/s and matched the trace. Its approach rate
 *  is only 0.4-0.6 e-folds a second, so the last stretch into a block took
 *  eight to twelve seconds of visible creeping, and because the creep never
 *  fell under 0.6 the quicker settle was never allowed to finish the job.
 *  Measured at the time: rests 39-57 units short of a hold, still moving.
 *
 *  So the gate asks the question it meant to ask. REST_SPEED answers "is
 *  anything moving at all", which the spring's dribble always fails; this
 *  answers "has the reader's own flick run out", which is the thing the
 *  settle must not interrupt. A fresh flick is several hundred units a
 *  second and a steady spin holds 163, both of which sail past untouched; a
 *  spent one is in the tens and gets landed. */
const SETTLE_SPEED = 150

/** How far the settle reaches AGAINST the direction of travel, to catch a
 *  genuine overshoot.
 *
 *  Generous now, where it could not be before: the hold a reader has just
 *  pushed off is excluded outright by departedFrom, so a wide backward reach
 *  no longer has any departure to swallow. It only ever catches someone who
 *  sailed in from elsewhere and stopped a little long. */
const SETTLE_BACK = 120


/** Integrate one frame. Called by whoever owns the sky's frame loop, before it
 *  damps `display` -- so `target` is a position under momentum and `display`
 *  is still the smoothed follow of it that everything else reads.
 *
 *  `holds` are the scroll positions the journey should settle at, and `shape`
 *  is how far the settle may move the reader to reach one. Both are passed in
 *  rather than imported, because this file is the one thing in the chain that
 *  must not depend on the choreography -- and the reach very much does depend
 *  on it. Deriving the reach here, from the gaps between the holds, is exactly
 *  what broke when the blocks got longer: see SKY_SETTLE_REACH. */
export type SkySettleShape = { reach: number; stillReading: number }

export function advanceSkyScroll(
  delta: number,
  limit: number,
  holds: readonly number[],
  shape: SkySettleShape,
) {
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
  for (let i = 0; i < steps; i++) advanceOneStep(delta / steps, limit, holds, shape)
  return skyScroll.target
}

function advanceOneStep(
  dt: number,
  limit: number,
  holds: readonly number[],
  shape: SkySettleShape,
) {
  // The quiet clock the settle below reads. Advanced per sub-step so it runs
  // on the same clock the physics does.
  sincePush += dt

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
    //
    // AND A HOLD ONLY EVER PULLS YOU ONWARD. It is a landing aid; it must not
    // be able to tow a reader backwards.
    //
    // This replaces a test on the sign of the live velocity, which was the
    // right idea and did not work, because it can only speak while you are
    // still moving. Measured in the browser: a reader nudging the wheel every
    // second or so got past the first block to 858 -- 133 units clear of it,
    // with the grip weakening the whole way -- and then ground to a halt,
    // advancing 24 units, then 15, then 7, then 2. The coast from each nudge
    // was dying inside the gap between nudges, and the moment it did the
    // velocity test stopped applying and the spring reeled in what the nudge
    // had just won. A hundred and twenty nudges never reached the second
    // block. That is the trap this was supposed to prevent, arriving through
    // the one door it did not cover: standing still.
    //
    // The direction the READER is going is the durable fact, so it is what is
    // remembered, and the pull is simply switched off whenever it would act
    // against it. Approaching a block, the pull is forward and the grip is
    // full: that is the assistance. Past it, the pull would be backward, so
    // there is none, whether you are still coasting or have stopped dead.
    // Scrolling back up the journey, the same rule mirrors and blocks are
    // caught from the other side.
    if (Math.abs(skyScroll.velocity) > REST_SPEED) {
      heading = Math.sign(skyScroll.velocity) as -1 | 1
    }
    const toward = Math.sign(nearest - skyScroll.target)
    const onward = toward === 0 || toward === heading
    // ...AND NOT WHILE THE READER IS ACTIVELY PUSHING.
    //
    // This is what made a hold inescapable. Sitting ON a block, `toward` is 0,
    // which counts as onward, so a departing flick met full grip and
    // STICK_FRICTION immediately -- the file's own note measured the cost:
    // "a single flick thrown from a standing start ON a block now carries
    // about 30 units instead of 69". Thirty units is inside any backward
    // settle band worth having, so the journey was reeled straight back and
    // four flicks in a row all ended at offset 640.
    //
    // Gating on the same quiet clock the settle uses separates the two
    // moments cleanly. While the wheel is live the spring says nothing and
    // the gesture carries its full distance; once the reader lets go, the
    // spring and then the settle do the landing. Which is the behaviour that
    // was asked for -- assisted as it arrives, inertial while you push on.
    const pushing = sincePush < SETTLE_DELAY
    const grip = onward && !pushing ? depth * Math.max(0, 1 - Math.abs(skyScroll.velocity) / ESCAPE_SPEED) : 0
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
  // ...AND ONCE THE READER HAS LET GO, IT SETTLES ON THE WORDS EITHER WAY.
  //
  // This used to close the gap ONWARD only, sharing the grip's rule above, and
  // that is why the journey did not stick: `nearest` is the closest hold in
  // either direction, so stopping just PAST one left the nearest hold behind,
  // the onward test false, and therefore no pull at all -- not forward to the
  // next block, not back to the one just passed. The reader rested in limbo
  // between them.
  //
  // Measured over nine realistic flicks before this change: three settled at
  // all, and they came to rest with the block of words 117, 52 and 3 units
  // from the lens against the 62 its type is authored for -- short of it,
  // roughly on it, and already past it. Mean miss 41 units.
  //
  // The onward rule is kept for the SPRING, which acts while the reader is
  // still moving and must never tow them backwards. This is a different
  // moment: the gesture is over and the wheel has been quiet for SETTLE_DELAY,
  // so easing onto the nearest block is the scroll coming to rest rather than
  // a tug-of-war. Gating on the quiet rather than on velocity is what keeps
  // the old nudge trap shut -- during a run of nudges the clock never gets
  // that far.
  // ...AND IT CARRIES ON TO THE NEXT BLOCK RATHER THAN SPLITTING THE
  // DIFFERENCE.
  //
  // The reach onward is a whole span, derived from the holds themselves so it
  // cannot drift when the choreography is re-spaced. That is deliberate and it
  // is the difference between a hold and a landing: one gesture, one block.
  //
  // Anything less leaves the reader in limbo, and the arithmetic says so.
  // Blocks are 540 apart; a flick off a standing start nets about 74. So a
  // reader who pushes away from a block and lets the coast die ends up ~60
  // units on, with the words they just left receding behind and the next ones
  // 480 ahead -- out of reach of any forward band short of the full span.
  // Measured with a 330 band: rests at caption axial 26.7 and 28 against the
  // 62 the type is authored for, and 5 of 7 rests with no text up at all. The
  // reader was being left exactly between two blocks every time.
  //
  // With the full span, a gesture always resolves onto words: onward to the
  // next block when the reader has pushed off one, back onto the block they
  // overshot when they were arriving at it.
  const settleTarget = (() => {
    if (Math.abs(skyScroll.velocity) >= SETTLE_SPEED) return null
    if (sincePush < SETTLE_DELAY) return null
    // ALREADY LOOKING AT WORDS? THEN LEAVE THE READER ALONE.
    //
    // Keyed on a hold BEHIND the direction of travel and on where the
    // reader actually stopped -- not, as the first version had it, on where
    // the gesture began. That version only recognised "still reading" for
    // the one gesture thrown from the block itself: a second small nudge
    // started from a point that was no longer near any hold, the check
    // missed, and the settle carried the reader a whole block for a
    // fraction of a block's worth of input.
    //
    // Behind, specifically. A hold AHEAD of the reader is one they are
    // arriving at, and easing them the last few units onto it is the
    // landing assistance this whole mechanism exists to provide.
    for (const h of holds) {
      const signed = h - skyScroll.target
      const behind = signed * heading < 0
      if (behind && Math.abs(signed) <= shape.stillReading) return null
    }
    // THE REACH IS GIVEN, NOT DERIVED FROM THE HOLDS.
    //
    // It used to be the largest gap between two holds, so that a reader
    // stranded between blocks could always be landed on the next one. That
    // reasoning died with the cards: the sky between two of them is somewhere
    // to be rather than somewhere to be rescued from, and when blocks grew
    // from 540 units to 1476 the same rule quietly handed the magnet a
    // 1476-unit reach. One wheel notch then crossed a whole card. See
    // SKY_SETTLE_REACH in config/skyJourney for the measurement.
    const onwardReach = shape.reach
    let pick = null as number | null
    let bestGap = Infinity
    for (const h of holds) {
      // Never reel the reader back onto the block they just pushed off.
      if (departedFrom !== null && Math.abs(h - departedFrom) <= LEAVING_RADIUS) continue
      const signed = h - skyScroll.target
      const onward = signed === 0 || Math.sign(signed) === heading
      // THE BACKWARD CATCH ONLY APPLIES TO A HOLD THIS GESTURE CROSSED.
      //
      // Otherwise it is not catching an overshoot, it is dragging a reader
      // back to a block they deliberately left -- and that reopened the
      // trap by a side door. Measured: a reader nudging the wheel every
      // 620ms drifted to 696, began the next gesture from there, and the
      // hold at 640 was then a mere 112 behind and inside SETTLE_BACK, so
      // the journey was reeled back. Ninety nudges travelled 35 to 697 and
      // never left the first block.
      //
      // Crossing is what tells the two apart. A genuine overshoot starts
      // one side of the hold and ends the other; a departure starts past
      // it and keeps going. (Starting exactly ON the hold is the departure
      // case and is already excluded above by LEAVING_RADIUS.)
      const crossed = departedFrom === null || Math.sign(h - departedFrom) !== Math.sign(signed)
      const reach = onward ? onwardReach : crossed ? SETTLE_BACK : 0
      const d = Math.abs(signed)
      if (d <= reach && d < bestGap) { bestGap = d; pick = h }
    }
    return pick
  })()

  if (settleTarget !== null) {
    const nearest = settleTarget
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
  heading = 1
  departedFrom = null
  sincePush = Infinity
  skyScroll.target = 0
  skyScroll.display = 0
  skyScroll.speed = 0
  skyScroll.velocity = 0
}
