import { useCallback } from "react"
import { useAtomValue } from "jotai"
import { sfxEnabled } from "@/helpers/StateProvider"
import { playSfx, type SfxName } from "@/helpers/sfx"

// Gates playSfx() on the master sound switch -- nothing plays until a
// visitor has explicitly turned sound on via SoundToggle.tsx.
export function useSfx() {
  const enabled = useAtomValue(sfxEnabled)
  return useCallback(
    (name: SfxName) => {
      if (enabled) playSfx(name)
    },
    [enabled]
  )
}
