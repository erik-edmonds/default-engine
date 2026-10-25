/** Lets `node --experimental-strip-types` load modules out of `src/`.
 *
 *  Use it with --import:
 *
 *      node --experimental-strip-types --import ./scripts/alias-hook.mjs \
 *           scripts/xr-measure-test.ts
 *
 *  WHY THIS EXISTS. Testable logic in `src/` is written the way the rest of
 *  the project is written -- `@/helpers/frameStats`, resolved by the tsconfig
 *  path alias -- and node knows nothing about tsconfig. The alternatives were
 *  both worse:
 *
 *    - Relative imports with explicit `.ts` extensions. tsc rejects those
 *      without `allowImportingTsExtensions`, which is a project-wide compiler
 *      setting changed to suit a test runner. (scripts/copc-golden.ts does use
 *      them, and gets away with it only because `scripts/` is excluded from
 *      tsconfig entirely.)
 *    - Extensionless relative imports. tsc is happy; node's ESM resolver is
 *      not, because extension searching is a CommonJS behaviour that ESM
 *      deliberately dropped.
 *
 *  So: one resolver hook, and `src/` is written for the app rather than for
 *  the test. It also handles extensionless relative specifiers -- the style
 *  lib/copc/traverse.ts already uses for "./source" -- so any module in the
 *  tree can be imported by a script, not just the ones that happen to have no
 *  relative imports.
 *
 *  `registerHooks` is the synchronous in-thread API (node >= 22.15). The
 *  older `register()` loader runs on a separate thread and would need a second
 *  file; there is nothing asynchronous to do here.
 */
import { registerHooks } from "node:module"
import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const SRC = path.resolve(import.meta.dirname, "..", "src")
const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".json"]

/** Add an extension, or resolve a directory to its index, if the path as
 *  given is not a file. Returns null when nothing matches, so the caller can
 *  fall through to node's own resolver and get node's own error message. */
function withExtension(filePath) {
  if (existsSync(filePath) && path.extname(filePath)) return filePath
  for (const ext of EXTENSIONS) {
    if (existsSync(filePath + ext)) return filePath + ext
  }
  for (const ext of EXTENSIONS) {
    const index = path.join(filePath, `index${ext}`)
    if (existsSync(index)) return index
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // "@/..." -> src/...
    if (specifier.startsWith("@/")) {
      const resolved = withExtension(path.join(SRC, specifier.slice(2)))
      if (resolved) return nextResolve(pathToFileURL(resolved).href, context)
    }

    // "./x" or "../x" with no extension, from a file inside the project.
    if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
      const from = path.dirname(fileURLToPath(context.parentURL))
      const resolved = withExtension(path.resolve(from, specifier))
      if (resolved) return nextResolve(pathToFileURL(resolved).href, context)
    }

    return nextResolve(specifier, context)
  },
})
