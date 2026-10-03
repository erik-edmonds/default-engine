"use client"

import { useEffect, useRef, useState } from "react"
import { useAtomValue } from "jotai"

import { ACHIEVEMENTS } from "@/config/achievements"
import { achievementProgress, useAchievementCount } from "@/helpers/achievements"

/** The tabs, in order. */
const TABS = [
  { id: "settings", glyph: "⚙", label: "Settings" },
  { id: "achievements", glyph: "★", label: "Achievements" },
  { id: "help", glyph: "?", label: "How this works" },
] as const
type TabId = (typeof TABS)[number]["id"]

/** The tips, one per view, stepped through with the arrows.
 *
 *  Written as "here is what there is" rather than "do this, then this": the
 *  island rewards poking at, and a page that lists the answers turns it
 *  into a chore list. */
const TIPS: { title: string; body: string }[] = [
  {
    title: "Welcome",
    body: "An island you can wander around. Nothing here is a menu — the things worth finding are objects in the scene.",
  },
  {
    title: "Getting around",
    body: "Four rings mark the places you can stand. Click one and the camera flies there. On a phone, scroll instead — the rail on the right jumps straight to a destination.",
  },
  {
    title: "The three windows",
    body: "Three portals stand around the island. Double-click one to step through it, or press and hold on a touchscreen.",
  },
  {
    title: "Things that react",
    body: "Several objects do something when you click them. One changes the weather. One plays. One takes you off the island entirely.",
  },
  {
    title: "The sky",
    body: "There is a way up from the beach. Once you are up there, keep scrolling — the journey has an end, and something is waiting at it.",
  },
]

/** The menu button, and the modal behind it.
 *
 *  THE PANEL USED TO BE A DROPDOWN AND IT WAS WRONG TWICE OVER. `.site-menu`
 *  was a flex column holding both the button and the panel, so opening it
 *  grew the column and shoved the day/night cube down the screen -- the
 *  panel was in normal flow in a row that was supposed to be a row of
 *  buttons. And a dropdown is the wrong shape for three tabs of content.
 *
 *  Now the button is a plain 56px circle that matches SoundToggle's
 *  footprint exactly, and everything else is a centred modal built on
 *  MinimapOverlay's dialog shell -- role=dialog, aria-modal, Escape to
 *  close, focus moved in, body unmounted when shut, which is the only real
 *  dialog pattern in this repo.
 */
export function SiteMenu({ soundToggle }: { soundToggle: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<TabId>("settings")
  const { found, total } = useAchievementCount()

  return (
    <>
      <button
        type="button"
        className="site-menu-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Menu"
        onClick={() => setOpen(true)}
      >
        <span className="site-menu-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {/* The count rides the closed button, so there is a reason to open
            it. Hidden at zero: an empty score on arrival reads as a chore
            list rather than an invitation. */}
        {found > 0 && (
          <span className="site-menu-badge" aria-hidden="true">
            {found}
          </span>
        )}
      </button>

      {/* ALWAYS MOUNTED, because the sound toggle inside owns three Howl
          ambient beds and crossfades them -- unmounting it with the modal
          would tear the audio down every time the menu closed. It is parked
          off-screen while shut rather than removed. */}
      <div className="site-menu-keep" aria-hidden={!open || tab !== "settings"}>
        {!open || tab !== "settings" ? soundToggle : null}
      </div>

      {open && (
        <MenuModal
          tab={tab}
          onTab={setTab}
          onClose={() => setOpen(false)}
          soundToggle={soundToggle}
          found={found}
          total={total}
        />
      )}
    </>
  )
}

/** Its own component so that closing the menu UNMOUNTS it, which is what
 *  releases the focus and the key handler -- the same trick MinimapOverlay
 *  uses, and cheaper than effects that reach back to tidy up. */
function MenuModal({
  tab,
  onTab,
  onClose,
  soundToggle,
  found,
  total,
}: {
  tab: TabId
  onTab: (id: TabId) => void
  onClose: () => void
  soundToggle: React.ReactNode
  found: number
  total: number
}) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>("button.menu-tab")?.focus()
  }, [])

  return (
    <div className="menu-scrim" role="dialog" aria-modal="true" aria-label="Menu" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="menu-panel" ref={panel}>
        <div className="menu-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-label={t.label}
              className="menu-tab"
              data-on={tab === t.id ? "true" : "false"}
              onClick={() => onTab(t.id)}
            >
              <span aria-hidden="true">{t.glyph}</span>
            </button>
          ))}
          <button type="button" className="menu-tab menu-close" aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="menu-body">
          {tab === "settings" && <SettingsTab soundToggle={soundToggle} />}
          {tab === "achievements" && <AchievementsTab found={found} total={total} />}
          {tab === "help" && <HelpTab />}
        </div>
      </div>
    </div>
  )
}

/** PLACEHOLDERS, AND LABELLED AS SUCH IN THE CODE IF NOT ON SCREEN.
 *
 *  Quality and Renderer change their own value on click and do nothing
 *  else yet -- they exist so the shape of the panel is settled before the
 *  work of wiring them to the renderer begins. Audio is real: it is the
 *  same SoundToggle the corner used to hold, minus its white disc. */
function SettingsTab({ soundToggle }: { soundToggle: React.ReactNode }) {
  const [quality, setQuality] = useState<"High" | "Low">("High")
  const RENDERERS = ["WebGPU", "WebGL", "Auto"] as const
  const [renderer, setRenderer] = useState<(typeof RENDERERS)[number]>("WebGPU")

  return (
    <>
      <h2 className="menu-title">Options</h2>
      <dl className="menu-rows">
        <dt>Audio</dt>
        <dd className="menu-audio">{soundToggle}</dd>

        <dt>Quality</dt>
        <dd>
          <button type="button" className="menu-value" onClick={() => setQuality((q) => (q === "High" ? "Low" : "High"))}>
            {quality}
          </button>
        </dd>

        <dt>Renderer</dt>
        <dd>
          <button
            type="button"
            className="menu-value menu-value-live"
            onClick={() => setRenderer((r) => RENDERERS[(RENDERERS.indexOf(r) + 1) % RENDERERS.length])}
          >
            {renderer}
          </button>
        </dd>
      </dl>
    </>
  )
}

function AchievementsTab({ found, total }: { found: number; total: number }) {
  const progress = useAtomValue(achievementProgress)
  return (
    <>
      <h2 className="menu-title">Achievements</h2>
      <p className="menu-count">
        {found} / {total}
      </p>
      <ul className="menu-achievements">
        {ACHIEVEMENTS.map((a) => {
          const at = progress.get(a.id) ?? 0
          const done = at >= a.target
          return (
            <li key={a.id} data-found={done ? "true" : "false"}>
              <div className="menu-achievement-head">
                {/* Locked ones keep their name back -- the nudge is the
                    point, and a list of answers is not a thing to find. */}
                <strong>{done ? a.title : "???"}</strong>
                <span className="menu-achievement-count">
                  {done && <span aria-hidden="true">✓ </span>}
                  {at}/{a.target}
                </span>
              </div>
              <p>{done ? a.detail : a.how}</p>
              {/* A bar only where there is something to fill. A 1/1 bar is
                  a tick wearing a progress bar's clothes. */}
              {a.target > 1 && (
                <div className="menu-bar">
                  <div style={{ width: `${Math.round((at / a.target) * 100)}%` }} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

function HelpTab() {
  const [at, setAt] = useState(0)
  const tip = TIPS[at]
  return (
    <>
      <h2 className="menu-title">{tip.title}</h2>
      <p className="menu-tip">{tip.body}</p>
      <div className="menu-arrows">
        <button
          type="button"
          className="menu-arrow"
          aria-label="Previous tip"
          disabled={at === 0}
          onClick={() => setAt((i) => Math.max(0, i - 1))}
        >
          ‹
        </button>
        <span className="menu-arrow-count">
          {at + 1} / {TIPS.length}
        </span>
        <button
          type="button"
          className="menu-arrow"
          aria-label="Next tip"
          disabled={at === TIPS.length - 1}
          onClick={() => setAt((i) => Math.min(TIPS.length - 1, i + 1))}
        >
          ›
        </button>
      </div>
    </>
  )
}
