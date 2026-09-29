/** The film-grain effect instance, once the composer has built it.
 *
 *  Module state, and for a specific reason rather than convenience: the
 *  effect is created inside <EffectComposer> in app/page.tsx, and the thing
 *  that drives it (components/canvas/SkyGrain) is a frame loop somewhere
 *  else in the canvas. Passing the ref down as a prop is the obvious wiring
 *  and it is the one the compiler rejects -- a ref that arrives through
 *  render belongs to the caller, and react-hooks/immutability will not have
 *  it written from a frame callback. helpers/skyScroll and
 *  helpers/skyCaptionBox are the same shape for the same reason.
 *
 *  Only ever holds the effect; how much grain to show is computed per frame
 *  from the camera's altitude and written straight onto the uniform. */
export const skyGrain = {
  effect: null as { blendMode: { opacity: { value: number } } } | null,
}
