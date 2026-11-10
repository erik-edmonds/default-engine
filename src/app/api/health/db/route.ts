import { getDatabaseStatus } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const status = await getDatabaseStatus()

    return Response.json({
      ...status,
      service: 'postgres',
    })
  } catch (error) {
    // LOGGED HERE, NOT RETURNED. This used to put `error.message` in the
    // response body, which on a connection failure is a `pg` message carrying
    // the database host, the role name, or the SSL negotiation detail -- handed
    // to an unauthenticated caller of a public endpoint. The operator needs
    // that text; the caller needs to know the probe failed.
    console.error('[health/db]', error)

    return Response.json(
      { ok: false, service: 'postgres', error: 'Database unreachable' },
      { status: 500 },
    )
  }
}
