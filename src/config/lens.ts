/** Everything the lens panel SAYS, separated from everything it does.
 *
 *  The panel is a chat window hanging off a glowing orb; the words in it are
 *  the part most likely to change, and the part least likely to be changed by
 *  whoever is editing the component. Keeping them here means rewording the
 *  assistant never involves opening a file full of SVG path maths.
 */

/** She has a name. The panel never prints "the assistant" or "AI" at the
 *  visitor, because a thing with a name is easier to talk to than a category.
 *
 *  Deliberately NOT baked into the `LensTurn` role union in lib/lens/ask.ts.
 *  Roles there are "assistant" and "visitor", so renaming her is this one
 *  line rather than a refactor across every file that handles a turn. */
export const LENS_ASSISTANT_NAME = "Brema"

/** The header. Says what the panel IS, not what it can do -- the chat below it
 *  does that far better than a subtitle would. */
export const LENS_HEADER = "New Chat"

export const LENS_STATUS_LABEL = {
  ready: "Ready",
  thinking: "Thinking",
  offline: "Offline",
} as const

export const LENS_PLACEHOLDER = `Ask ${LENS_ASSISTANT_NAME}`

/** Shown in her own slot when the seam throws, so an `Offline` pill never sits
 *  over an empty panel. Plain about what happened, with no apology and no
 *  advice to "try again later" that the visitor cannot act on. */
export const LENS_OFFLINE_LINE = `${LENS_ASSISTANT_NAME} can't reach her notes right now.`

/** Openers, shown only while nothing has been asked.
 *
 *  FOUR, not three -- see CLAUDE.md. More to the point, every one of them is
 *  answerable from content/lens/resume.txt as it actually stands: perception
 *  models for robot- and vehicle-mounted cameras, multi-sensor calibration,
 *  the path from labelling through deployment and drift monitoring, and the
 *  PowerPollen years. A starter prompt that the assistant cannot answer is a
 *  worse first impression than no starter prompt at all. */
export const LENS_STARTERS = [
  "What does Erik build?",
  "Which sensors has he calibrated?",
  "How does he get a model into production?",
  "What did he do at PowerPollen?",
] as const

/** How wide the panel gets on a roomy viewport, in px. Narrow on purpose: it
 *  hangs over a 3D scene that is the actual content of the page, and a chat
 *  column reads better short-lined anyway. */
export const LENS_PANEL_WIDTH = 360

/** The gutter kept either side on a phone, matching the rest of the site's
 *  16px edge. */
export const LENS_PANEL_GUTTER = 16

/** How far above the orb the panel's lower edge floats, in px. Enough to clear
 *  the orb's bloom without reading as detached from it. */
export const LENS_PANEL_LIFT = 26
