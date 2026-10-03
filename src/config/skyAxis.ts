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
/** 8200, UP FROM 3000, AND THE EXTRA LENGTH IS ALL INSIDE THE CARDS.
 *
 *  Each block of text is now a card that expands to fill the screen, holds
 *  while its own scene is scrolled through, and contracts again -- see
 *  skyCardState in config/skyJourney.ts. The INSIDE phase is a little over
 *  half of a block's turn, and it has to be long enough to be a scene rather
 *  than a beat: asked for explicitly as "a real scene each", two or three
 *  screens of scroll.
 *
 *  SKY_TEXT_ACTIVE rises with this, which is the other half of the change.
 *  Lengthening the axis alone would stretch the QUIET SKY between cards by
 *  the same factor, and the empty stretches are not what needed more room --
 *  at 0.82 the gap between one card departing and the next approaching stays
 *  about where it was (266 units against the old 205) and everything else the
 *  axis gained goes to the cards.
 *
 *  Nothing here needs the corridor retuned. A prop's depth is a fraction of
 *  its SECTION (see sectionPhase in PaperSky), not a rate against the axis,
 *  so one cloud still crosses per block however long a block takes. */
export const SKY_JOURNEY_DISTANCE = 8200
