/** Apply the SQL migrations in db/migrations, once each, in order.
 *
 *  Run: node --experimental-strip-types --import ./scripts/alias-hook.mjs \
 *       scripts/migrate.ts
 *
 *  DELIBERATELY NOT A MIGRATION FRAMEWORK. This repo has one schema file and
 *  a `pg.Pool`; adding Prisma or Drizzle to apply three `create table`
 *  statements would be more moving parts than the thing being moved. Forty
 *  lines that are entirely legible is the right size for this, and the shape
 *  is the conventional one, so replacing it later costs nothing.
 *
 *  Each file runs inside a TRANSACTION together with the insert that records
 *  it. That pairing is the only interesting property here: a migration that
 *  half-applied and then recorded itself as done is the failure mode that
 *  requires a human with psql to untangle, and a transaction makes it
 *  impossible.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { hasDatabase, query, withTransaction } from "@/lib/db"

const DIR = join(import.meta.dirname, "..", "db", "migrations")

if (!hasDatabase()) {
  console.error("DATABASE_URL is not set. Pull the Neon env vars into .env.local first.")
  process.exit(1)
}

/** MIGRATIONS GO DIRECT, NOT THROUGH THE POOLER.
 *
 *  `DATABASE_URL` points at Neon's `-pooler` host, which is PgBouncer in
 *  transaction pooling mode. That is the right endpoint for the application --
 *  short request-scoped queries -- and the wrong one for DDL: in transaction
 *  pooling a session is only yours for the length of a transaction, so
 *  anything session-scoped (advisory locks, `set`, prepared statements) does
 *  not behave the way a migration assumes, and failures there are of the
 *  intermittent, hard-to-reproduce kind.
 *
 *  Neon provisions `DATABASE_URL_UNPOOLED` for exactly this, and until now
 *  nothing in the repo read it. Assigning it here works because the pool in
 *  lib/db.ts is LAZY and reads the variable on first use, which is the next
 *  statement -- the same laziness that was introduced so the fallback in
 *  lib/scans.ts could be reachable. */
if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED
  console.log("  using the unpooled connection for DDL")
} else {
  console.warn("  DATABASE_URL_UNPOOLED is not set -- applying DDL through the pooler")
}

// schema_migrations is created by 001 itself, so the first run has to cope
// with it not existing yet -- hence `if not exists` here as well as there.
await query(`
  create table if not exists schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
  )
`)

const applied = new Set(
  (await query<{ version: string }>("select version from schema_migrations")).rows.map((r) => r.version),
)

// Lexicographic order, which is why the files are zero-padded. 001, 002, 010.
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()
let ran = 0

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip   ${file}`)
    continue
  }
  const sql = readFileSync(join(DIR, file), "utf8")
  try {
    // ONE PINNED CONNECTION, via withTransaction. Issuing begin/commit
    // through the pool would put them on different connections and commit
    // nothing, silently -- see the note on withTransaction.
    await withTransaction(async (run) => {
      await run(sql)
      await run("insert into schema_migrations (version) values ($1)", [file])
    })
    console.log(`  applied ${file}`)
    ran++
  } catch (error) {
    console.error(`  FAILED  ${file}`)
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

console.log(`\n  ${ran === 0 ? "already up to date" : `${ran} migration(s) applied`}`)
process.exit(0)
