"use client"
import { themes } from "@/helpers/Interfaces";
import { useAppState, inSkyJourney, goHomeRequest, titleScreenActive } from "@/helpers/StateProvider";
import { useAtomValue, useSetAtom } from "jotai";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function Favicon() {
  const { theme } = useAppState()
  const journeyActive = useAtomValue(inSkyJourney)
  const titleActive = useAtomValue(titleScreenActive)
  // titleScreenActive now defaults to true so the button is never painted over
  // the loading screen. Only the island route has a title screen, though --
  // /portfolio and the project pages have no way home without this button, and
  // nothing there ever clears the atom.
  //
  // "/item/:id" counts as the island route, and missing that is what broke this
  // button inside a portal: the handler below stopped intercepting, the button
  // reverted to a plain link to "/", and pressing home inside a portal did a
  // NAVIGATION back to the island instead of asking the scene to step out --
  // dumping you at the home position with the portal behind you. Both paths
  // render the same scene, so both have to count as being in it.
  //
  // What this comment used to claim -- that wouter's push is mirrored into
  // usePathname() -- is FALSE. wouter calls history.pushState directly; Next's
  // usePathname reads its own PathnameContext, which only Next's router writes.
  // So after entering a portal this still returns "/". Harmless, because "/"
  // also satisfies the test, but it means the /item/ branch only ever fires on
  // a hard load of a shared link. Do not build anything on it.
  //
  // `?? ""` because usePathname() is typed non-null but can be null under some
  // prerender conditions -- and this component is mounted in the root layout
  // OUTSIDE the Suspense boundary, so a throw here takes the whole page down
  // rather than just the button.
  const pathname = usePathname() ?? ""
  const onIslandRoute = pathname === "/" || pathname.startsWith("/item/")
  const hidden = onIslandRoute && titleActive
  const requestGoHome = useSetAtom(goHomeRequest)

  return (
    <Link
      href="/"
      aria-label="Home"
      onClick={(e) => {
        // On the island, "home" is a place in the scene, not a URL. The href
        // points at the page you are already on, so following it does nothing
        // at all -- which at a hotspot made this button look broken: visible,
        // clickable, and completely inert. Hand it to the camera instead.
        // Elsewhere (/portfolio and the project pages) the href is the whole
        // point and is left alone.
        if (journeyActive || onIslandRoute) {
          e.preventDefault()
          requestGoHome((n) => n + 1)
        }
      }}
      // No hover sound. The click cue is reserved for things in the 3D scene
      // (hotspot rings and the clickable props); chrome that's on screen the
      // whole time chirping as the pointer crosses it is noise.
      style={{
        visibility: hidden ? "hidden" : "visible",
        opacity: hidden ? 0 : 1,
        transition: "opacity 0.3s ease",
        // Reported three times as "the home button disappears". It never does
        // -- there is exactly one hide path (titleScreenActive, above) and it
        // was not firing. What actually happens is that the disc's fill flips
        // black<->white with the time of day (helpers/Interfaces.tsx), so at
        // evening and night it is a WHITE disc, and over a bright sky or the
        // pale water inside a portal that reads as gone.
        //
        // The same answer the cursor uses for the same problem: trace a contour
        // with four 1px offset shadows in the opposite tone, then one soft pass
        // to stop it looking like a sticker. Works at every phase and over any
        // background, without giving up the themed colours.
        filter: [
          "drop-shadow(1px 0 0 var(--logo-edge))",
          "drop-shadow(-1px 0 0 var(--logo-edge))",
          "drop-shadow(0 1px 0 var(--logo-edge))",
          "drop-shadow(0 -1px 0 var(--logo-edge))",
          "drop-shadow(0 2px 10px rgba(0,0,0,0.45))",
        ].join(" "),
        // The contour is the opposite tone to the disc, so it separates
        // whichever way round the theme has it.
        ["--logo-edge" as string]: themes[theme]["background"] === "white"
          ? "rgba(8,20,28,0.85)"
          : "rgba(255,255,255,0.9)",
      }}
    >
      <svg width={56} height={56} viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
          <circle cx="70" cy="70" r="70" fill={themes[theme]["background"]}/>
          <g fill={themes[theme]["lines"]}>
              <path d="M70 10 L114 35 L70 60 Z"/>
              <path d="M117 40 L117 96 L70 67 Z"/>
              <path d="M114 102 L70 128 L70 74 Z"/>
              <path d="M22 35 L65 10 L64 60 Z"/>
              <g transform="translate(45,0) rotate(30)">
                  <rect x="8" y="58" width="42" height="6" rx="4" />
                  <rect x="21" y="73" width="35" height="6" rx="4"/>
                  <rect x="27" y="88" width="42" height="6" rx="4"/>
              </g>
          </g>
      </svg>
    </Link>
  );
}