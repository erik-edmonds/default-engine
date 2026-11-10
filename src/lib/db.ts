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
/** The SSL modes node-postgres treats as `verify-full` TODAY and will stop
 *  treating that way.
 *
 *  `pg` emits a runtime warning when it sees one of these, saying that in
 *  pg v9 / pg-connection-string v3 they will adopt libpq semantics -- under
 *  which `require` means "encrypt but do not verify anything". Upgrading them
 *  to `verify-full` here is therefore a no-op against today's behaviour and a
 *  guard against that future default. */
const ALIASED_SSL_MODES = /([?&]sslmode=)(prefer|require|verify-ca)(&|$)/i

/** Rewrite only the `sslmode` value, leaving the rest of the URL byte-identical.
 *
 *  SURGICAL ON PURPOSE. The obvious implementation parses the string with
 *  `new URL()` and re-serialises it, which also re-encodes the userinfo -- and
 *  the userinfo is a password. A regex that touches four known literal values
 *  cannot corrupt a credential; a round-trip through URL can.
 *
 *  A connection string with NO sslmode is left alone rather than having one
 *  appended: that is the shape of a local unencrypted Postgres, which is a
 *  legitimate development target. Remote databases should carry the parameter,
 *  and Neon's URLs always do. */
function withVerifiedSsl(connectionString: string): string {
  return connectionString.replace(ALIASED_SSL_MODES, '$1verify-full$3')
}

function getPool(): Pool {
  if (globalThis.postgresPool) return globalThis.postgresPool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Run `neon deploy` to pull the Neon env vars into .env.local.')
  }

  const pool = new Pool({
    connectionString: withVerifiedSsl(connectionString),
    // NO `ssl` KEY, AND ITS ABSENCE IS THE FIX.
    //
    // This used to pass `ssl: { rejectUnauthorized: false }`. In node-postgres
    // an explicit `ssl` object OVERRIDES whatever the connection string says,
    // so despite `sslmode=require` sitting in the URL the certificate was not
    // being verified at all -- on the connection that carries the entire scan
    // registry. That is the opposite of what the URL appeared to promise.
    //
    // `rejectUnauthorized: false` is advice inherited from platforms that
    // served self-signed certificates. Neon serves a publicly-trusted one, so
    // verification needs no custom CA bundle and no option here: letting the
    // connection string govern gives a verified TLS session.

    // Fail a request rather than hang it. Without this a connect that never
    // completes blocks the caller indefinitely, which on a server-rendered
    // route means a page that never responds.
    connectionTimeoutMillis: 5_000,
    // Neon's connection ceiling is not large and is shared across every
    // instance, so each pool stays small and gives idle connections back
    // quickly instead of holding them for the life of the container.
    max: 3,
    idleTimeoutMillis: 10_000,
  })

  // CACHED UNCONDITIONALLY, which it was not. The guard here used to be
  // `NODE_ENV !== 'production'`, with a comment about hot reload -- so the
  // development problem was solved and the production one was created: a
  // serverless container IS reused between invocations, and without a
  // module-global pool every invocation built a fresh `Pool`, paid a fresh TLS
  // handshake, and then abandoned it without draining. The global is the
  // mechanism that makes a pool a pool on this runtime.
  globalThis.postgresPool = pool
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
