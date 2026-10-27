/**
 * Web Push Subscription Endpoint (`app/api/push/route.ts`)
 * Phase 10: Registers authenticated user push subscriptions (`push_subscriptions`).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = (await request.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: 'INVALID_PUSH_SUBSCRIPTION' }, { status: 400 });
  }

  const repo = getDataRepository();
  const record = await repo.savePushSubscription(
    { userId: profile.id, role: profile.role, status: profile.status },
    {
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      userAgent: request.headers.get('user-agent') ?? undefined
    }
  );

  return NextResponse.json({ ok: true, subscriptionId: record.id });
}
