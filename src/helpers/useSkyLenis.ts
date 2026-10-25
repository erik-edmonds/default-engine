"use client"

import { useEffect } from "react"
import Lenis from "lenis"

import { publishSkyDisplay, publishSkyTarget, resetSkyScroll, skyScroll } from "@/helpers/skyScroll"
import { SKY_SCROLL_LIMIT, skyDriftSide, skyEdgeCloudGain, skyTextFocus } from "@/config/skyJourney"

/** THE SKY JOURNEY'S SCROLL.
 *
 *  One Lenis instance, alive only while the reader is up in the paper world,
 *  driving the real document -- which is tall during the journey because
 *  app/page.tsx renders a spacer for it. See skyScroll.ts for what this
 *  replaced and why.
 *
 *  ITS OWN requestAnimationFrame, and that is not the first thing I tried.
 *  Driving `lenis.raf` from `gsap.ticker` looks tidier -- GSAP is already
 *  this project's tween engine in ten files and already ticks every frame --
 *  but measured, it does not run: the document scrolled, Lenis's own
 *  `targetScroll` updated on each wheel event, and `lenis.scroll` sat at
 *  zero forever, which is exactly the signature of a Lenis whose rAF is
 *  never called. Its wheel handler writes the target directly; everything
 *  after that -- the easing, syncing to a programmatic scroll, clamping --
 *  happens in the frame callback.
 *
 *  NOTHING SNAPS. There is deliberately no magnet, no settle and no
 *  scroll-to-nearest-beat: "none -- free scrolling". Lenis coasts and stops
 *  wherever it is left.
 */

/** How many viewport-heights the whole journey takes.
 *
 *  THE JOURNEY USED TO BE NINETY-SIX SCREENS LONG. The old synthetic axis
 *  moved 0.133 journey units per wheel pixel, which over an 11500-unit axis
 *  is about 86,000 pixels of wheel -- call it ninety-six screenfuls. That is
 *  a large part of "hard to move through" on its own, quite apart from the
 *  magnets.
 *
 *  At 24 the proportions are untouched -- every beat keeps its share of the
 *  axis -- and the whole thing is about four times quicker to cross. This is
 *  the one number that sets the pace; nothing else needs to move with it. */
export const SKY_SCROLL_SCREENS = 24

export function useSkyLenis(active: boolean) {
  useEffect(() => {
    if (!active) return

    const lenis = new Lenis({
      // LAMBDA IS lerp * 60 AND TAU IS ITS RECIPROCAL -- Lenis damps with
      // 1 - exp(-lambda * dt), so this is frame-rate independent and the
      // number means something: 0.18 is tau 93ms, 90% of a step in 213ms,
      // settled in about 0.43s.
      //
      // IT WAS 0.09, which is tau 185ms and 99% at 853ms -- "laggy, floaty".
      // The comment here used to read "0.9 is about a second of coast",
      // describing a value that was not in the file; the second of coast was
      // real enough, it was just the fault being reported.
      //
      // NOT HIGHER THAN THIS. Past about 0.28 a single wheel notch -- 100 to
      // 120px arriving in one event -- is delivered in three frames, which is
      // the raw native scroll the smoothing exists to round off; and
      // skyScroll.speed, which drives the velocity lines and the card's
      // lean, gets noisy with it.
      lerp: 0.18,
      wheelMultiplier: 1,
      // TOUCH GOES THROUGH THE SAME PATH AS THE WHEEL.
      //
      // Without this Lenis leaves touch to the browser: the finger drives
      // native momentum while this rAF samples whatever the document
      // happens to be doing, so the scene sees a signal nobody damped. That
      // is the whole of "jumpy on phone" -- the two inputs were not the same
      // mechanism and did not feel like each other.
      //
      // With it, a move while the finger is down is applied at lerp 1 -- the
      // content tracks the finger exactly -- and only the flick after release
      // is eased. `touchMultiplier` was 1.4 and was DEAD CODE: it is only
      // read on the virtual path, which was off. Turning the path on makes
      // it live, and 1.4 would mean the content outruns the finger by forty
      // per cent with nothing left to hide it.
      syncTouch: true,
      touchMultiplier: 1,
      syncTouchLerp: 0.1,
      // No rubber-band at either end: the journey has hard limits and
      // bouncing against a frozen scene reads as a bug.
      overscroll: false,
      // The journey has an end (SKY_SCROLL_LIMIT parks on the contact beat)
      // and wrapping past it would be nonsense.
      infinite: false,
    })

    // THE AXIS IS A FRACTION OF THE DOCUMENT, not a count of pixels. The
    // spacer's height is expressed in viewport units, so on a short window
    // there is less document -- and the journey must still be the same
    // journey, just crossed in fewer pixels.
    //
    // MAPPED ONTO SKY_SCROLL_LIMIT, NOT THE AXIS LENGTH. The journey ends
    // parked on the contact beat at 11240 of 11500, and this used to map the
    // document onto the full 11500 and then clamp -- so the clamp bit at
    // 97.74% of the document and the last half-screen of scrolling moved the
    // scrollbar and changed nothing on screen: "the end does nothing". Now
    // the end of the document IS the end of the journey, by construction,
    // and one constant says where that is.
    //
    // `lenis.limit` RATHER THAN THE DOM. It is Lenis's own measurement, kept
    // current by its ResizeObserver, so this costs nothing -- where
    // `scrollHeight - innerHeight` was two forced layout reads per frame, on
    // each of the two calls below.
    const toAxis = (px: number) =>
      lenis.limit > 0 ? Math.min(SKY_SCROLL_LIMIT, (px / lenis.limit) * SKY_SCROLL_LIMIT) : 0
    /** The inverse. Used to re-anchor across a resize, and by the probes to
     *  seek to an offset rather than to a guessed pixel. */
    const fromAxis = (offset: number) =>
      SKY_SCROLL_LIMIT > 0 ? (offset / SKY_SCROLL_LIMIT) * lenis.limit : 0

    let raf = 0
    let last = performance.now()
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick)
      lenis.raf(time)
      const delta = (time - last) / 1000
      last = time
      publishSkyTarget(toAxis(lenis.targetScroll))
      publishSkyDisplay(toAxis(lenis.scroll), delta)
    }
    raf = requestAnimationFrame(tick)

    // RE-ANCHOR ON THE AXIS, NOT ON THE PIXEL.
    //
    // The offset is the state the scene is drawn from; the scroll position is
    // only a view of it. When a phone's URL bar retracts, the viewport grows,
    // the document's height and `limit` both change, and a held pixel
    // position means a different offset -- measured, a 844 -> 760 toolbar
    // event threw the scene forward by about 1270 units mid-journey. So keep
    // the offset and move the pixel to match.
    //
    // `lenis.resize()` first, because it bypasses Lenis's own 250ms debounce
    // and puts its three internal scroll values back on the document; the
    // scrollTo after it is what puts all of them back on the axis.
    const reanchor = () => {
      const keep = skyScroll.target
      lenis.resize()
      lenis.scrollTo(fromAxis(keep), { immediate: true, force: true })
      publishSkyTarget(keep)
      publishSkyDisplay(keep, 0)
    }
    let settle = 0
    const defer = () => {
      cancelAnimationFrame(settle)
      settle = requestAnimationFrame(reanchor)
    }
    window.addEventListener("resize", defer)
    window.addEventListener("orientationchange", defer)
    // The event that actually fires for an iOS toolbar retraction; `resize`
    // alone does not, on every version.
    window.visualViewport?.addEventListener("resize", defer)

    // Entering the sky from a scrolled island would start the journey
    // part-way through it.
    window.scrollTo(0, 0)
    lenis.scrollTo(0, { immediate: true })
    resetSkyScroll()
    // AND ONE MEASUREMENT AFTER LAYOUT. The spacer mounts in the same commit
    // as this effect, so on the first frames `lenis.limit` can still be 0 --
    // and a wheel arriving then maps through a limit of 0 and is swallowed.
    const first = requestAnimationFrame(() => lenis.resize())

    // EXPOSED, deliberately. The probes drive this journey, and grinding
    // six thousand units of axis a wheel notch at a time is the difference
    // between a check that runs and one that does not -- the no-gap sweep
    // needs a hundred and sixty samples across section 3. `lenis.scrollTo`
    // is also the only way to seek: a bare `window.scrollTo` is overridden
    // by Lenis on its next frame, which is a trap worth not leaving behind.
    // `fromAxis` goes with it so a probe can seek to an OFFSET and not have
    // to re-derive the document mapping it is trying to test.
    const w = window as unknown as {
      __skyLenis?: Lenis
      __skyToPx?: (offset: number) => number
      __skyProbe?: unknown
    }
    w.__skyLenis = lenis
    w.__skyToPx = fromAxis
    // THE PURE FUNCTIONS, so a check can sweep the axis at one-unit
    // resolution in milliseconds instead of scrolling twenty-six hundred
    // real frames to see the same thing. The continuity of the drift is the
    // whole of this round's subject matter and it is not something a
    // frame-rate sampler can resolve: the fault it replaces was one frame
    // wide.
    w.__skyProbe = {
      drift: skyDriftSide,
      focus: skyTextFocus,
      edgeGain: skyEdgeCloudGain,
      toAxis,
      fromAxis,
      limit: SKY_SCROLL_LIMIT,
    }

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(settle)
      cancelAnimationFrame(first)
      window.removeEventListener("resize", defer)
      window.removeEventListener("orientationchange", defer)
      window.visualViewport?.removeEventListener("resize", defer)
      delete w.__skyLenis
      delete w.__skyToPx
      delete w.__skyProbe
      lenis.destroy()
      resetSkyScroll()
      // The spacer unmounts with the journey; leaving the document scrolled
      // would strand the island's own navigation part-way along its axis.
      window.scrollTo(0, 0)
    }
  }, [active])

  return skyScroll
}
