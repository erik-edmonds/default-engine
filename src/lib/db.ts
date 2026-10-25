import { Pool, type QueryResultRow } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Run `neon deploy` to pull the Neon env vars into .env.local.')
}

declare global {
  // eslint-disable-next-line no-var
  var postgresPool: Pool | undefined
}

const pool = globalThis.postgresPool ?? new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

if (process.env.NODE_ENV !== 'production') {
  globalThis.postgresPool = pool
}

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
  const result = await pool.query<T>(sql, params)
  return result
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
