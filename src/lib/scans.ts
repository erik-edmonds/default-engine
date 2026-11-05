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
    if (isNotMigrated(error)) return SCANS[id] ?? null
    throw error
  }
}

export async function listScans(): Promise<ScanDefinition[]> {
  if (!hasDatabase()) return Object.values(SCANS)
  try {
    const { rows } = await query<ScanRow>(`select ${COLUMNS} from scans order by created_at asc`)
    return rows.length ? rows.map(toDefinition) : Object.values(SCANS)
  } catch (error) {
    if (isNotMigrated(error)) return Object.values(SCANS)
    throw error
  }
}
