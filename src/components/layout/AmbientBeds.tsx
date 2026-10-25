"use client"

import { useEffect, useState } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import { Howl } from "howler"
import { wireAudioFailures } from "@/helpers/sfx"
import { inSkyJourney, sfxBlocked, sfxEnabled } from "@/helpers/StateProvider"
import type { TimeOfDay } from "@/components/canvas/environmentPresets"

/** THE THREE AMBIENT BEDS, AND NOTHING ELSE.
 *
 *  These used to live inside SoundToggle, which is the button that switches
 *  them. That was fine for as long as the button was mounted in one place.
 *
 *  IT IS NOT. SiteMenu renders the toggle parked off-screen while the menu
 *  is shut, and inside the settings panel while it is open -- two different
 *  parents, which to React is an unmount and a fresh mount, not a move. So
 *  opening the settings tab ran SoundToggle's unmount cleanup, which is
 *  `waves.unload(); tides.unload(); clouds.unload()`, and the sound went off
 *  on its own before anyone touched the switch. It did not reliably come
 *  back either: three html5 Howls torn down and three more created in the
 *  same commit is exactly the race that leaves a Howl "stuck in 'loading'
 *  forever waiting for a free slot" that RainController.tsx documents.
 *
 *  SoundToggle's own comment already said the component had to stay mounted
 *  or the audio would be torn down. The fix is not to try harder to keep a
 *  button in one place -- it is for the audio not to be the button's to own.
 *  Mounted once, at the top of the page, for the life of the route.
 */

// Per-track, not shared: tides.mp3 is mastered far hotter than waves.mp3, so
// matching their gain made night blare against the day. Night is meant to sit
// just perceptibly above day as a background bed, not draw attention, which
// at these source levels means a much lower nominal number -- the two are not
// comparable as raw gains.
const AMBIENT_VOLUME = 0.35
const NIGHT_AMBIENT_VOLUME = 0.05
/** The paper world's own bed. Under the island's, because up there the only
 *  thing in earshot is air -- it should read as the island's sound having
 *  dropped away rather than as a second track arriving over it. */
const SKY_AMBIENT_VOLUME = 0.22
// Long enough to read as the tide coming in rather than a track change. The
// visual transition into night is far longer (AUTO_TRANSITION_SECONDS), so
// there's no risk of the audio outlasting the phase it belongs to.
const CROSSFADE_MS = 4000

export function AmbientBeds({ currentPhase }: { currentPhase: TimeOfDay }) {
  const enabled = useAtomValue(sfxEnabled)
  const setBlocked = useSetAtom(sfxBlocked)

  // Looping ambient beds, so retry:false -- the effect below starts them when
  // `enabled` says so, and slamming a 29MB stream back on at the moment the
  // page unlocks is not what the listener asked for.
  const [waves] = useState(() => wireAudioFailures(new Howl({
    src: ["/sound/waves.mp3"],
    volume: AMBIENT_VOLUME,
    loop: true,
    preload: false,
    // Howler's default (Web Audio API) decoding has to fetch AND fully
    // decode the whole file before any playback can start -- for a 29MB
    // file that's the multi-second delay before waves audibly starts.
    // html5: true switches to native <audio> streaming instead, which
    // starts as soon as the first chunk buffers.
    html5: true,
  }), "waves", { retry: false }))

  // Night's ambient bed. Starts silent: whichever track isn't current sits at
  // volume 0 rather than paused, so a crossfade can raise it from nothing
  // without a play() click at the top of the fade.
  const [tides] = useState(() => wireAudioFailures(new Howl({
    src: ["/sound/tides.mp3"],
    volume: 0,
    loop: true,
    preload: false,
    // 12MB, same streaming reasoning as waves.mp3 above.
    html5: true,
  }), "tides", { retry: false }))

  // The paper world's bed. Silent until the journey arrives, like tides.
  const [clouds] = useState(() => wireAudioFailures(new Howl({
    src: ["/sound/clouds.mp3"],
    volume: 0,
    loop: true,
    preload: false,
    html5: true,
  }), "clouds", { retry: false }))

  // currentPhase (useTimeOfDayCycle) only flips once a transition has fully
  // landed, so this goes true at the exact moment night arrives on screen --
  // which is where the crossfade should start.
  const isNight = currentPhase === "night"
  // `inSkyJourney` flips when the camera ARRIVES at the top of the climb,
  // not when the Poke Ball is clicked -- "after arriving in the sky". The
  // whole five-second ascent therefore still has the island underneath it,
  // and the beds change over as the paper world takes the screen.
  const inSky = useAtomValue(inSkyJourney)

  useEffect(() => {
    if (!enabled) {
      // Guarded on playing(): pausing a Howl that was never started still
      // makes Howler touch its underlying <audio> element, and with
      // html5 streaming that tears down an in-flight range request --
      // which Chrome reports as `net::ERR_ABORTED /sound/tides.mp3` in the
      // console. Nothing is actually broken by it, but it's noise, and
      // there's no reason to pause a track that never began.
      // ALL THREE BEDS, and forgetting the third is the bug behind "when I
      // turn the sound button off, the music doesn't turn off". The sky's
      // bed was added to the fade logic below but not to this early return,
      // so switching sound off while up in the paper world left clouds.mp3
      // playing with nothing able to stop it -- every later pass through
      // this effect hits the same early return and never reaches the fades.
      for (const bed of [waves, tides, clouds]) if (bed.playing()) bed.pause()
      return
    }

    // THREE BEDS, ONE RULE. The sky wins over the time of day: up there the
    // island's water is not in earshot whatever hour it is down below.
    const incoming = inSky ? clouds : isNight ? tides : waves
    const incomingVolume = inSky
      ? SKY_AMBIENT_VOLUME
      : isNight
        ? NIGHT_AMBIENT_VOLUME
        : AMBIENT_VOLUME

    const stops: ReturnType<typeof setTimeout>[] = []

    if (incoming.state() === "unloaded") incoming.load()
    const wasPlaying = incoming.playing()
    if (!wasPlaying) incoming.play()
    incoming.fade(incoming.volume(), incomingVolume, CROSSFADE_MS)

    // ...AND THEN MAKE SURE IT ACTUALLY GOT THERE.
    //
    // "On return to the earth, the island ambient noise doesn't start up
    // again, it's just silence." Measured across a round trip, reading
    // Howler's own state: on the island tides.mp3 playing at 0.05 and rising,
    // in the sky clouds.mp3 at 0.18, and back home waves.mp3 reporting
    // `playing: true` at volume `0`. The bed resumes and the ramp never
    // happens, which is silence that looks like it is working.
    //
    // A fade issued in the same tick as play() can be lost on these beds:
    // they are html5 streams, Howler applies a fade to the sounds currently
    // playing, and an <audio> element that has only just been told to start
    // has none yet -- so the fade is applied to nothing and the volume stays
    // where the last fade-out left it. The resume path is the one that hits
    // it, because that is the only one where the Howl was paused at zero.
    //
    // Asserted rather than re-architected: let the fade do its work, then
    // check. If it took, this is a no-op; if it was lost, the bed arrives a
    // beat late instead of never.
    stops.push(
      setTimeout(() => {
        if (incoming.playing() && incoming.volume() < incomingVolume - 0.01) {
          incoming.volume(incomingVolume)
        }
      }, CROSSFADE_MS + 80),
    )

    // Only fade an outgoing track if it's actually audible -- fading a
    // stopped Howl from 0 to 0 is a no-op that still schedules a timer.
    for (const outgoing of [waves, tides, clouds]) {
      if (outgoing === incoming || !outgoing.playing()) continue
      outgoing.fade(outgoing.volume(), 0, CROSSFADE_MS)
      // Pause once silent rather than leaving a second stream decoding
      // forever. Cleared below if the state flips back mid-fade, so a fast
      // bounce can't pause the track it just revived.
      stops.push(setTimeout(() => outgoing.pause(), CROSSFADE_MS))
    }

    return () => {
      for (const t of stops) clearTimeout(t)
    }
  }, [enabled, isNight, inSky, waves, tides, clouds])

  // Stop AND unload on unmount.
  //
  // This used to stop only, which leaves the <audio> element and its buffer
  // sitting in Howler's global pool -- and that pool is finite and shared
  // across every html5 Howl on the page. RainController.tsx documents the
  // failure it leads to ("a new html5 Howl can get stuck in 'loading' forever
  // waiting for a free slot (observed live)"); stop-without-unload is exactly
  // how orphaned instances accumulate across repeated route transitions.
  //
  // Safe to keep now that this component is mounted once for the life of the
  // route. It was the same cleanup, on a component that moved between two
  // parents in the tree, that was tearing the audio down mid-session.
  useEffect(() => () => {
    waves.unload()
    tides.unload()
    clouds.unload()
  }, [waves, tides, clouds])

  // A refused play() was silent in every sense: no handler, no log, and a UI
  // that went on animating as though sound were playing. Both tracks retry on
  // Howler's next unlock, and until then the flag stops the bars lying.
  useEffect(() => {
    const wire = (howl: Howl) => {
      const onError = () => {
        setBlocked(true)
        howl.once("unlock", () => { setBlocked(false); howl.play() })
      }
      howl.on("playerror", onError)
      return () => howl.off("playerror", onError)
    }
    const offWaves = wire(waves)
    const offTides = wire(tides)
    return () => { offWaves(); offTides() }
  }, [waves, tides, setBlocked])

  return null
}
