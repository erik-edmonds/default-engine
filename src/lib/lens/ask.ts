import { LENS_ASSISTANT_NAME } from "@/config/lens"

/** Who said a thing.
 *
 *  Roles, not names. `LENS_ASSISTANT_NAME` is display copy and lives in
 *  config/lens.ts; if she is renamed tomorrow nothing in here or in any
 *  component that handles a turn has to move. */
export type LensRole = "assistant" | "visitor"

export interface LensTurn {
  role: LensRole
  text: string
}

/** THE SEAM. Everything above this line is UI; everything below it is Erik's.
 *
 *  An async generator of text chunks rather than a promise of a finished
 *  string, because the panel renders each chunk as it lands -- an answer that
 *  appears a word at a time reads as something thinking, and an answer that
 *  appears all at once after four seconds of nothing reads as a page that
 *  hung. The shape also matches what every streaming LLM API already hands
 *  back, so the real implementation is a loop over a response stream and not
 *  an adapter.
 *
 *  REPLACING THE STUB: delete the body below, keep the signature. Yield each
 *  chunk of text as it arrives and honour `signal` -- the panel aborts on
 *  close, and a generator that ignores that keeps a request alive behind a
 *  panel nobody is looking at. Throwing is fine and is handled: the panel
 *  shows `Offline` and LENS_OFFLINE_LINE rather than an empty frame.
 *
 *  The context to answer from is already in the repo at
 *  content/lens/resume.txt. Note that it carries a real phone number and a
 *  real email address, so whatever ends up reading it should be told what it
 *  may and may not repeat.
 */
export async function* askLens(
  question: string,
  options: { signal?: AbortSignal } = {},
): AsyncGenerator<string> {
  const { signal } = options

  // THE STUB, AND IT SAYS SO.
  //
  // It would have been easy to have her paraphrase the resume here and look
  // finished. That is the worse failure: every question would get the same
  // confident answer, and the first person to notice would be a visitor
  // rather than Erik. Saying plainly that she is not wired up yet costs
  // nothing and cannot mislead anyone.
  const reply =
    `I'm not wired up yet — Erik is still building my backend, so I can't ` +
    `actually read his work to answer "${question.trim()}". ` +
    `When he connects me I'll be able to.`

  for (const chunk of chunks(reply)) {
    if (signal?.aborted) return
    await wait(28, signal)
    if (signal?.aborted) return
    yield chunk
  }
}

/** Word-at-a-time, with the space kept on the front of the next chunk so the
 *  panel can concatenate blindly and never has to guess at spacing. */
function* chunks(text: string): Generator<string> {
  let index = 0
  while (index < text.length) {
    let next = text.indexOf(" ", index + 1)
    if (next === -1) next = text.length
    yield text.slice(index, next)
    index = next
  }
}

/** A sleep that gives up when the caller does, rather than resolving into a
 *  generator nobody is pulling from any more. */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, ms)
    signal?.addEventListener("abort", done, { once: true })
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener("abort", done)
      resolve()
    }
  })
}

/** Re-exported so a component can greet her by name without reaching past the
 *  seam into config for it. */
export { LENS_ASSISTANT_NAME }
