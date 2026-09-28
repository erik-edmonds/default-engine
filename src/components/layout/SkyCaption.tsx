"use client";

import { SKY_TEXT_CUES } from "@/config/skyJourney";

/** The sky journey's text, set in the DOM opposite the subject.
 *
 *  This replaces the paper signs that used to hang in the scene. A sign is a
 *  prop with words on it: it has to hold station at a readable depth, it can
 *  only carry three or four words before the type is too small, and whatever
 *  else is in the frame has to be arranged around it. The reference does none
 *  of that -- it sets an eyebrow, a headline and a paragraph in one half of the
 *  frame and leaves the other half to the picture.
 *
 *  The camera does its part of the bargain: see skyTextFocus in
 *  config/skyJourney.ts, which is the same span table this reads, used there to
 *  lean the aim toward whichever side the block is on. So the subject is pushed
 *  out of this block's half rather than the block being squeezed around it.
 *
 *  It is also the accessible copy of the cues. The 3D text never was -- it was
 *  shadowed by a second, invisible live region saying the same words -- and the
 *  duplicate is gone with the signs. */
export function SkyCaption({ index }: { index: number }) {
  const cue = SKY_TEXT_CUES[index];
  const side = cue?.side ?? -1;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sky-caption"
      data-side={side < 0 ? "left" : "right"}
    >
      {/* Keyed on the index so the block is a NEW element per cue: the fade is
          a CSS entry animation, and without a fresh key React would reuse the
          node and swap its text mid-fade. */}
      {cue && (
        <article key={index} className="sky-caption-block">
          <p className="sky-caption-eyebrow">{cue.eyebrow}</p>
          <h2 className="sky-caption-heading">{cue.text}</h2>
          <p className="sky-caption-body">{cue.body}</p>
        </article>
      )}
    </div>
  );
}
