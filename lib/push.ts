/**
 * Web Push Delivery (`lib/push.ts`)
 * In-app notifications are written by database functions. After each request that may
 * have created some, `flushPendingPush()` sends the unsent ones to the recipients'
 * registered devices and marks them pushed. Needs VAPID keys; otherwise it does nothing.
 * Payloads carry only the notification title/body/link, which never include staff identity.
 */
import 'server-only';
import webpush from 'web-push';
import { hasLiveSupabaseKeys } from '@/lib/supabase/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export function isPushConfigured(): boolean {
  return Boolean(
    hasLiveSupabaseKeys() &&
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

/** Pushes notifications created in the last 15 minutes that have not been pushed yet. */
export async function flushPendingPush(): Promise<number> {
  if (!isPushConfigured()) return 0;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: pending } = await admin
    .from('notifications')
    .select('id, recipient_id, title, body, link')
    .is('pushed_at', null)
    .gte('created_at', since)
    .order('created_at')
    .limit(200);
  if (!pending?.length) return 0;

  // Claim the batch first so concurrent flushes do not send duplicates
  const ids = pending.map((n) => n.id);
  const { data: claimed } = await admin
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .in('id', ids)
    .is('pushed_at', null)
    .select('id');
  const claimedIds = new Set((claimed ?? []).map((c) => c.id));
  const batch = pending.filter((n) => claimedIds.has(n.id));
  if (batch.length === 0) return 0;

  const recipients = [...new Set(batch.map((n) => n.recipient_id))];
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', recipients);

  let sent = 0;
  const dead: string[] = [];
  for (const n of batch) {
    const payload = JSON.stringify({ title: n.title, body: n.body, link: n.link });
    for (const sub of (subs ?? []).filter((s) => s.user_id === n.recipient_id)) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60 }
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser unsubscribed or the device is gone
        if (status === 404 || status === 410) dead.push(sub.id);
      }
    }
  }
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead);
  return sent;
}
