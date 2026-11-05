import { Pool, type QueryResultRow } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var postgresPool: Pool | undefined
}

/** THE POOL IS LAZY, AND THAT IS A FIX RATHER THAN A STYLE CHOICE.
 *
 *  This module used to read `DATABASE_URL` and `throw` at module scope. That
 *  makes the failure arrive at IMPORT time, which has two consequences worth
 *  spelling out because neither is obvious from the three lines it replaced:
 *
 *  1. Nothing that imports this can have a fallback. `lib/scans.ts` reads the
 *     scan registry from Postgres and falls back to the static table in
 *     config/scans.ts when there is no database -- but a throw at import fires
 *     before any of that logic exists to catch it. The fallback was
 *     unreachable by construction.
 *
 *  2. It makes `yarn build` depend on database credentials. Anyone cloning
 *     this repo without Neon env could not build the site, for a route that
 *     does not need a database to render.
 *
 *  Deferring to first use keeps the error exactly as loud, at the moment
 *  someone actually asks for data, where it can be handled. */
function getPool(): Pool {
  if (globalThis.postgresPool) return globalThis.postgresPool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Run `neon deploy` to pull the Neon env vars into .env.local.')
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })

  // Cached on the global in development so Next's hot reload does not open a
  // new pool per edit until Neon refuses the connection count.
  if (process.env.NODE_ENV !== 'production') globalThis.postgresPool = pool
  return pool
}

/** Whether a database is configured at all.
 *
 *  Checked rather than inferred from a caught error, so "no database here" and
 *  "the database rejected that query" stay distinguishable -- the second is a
 *  bug and must not be silently swallowed by a fallback meant for the first. */
export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
  const result = await getPool().query<T>(sql, params)
  return result
}

/** Run several statements on ONE pinned connection, as a transaction.
 *
 *  THIS CANNOT BE DONE WITH `query` ABOVE, and the reason is worth stating
 *  because the broken version looks correct: `pool.query` checks a connection
 *  out of the pool per call and returns it immediately, so
 *  `query('begin')` ... `query('commit')` can run on three different
 *  connections. The BEGIN opens a transaction on a connection that is then
 *  handed back, the work happens outside any transaction, and the COMMIT
 *  commits nothing. No error is raised at any point.
 *
 *  `pool.connect()` pins one connection for the duration, which is what makes
 *  the three statements a single transaction. The `finally` is not optional:
 *  a client that is not released is a connection leaked for the life of the
 *  process, and Neon's connection limit is not large. */
export async function withTransaction<T>(
  fn: (run: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<{ rows: R[] }>) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query("begin")
    const result = await fn((sql, params = []) => client.query(sql, params))
    await client.query("commit")
    return result
  } catch (error) {
    await client.query("rollback").catch(() => {
      // A rollback can itself fail if the connection has dropped. The
      // original error is the one worth reporting, so this one is swallowed
      // rather than being allowed to mask it.
    })
    throw error
  } finally {
    client.release()
  }
}

export async function getDatabaseStatus() {
  const result = await query<{ now: Date; database: string; user: string }>(
    'SELECT NOW() AS now, current_database() AS database, current_user AS user',
  )

  const row = result.rows[0]

  return {
    ok: true,
    now: row.now,
    database: row.database,
    user: row.user,
  }
}
