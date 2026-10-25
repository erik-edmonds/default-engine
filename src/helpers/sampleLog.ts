/** The deliverable: a number that survives taking the headset off.
 *
 *  Phase 1 exists to replace an arithmetic guess at the point budget with a
 *  measurement. A measurement you read off a wrist panel and then remove the
 *  headset is not a measurement, it is a memory — and the whole reason for
 *  walking the budget with a hardware button is that you will do it fifty
 *  times in a session and cannot write any of it down while wearing it.
 *
 *  So every settled window gets appended to localStorage, and the accumulated
 *  table is rendered into the DOM the moment the session ends. `localStorage`
 *  rather than a server because the backend is explicitly not in this round,
 *  and rather than memory because the session ending is exactly when a
 *  thermally-stressed browser is most likely to reload the page.
 *
 *  A SAMPLE IS A SETTLED WINDOW AT ONE SETTING, not an instant. It is keyed
 *  by (budget, scale) and discarded if the setting changed before the window
 *  filled, because the frames immediately after a budget step are measuring
 *  the step — nodes being fetched, decoded and uploaded — rather than the
 *  budget.
 *
 *  Every sample carries `sinceSessionStartMs`. That column is the thermal
 *  story: the plan requires every budget measured twice, cold and after ten
 *  minutes, and without a clock on each row there is no way to tell which one
 *  you are looking at.
 */

const KEY = "scan.samples.v1"
/** Enough for several long sessions; old rows are dropped first. */
const MAX_ROWS = 400

export interface Sample {
  /** Epoch ms, so rows from different sessions can be told apart. */
  at: number
  /** Ms since this session started. THE THERMAL COLUMN. */
  sinceSessionStartMs: number
  scan: string
  budget: number
  scaleMode: "table" | "life"
  ratio: number
  /** Frames in the window. A small number means an unsettled sample. */
  frames: number
  medianMs: number
  p95Ms: number
  worstMs: number
  dropped: number
  /** Points actually on screen, which is not the budget. */
  points: number
  nodes: number
  drawCalls: number
  programs: number
  framebuffer: [number, number]
  foveation: number
  hz: number
  /** False when the window was cut short; kept, but marked. */
  settled: boolean
}

/** The store, so the DOM table can be a `useSyncExternalStore` reader.
 *
 *  WHY A STORE AND NOT AN EFFECT THAT READS ON EXIT. The obvious shape is
 *  `useEffect(() => setRows(readSamples()), [armed])`, and it is wrong twice
 *  over: it trips `react-hooks/set-state-in-effect` — the repo has two of
 *  those already and they are not a pattern to copy — and it can only ever
 *  show the log at a transition, so a sample filed while the table is open
 *  does not appear.
 *
 *  `cache` is what makes it work: `getSnapshot` must return a stable
 *  reference or React re-renders forever, so the parsed array is held and
 *  replaced only on a write. */
let cache: Sample[] | null = null
const listeners = new Set<() => void>()
/** A stable empty array, for SSR and for a blocked localStorage. */
const EMPTY: Sample[] = []

export function subscribeSamples(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** The current rows, by stable reference. */
export function samplesSnapshot(): Sample[] {
  return (cache ??= readSamples())
}

/** There is no log on the server, and reading one would be a hydration
 *  mismatch waiting to happen. */
export function samplesServerSnapshot(): Sample[] {
  return EMPTY
}

/** Append one sample. Never throws — a full or blocked localStorage must not
 *  take down a session that is mid-measurement. */
export function recordSample(sample: Sample): void {
  const rows = [...samplesSnapshot(), sample].slice(-MAX_ROWS)
  cache = rows
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    // Private windows, cleared site data, quota. The session is worth more
    // than the log -- and the in-memory cache still carries this run, so the
    // table works even where storage does not.
  }
  for (const fn of listeners) fn()
}

/** Every stored sample, oldest first. `[]` on anything unexpected. */
export function readSamples(): Sample[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Sample[]) : []
  } catch {
    return []
  }
}

export function clearSamples(): void {
  cache = EMPTY
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
  for (const fn of listeners) fn()
}

/** The log as a CSV, for pasting somewhere a table can be sorted.
 *
 *  Generated from the row objects rather than a hand-written header list, so
 *  a field added to `Sample` cannot silently go missing from the export. */
export function samplesToCsv(rows: Sample[]): string {
  if (rows.length === 0) return ""
  const cols = Object.keys(rows[0]) as (keyof Sample)[]
  const cell = (v: unknown) => (Array.isArray(v) ? v.join("x") : String(v))
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n")
}
