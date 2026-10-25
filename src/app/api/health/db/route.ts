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
    return Response.json(
      {
        ok: false,
        service: 'postgres',
        error: error instanceof Error ? error.message : 'Unknown database error',
      },
      { status: 500 },
    )
  }
}
