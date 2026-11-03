/**
 * Scheduled Cron Endpoint: auto-close resolved tickets, remove expired story media, send leftover pushes (`app/api/cron/route.ts`)
 * Secured via `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDataRepository } from '@/lib/data';
import { flushPendingPush } from '@/lib/push';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  // Fail closed: without a configured secret the endpoint is unusable
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED_CRON' }, { status: 401 });
  }

  const repo = getDataRepository();
  const [closedTicketsCount, purgedStoriesCount, pushedCount] = await Promise.all([
    repo.autoCloseResolvedTickets(),
    repo.purgeExpiredStories(),
    flushPendingPush()
  ]);

  return NextResponse.json({
    ok: true,
    closedTicketsCount,
    purgedStoriesCount,
    pushedCount,
    executedAt: new Date().toISOString()
  });
}
