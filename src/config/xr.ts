/** Every number the VR island is tuned by, in one table.
 *
 *  Here rather than beside their use for the same reason config/journey.ts
 *  and config/paperSky.ts exist: these are the values someone will want to
 *  change after five minutes in a headset, and hunting them across six
 *  components with a headset on is not a thing anyone should have to do.
 */

/** The camera's near plane in a session, in world units.
 *
 *  The island renders at 0.5, which is a composition decision for a camera
 *  that never approaches anything. Worn, 0.5 units is roughly half a metre
 *  in front of the eyes: hands, controllers and anything leaned toward are
 *  clipped away. three copies camera.near verbatim into both eye cameras, so
 *  the desktop value cannot simply be left in place.
 *
 *  Not smaller than this without reason -- near/far sets depth precision,
 *  and the island's far plane is a long way out. */
export const XR_NEAR = 0.05

/* THERE IS NO XR EXPOSURE CONSTANT, AND THERE MUST NOT BE ONE.
 *
 * This file briefly carried `XR_TONE_EXPOSURE = 1.15`, copied from the 404
 * page. A probe measured 1.063 with it set, which is how the mistake was
 * caught: Environment.tsx writes `gl.toneMappingExposure = b.exposure` EVERY
 * FRAME, blending between the time-of-day presets (0.76 at dusk through 1.12
 * at noon). A constant written once in the transition is overwritten on the
 * next frame and does nothing, and a constant written every frame would
 * flatten the island's day/night grade to a single stop.
 *
 * Exposure is already right in a session, for free, because Environment's
 * useFrame runs at priority 0 and nothing about it changes when the composer
 * stops. Only the tone-mapping MODE needs setting -- see XrTransition step 4.
 */

/** How long the desktop is left in `settling` after a session ends.
 *
 *  Exists for PerformanceMonitor. Exiting a session resizes the canvas,
 *  rebuilds the composer's buffers and re-renders the full island in one
 *  frame; the spike is large and has nothing to do with the machine's
 *  steady-state capability. Sampling it would ratchet dprCeiling down for
 *  the rest of the page's life. So the monitor is unmounted for the whole
 *  session and remounted only after this delay. */
export const XR_SETTLE_MS = 1200
