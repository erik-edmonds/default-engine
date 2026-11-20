import { hasDatabase, query } from "@/lib/db"
import { SCANS, type ScanDefinition } from "@/config/scans"

export { scanUrl } from "@/config/scans"

/** Postgres `undefined_table`. The database is configured and reachable, but
 *  the migration has not been run against it.
 *
 *  A THIRD STATE, AND IT HAD TO BE NAMED. The design above distinguishes "no
 *  database configured" (expected, fall back) from "the query failed" (a bug,
 *  must surface) -- and this is neither. It is what `yarn build` hits on a
 *  machine whose `.env.local` has Neon credentials but whose schema is one
 *  commit behind, which is every machine for the window between pulling this
 *  change and running scripts/migrate.ts. Falling back on exactly this one
 *  SQLSTATE keeps the build green through that window without the blanket
 *  try/catch that would also swallow a genuinely broken query.
 *
 *  Matched on the code, never on the message: messages are localised and
 *  change between major versions, codes do not. */
const UNDEFINED_TABLE = "42P01"

function isNotMigrated(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === UNDEFINED_TABLE
}

/** Could not reach the server at all. Not a query failure -- no query was ever
 *  sent.
 *
 *  A FOURTH NORMAL STATE, for the same reason UNDEFINED_TABLE was a third.
 *  The list below distinguishes "no database configured" from "the database
 *  rejected that query", and this is neither: the credentials are present and
 *  valid, and the host simply is not answering. That happens constantly and
 *  for dull reasons -- Neon scales its compute to zero when idle and is not
 *  always awake in time, a laptop is off the network or behind a VPN, DNS is
 *  slow. In substance it is situation 1 below with a connection string in
 *  .env.local, and the correct answer is the same static table.
 *
 *  Found the hard way: `next build` failed with
 *  `Failed to collect page data for /scan/[id]` and an ETIMEDOUT to the Neon
 *  endpoint, on a tree whose only changes were to routes and copy. A build
 *  that a brief network outage can break is a build nobody can trust.
 *
 *  STILL NOT A BLANKET CATCH. Only transport-level codes, never a message:
 *  an authentication failure, a syntax error or a missing column all still
 *  throw, because every one of those is a bug someone has to see.
 *
 *  node-postgres wraps a multi-address failure (IPv6 then IPv4, as Neon
 *  resolves) in an AggregateError, so the nested `errors` have to be checked
 *  too -- the outer object carries no code of its own. */
const UNREACHABLE = new Set([
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
])

function isUnreachable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const e = error as { code?: string; errors?: unknown[] }
  if (typeof e.code === "string" && UNREACHABLE.has(e.code)) return true
  return Array.isArray(e.errors) && e.errors.some(isUnreachable)
}

/** The scan registry: Postgres when there is one, the static table otherwise.
 *
 *  THE SEAM config/scans.ts WAS WRITTEN AROUND, now closed. Its comment said
 *  "when scans are uploaded and processed, this lookup becomes a query and
 *  nothing else in the viewer moves" -- and nothing else did. `ScanDefinition`
 *  is unchanged, so `ScanMount`, `ScanExperience` and `PointCloud` never
 *  learned that any of this happened.
 *
 *  WHY THE FALLBACK IS NOT BELT-AND-BRACES. Three situations need the static
 *  table, and all three are normal:
 *
 *  1. `yarn build` on a machine with no Neon credentials. The scan route does
 *     not need a database to render a public COPC URL, and making the build
 *     depend on one would be a self-inflicted wound.
 *  2. Anyone cloning the repo, who should get a working viewer.
 *  3. Local work while the database is being migrated.
 *  4. A configured database that is not answering -- see `isUnreachable`.
 *
 *  WHAT THE FALLBACK IS NOT FOR: a query that fails. "There is no database
 *  configured" and "the database rejected that query" are different events --
 *  the first is expected, the second is a bug. `hasDatabase()` distinguishes
 *  them, so a broken query surfaces as a broken query rather than being
 *  quietly papered over with stale hard-coded data. That distinction is the
 *  whole reason this is not a try/catch around the query.
 */

interface ScanRow {
  id: string
  label: string
  credit: string
  source_url: string
  derived_url: string | null
  units_to_metres: number
  approx_points: string | number
}

function toDefinition(row: ScanRow): ScanDefinition {
  return {
    id: row.id,
    label: row.label,
    credit: row.credit,
    url: row.source_url,
    derivedUrl: row.derived_url ?? undefined,
    // `bigint` comes back from node-postgres as a STRING, because a Postgres
    // bigint does not fit a JS number. It fits comfortably here (10.6M), but
    // the cast has to be explicit or `approxPoints.toLocaleString()` would
    // format a string and the point count on the page would read "10653336"
    // rather than "10,653,336".
    approxPoints: Number(row.approx_points),
    unitsToMetres: Number(row.units_to_metres),
  }
}

const COLUMNS = "id, label, credit, source_url, derived_url, units_to_metres, approx_points"

export async function getScan(id: string): Promise<ScanDefinition | null> {
  if (!hasDatabase()) return SCANS[id] ?? null
  try {
    const { rows } = await query<ScanRow>(`select ${COLUMNS} from scans where id = $1`, [id])
    // Present in the seed table but not in the database: a scan the repo
    // demonstrably knows about. Serving it beats a 404.
    return rows[0] ? toDefinition(rows[0]) : (SCANS[id] ?? null)
  } catch (error) {
    if (isNotMigrated(error) || isUnreachable(error)) return SCANS[id] ?? null
    throw error
  }
}

export async function listScans(): Promise<ScanDefinition[]> {
  if (!hasDatabase()) return Object.values(SCANS)
  try {
    const { rows } = await query<ScanRow>(`select ${COLUMNS} from scans order by created_at asc`)
    return rows.length ? rows.map(toDefinition) : Object.values(SCANS)
  } catch (error) {
    if (isNotMigrated(error) || isUnreachable(error)) return Object.values(SCANS)
    throw error
  }
}
