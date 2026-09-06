import { Howl } from "howler"

// One-shot UI sound effects, mirroring the Howl setup Speaker.tsx already
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

export function playSfx(name: SfxName) {
  const player = players[name]
  if (player.state() === "unloaded") player.load()
  player.play()
}
