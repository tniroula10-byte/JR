/**
 * Scheduled Cron Endpoint: Auto-Close Resolved Tickets & Purge Expired Stories (`app/api/cron/route.ts`)
 * Secured via `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDataRepository } from '@/lib/data';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET || 'dev-cron-secret';

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED_CRON' }, { status: 401 });
  }

  const repo = getDataRepository();
  const [closedTicketsCount, purgedStoriesCount] = await Promise.all([
    repo.autoCloseResolvedTickets(),
    repo.purgeExpiredStories()
  ]);

  return NextResponse.json({
    ok: true,
    closedTicketsCount,
    purgedStoriesCount,
    executedAt: new Date().toISOString()
  });
}
