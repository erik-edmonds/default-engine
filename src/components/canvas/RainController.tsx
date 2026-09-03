"use client"

import { useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Howl } from 'howler'

import { raining, rainRequest, sfxEnabled } from '@/helpers/StateProvider'
import { Rain } from '@/components/canvas/Rain'

const RAIN_HOLD_MS = 4000 // full-strength duration
const RAIN_FADE_MS = 2500 // how long the rain takes to ease out afterward
const RAIN_SOUND_VOLUME = 0.5

// The single owner of the rain lifecycle. Mounted once for the whole scene
// (Scene.tsx), not per-Clouds-instance.
//
// This used to live inside Clouds (Sky.tsx), which had two bugs that compounded
// into "sometimes the rain never stops":
//
//  1. The hold timer's effect was keyed on a boolean `clicked`. Clicking a
//     cloud again during the 2.5s fade called setClicked(true) on state that
//     was already true -- React bails out of that, so the effect never re-ran
//     and no new 4s hold timer was ever armed. The fade timer would then
//     unmount the particles while the `raining` atom (whose ONLY false-writer
//     was that hold timer) stayed true, leaving RainScene.jsx's DOM overlay at
//     opacity-100 forever with its 120ms canvas-readback interval still
//     running. Keying off a monotonically increasing counter instead is what
//     makes a repeat click restartable.
//  2. Scene.tsx mounts two <Clouds> groups. Each kept private clicked/fading
//     state, private timers and its own rain Howl, but both wrote the same
//     global `raining` atom -- so one group's timer could clear an atom the
//     other had just raised, and two rain sounds could overlap. One owner,
//     one timer, one Howl.
export function RainController() {
  const request = useAtomValue(rainRequest)
  const masterOn = useAtomValue(sfxEnabled)
  const setRaining = useSetAtom(raining)

  const [active, setActive] = useState(false)
  const [fading, setFading] = useState(false)

  const [rainSound] = useState(() => new Howl({
    src: ['/sound/rain.wav'],
    volume: RAIN_SOUND_VOLUME,
    preload: false,
    // Deliberately NOT html5:true (unlike waves.mp3/music.mp3) -- that mode
    // exists to avoid a slow multi-second decode for large COMPRESSED files,
    // which doesn't apply to an uncompressed PCM .wav (near-instant to decode
    // regardless of size). html5 mode also pulls from a shared, limited pool
    // of <audio> elements across every Howl on the page; under React
    // StrictMode's dev-only double-mounting, that pool gets exhausted by
    // orphaned instances and a new html5 Howl can get stuck in "loading"
    // forever waiting for a free slot (observed live). Default Web Audio API
    // mode sidesteps the shared pool entirely.
  }))

  // The hold. Re-arms from scratch on every request, so a click landing
  // mid-fade cancels the fade and buys another full RAIN_HOLD_MS.
  useEffect(() => {
    // Same "counter atom starts at 0, only >0 means a real trigger fired"
    // convention as thunder/goHomeRequest -- skips the initial mount.
    if (request === 0) return
    setActive(true)
    setFading(false)
    setRaining(true)
    const hold = setTimeout(() => {
      setFading(true)
      // The atom flips here, not at the end of the fade: RainScene.jsx runs
      // its own 2.5s CSS opacity transition off this edge, so it needs to
      // start when the in-canvas fade does, not when it finishes.
      setRaining(false)
    }, RAIN_HOLD_MS)
    return () => clearTimeout(hold)
  }, [request, setRaining])

  // The fade-out. Cleared by the effect above if a new request arrives first.
  useEffect(() => {
    if (!fading) return
    const fade = setTimeout(() => {
      setActive(false)
      setFading(false)
    }, RAIN_FADE_MS)
    return () => clearTimeout(fade)
  }, [fading])

  // Same masterOn gating Speaker.tsx uses for music.mp3 -- respects the
  // SoundToggle mute switch instead of always playing regardless of it.
  useEffect(() => {
    if (!active || !masterOn) {
      rainSound.pause()
      return
    }
    if (rainSound.state() === 'unloaded') rainSound.load()
    // Undoes the previous cycle's fade-to-0 below, so a fresh request starts
    // at full volume again instead of silently staying at 0.
    rainSound.volume(RAIN_SOUND_VOLUME)
    rainSound.play()
  }, [active, masterOn, rainSound])

  // Mirrors the visual rain's own fade (Rain.tsx's gsap opacity tween) so the
  // sound eases out over the same window instead of cutting off abruptly.
  useEffect(() => {
    if (fading) rainSound.fade(rainSound.volume(), 0, RAIN_FADE_MS)
  }, [fading, rainSound])

  // Same orphaned-Howl risk Speaker.tsx/SoundToggle.tsx guard against.
  useEffect(() => () => { rainSound.stop() }, [rainSound])

  // Belt and braces: if this ever unmounts mid-storm, don't strand the DOM
  // overlay on. Nothing else writes `raining` false. (jotai's useSetAtom
  // setter is stable for a stable atom, so this runs its cleanup once, on
  // real unmount, rather than on every render.)
  useEffect(() => () => { setRaining(false) }, [setRaining])

  if (!active) return null
  return <Rain count={2000} fading={fading} fadeSeconds={RAIN_FADE_MS / 1000} />
}
