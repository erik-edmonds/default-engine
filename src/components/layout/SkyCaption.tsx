"use client";

import { SKY_TEXT_CUES } from "@/config/skyJourney";

/** The sky journey's text, for screen readers.
 *
 *  The visible words are in the scene now -- see SkyCaptionBillboard, and the
 *  note there for why. That block is drei's Html in `transform` mode, which is
 *  a CSS-3D-transformed subtree carried by a node in the 3D graph: fine for
 *  type, no place at all for the accessible copy, and marked aria-hidden for
 *  exactly that reason.
 *
 *  So this is what is left of the DOM component -- the live region, announcing
 *  each block as it becomes current. It has been the thing keeping the cues
 *  reachable since they were paper signs, which a screen reader could not see
 *  either. */
export function SkyCaption({ index }: { index: number }) {
  const cue = SKY_TEXT_CUES[index];
  return (
    <div role="status" aria-live="polite" className="sky-caption-sr sr-only">
      {cue && (
        <p>
          {cue.eyebrow}. {cue.text}. {cue.body}
        </p>
      )}
    </div>
  );
}
