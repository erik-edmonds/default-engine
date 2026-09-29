"use client"

import { useEffect, useRef, useState } from "react"

import { CONTACT_LINKS } from "@/config/portals"
import { skyCaptionBox } from "@/helpers/skyCaptionBox"
import { skyScroll } from "@/helpers/skyScroll"
import { SKY_CONTACT_REVEAL } from "@/config/skyJourney"

/** The one part of the sky journey you can actually use.
 *
 *  "For the contact the camera shouldn't move forward, it should stay there
 *  with the text, because that's the contact part, the user needs to be able
 *  to interact with it."
 *
 *  Everything else out here is scenery flown past; this is a destination. The
 *  journey's scroll now stops at the last block's hold (SKY_SCROLL_LIMIT), so
 *  the camera is parked and steady by the time any of this is on screen --
 *  which is what makes a DOM overlay safe here and nowhere else in the
 *  sequence. A panel pinned over a moving camera swims against the scene; a
 *  panel over a stopped one is simply part of the picture.
 *
 *  THE PROSE STAYS IN THE SCENE and only the actions are DOM. The block of
 *  words is a canvas texture on a plane in the corridor, which is the whole
 *  reason the Dragonite can pass in front of it -- rebuilding it in HTML to
 *  make it clickable would undo that. So the texture keeps the heading and
 *  the paragraph, and these three links sit underneath it, aligned against
 *  the box the scene reports frame by frame (see helpers/skyCaptionBox)
 *  rather than against a percentage of the viewport that would only be right
 *  at one window size.
 *
 *  Positioned from a requestAnimationFrame loop writing straight to style,
 *  not from React state: the box moves every frame while the journey is still
 *  settling, and re-rendering a component sixty times a second to move a div
 *  is the thing module state exists to avoid. Only the shown/hidden flip goes
 *  through React, and that happens twice a visit. */
export function SkyContact() {
  const panel = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  const shownRef = useRef(false)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const node = panel.current
      // Near the end of the journey AND the block is actually being drawn.
      // Both, because the scroll can be parked while the words are still
      // coming in, and a row of buttons that arrives before the heading it
      // belongs to reads as a bug.
      const near = skyScroll.display >= SKY_CONTACT_REVEAL && skyCaptionBox.visible
      if (near !== shownRef.current) {
        shownRef.current = near
        setShown(near)
      }
      if (!node || !near) return
      // Left edge with the words, and immediately under them. The block is
      // set ragged toward the middle of the picture, so its left edge is the
      // one that reads as a margin.
      node.style.transform = `translate3d(${Math.round(skyCaptionBox.left)}px, ${Math.round(skyCaptionBox.bottom + 22)}px, 0)`
      node.style.width = `${Math.round(skyCaptionBox.right - skyCaptionBox.left)}px`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      ref={panel}
      className="sky-contact"
      data-shown={shown ? "true" : "false"}
      // Hidden from the reader AND from the tab order until the journey is
      // actually there: a set of links floating over the island, reachable by
      // keyboard and announced by a screen reader, is worse than no links.
      aria-hidden={!shown}
    >
      {CONTACT_LINKS.map((link) => (
        <a
          key={link.href}
          className="sky-contact-link"
          href={link.href}
          tabIndex={shown ? 0 : -1}
          {...(link.href.startsWith("http")
            ? { target: "_blank", rel: "noreferrer noopener" }
            : {})}
        >
          {link.label}
        </a>
      ))}
    </div>
  )
}
