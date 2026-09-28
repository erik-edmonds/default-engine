/** The sky journey's scroll axis, on its own so that nothing has to import a
 *  module that imports it back.
 *
 *  It lived in config/skyJourney.ts, which now imports config/flightFrame.ts --
 *  and flightFrame's heading table needs the axis length to author its last
 *  keyframe. That is a cycle, and an ES module cycle around a `const` is not
 *  benign: whichever module is entered first hits the other's import before its
 *  own declarations have been evaluated, so the constant is still in its
 *  temporal dead zone and reading it throws. One shared leaf breaks it without
 *  restating the number anywhere.
 *
 *  1500, up from 600. The sky section was over too quickly and its contents
 *  were bunched; everything that lives on this axis -- the caption cues, the
 *  avatar's choreography, the corridor's travel -- is expressed as a fraction
 *  of it or as a rate against it, so lengthening the axis spreads them rather
 *  than merely making the same arrangement take longer to scroll past. */
/** DOUBLED, together with the wheel's sensitivity.
 *
 *  The two changes are one change: "make the scroll happen twice as fast, but
 *  make the passage twice as long as well, so the scroll looks like it's going
 *  further but it doesn't make the trip any shorter." Sensitivity alone would
 *  halve the journey; this alone would double the work. Together the trip
 *  costs the same number of wheel gestures and covers twice the sky -- the
 *  corridor advances CORRIDOR_TRAVEL_PER_OFFSET per unit of this, so the
 *  distance actually flown goes from 150 world units to 300, and twice as many
 *  clouds go past on the way. */
export const SKY_JOURNEY_DISTANCE = 3000
