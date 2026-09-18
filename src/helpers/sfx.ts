import { Howl } from "howler"

// One-shot UI sound effects, mirroring the Howl setup Guitar.tsx already
// uses for music.mp3 -- lazy (preload: false) so these small files still
// don't load until first played, same reasoning as the (much larger)
// music/ambient tracks.
export type SfxName = "click" | "whoosh" | "boing"

const players: Record<SfxName, Howl> = {
  click: new Howl({ src: ["/sound/click.mp3"], volume: 0.4, preload: false }),
  whoosh: new Howl({ src: ["/sound/whoosh.mp3"], volume: 0.5, preload: false }),
  // The "that goes nowhere" sound: played instead of whoosh when a control is
  // aimed at the place the camera is already parked.
  boing: new Howl({ src: ["/sound/boing.mp3"], volume: 0.5, preload: false }),
}

/** Set when a play() is refused and we are waiting on Howler's unlock.
 *
 *  Every sound in this app is gated behind the Enter click, which is a real
 *  user gesture -- but the first play() of several of them happens in an effect
 *  on a later commit, and Safari and iOS can have stopped honouring the gesture
 *  by then. With no handler registered, a refusal was completely invisible:
 *  `sfxEnabled` still read true, the equalizer bars still animated, and nothing
 *  was audible, with no way to diagnose or retry. */
let blocked = false

/** True while audio has been refused and has not yet been unlocked. The sound
 *  UI reads this so it stops claiming to be playing something. */
export function audioBlocked() {
  return blocked
}

function attach(player: Howl) {
  if ((player as Howl & { __wired?: boolean }).__wired) return
  ;(player as Howl & { __wired?: boolean }).__wired = true
  player.on("playerror", () => {
    blocked = true
    // Howler emits "unlock" on the next successful user gesture; replaying
    // there is exactly what onplayerror exists for.
    player.once("unlock", () => {
      blocked = false
      player.play()
    })
  })
  player.on("loaderror", (_id, error) => {
    console.error("[sfx] failed to load", error)
  })
}

export function playSfx(name: SfxName) {
  const player = players[name]
  attach(player)
  if (player.state() === "unloaded") player.load()
  player.play()
}
