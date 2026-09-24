/** The sky journey's scroll axis, on its own so that nothing has to import a
 *  module that imports it back.
 *
 *  It lived in config/skyJourney.ts, which now imports config/flightFrame.ts --
 *  and flightFrame's heading table needs the axis length to author its last
 *  keyframe. That is a cycle, and an ES module cycle around a `const` is not
 *  benign: whichever module is entered first hits the other's import before its
 *  own declarations have been evaluated, so the constant is still in its
 *  temporal dead zone and reading it throws. One shared leaf breaks it without
 *  restating the number anywhere. */
export const SKY_JOURNEY_DISTANCE = 600
