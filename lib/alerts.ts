/**
 * Server Error Alerts (`lib/alerts.ts`)
 * Emails `ALERT_EMAIL` when a request fails on the server. Each distinct error is sent
 * at most once per 15 minutes per server instance, so a broken page cannot flood the inbox.
 * Only the error message, route and time are sent: never request bodies, cookies or user data.
 */
import 'server-only';
import { sendEmail } from '@/lib/email';

const lastSent = new Map<string, number>();
const QUIET_MS = 15 * 60 * 1000;

export async function reportServerError(
  error: unknown,
  context: { path: string; method: string; routeType: string }
): Promise<void> {
  const to = process.env.ALERT_EMAIL;
  if (!to) return;

  const err = error instanceof Error ? error : new Error(String(error));
  const digest = (err as Error & { digest?: string }).digest;
  const key = `${context.path}:${err.message}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - QUIET_MS) return;
  lastSent.set(key, now);

  await sendEmail({
    to,
    subject: `[John Rambo] Server error on ${context.path}`,
    text: [
      `Time: ${new Date(now).toISOString()}`,
      `Route: ${context.method} ${context.path} (${context.routeType})`,
      `Error: ${err.message}`,
      digest ? `Digest: ${digest} (search this in the Vercel logs)` : '',
      '',
      'Repeats of this error are muted for 15 minutes.'
    ]
      .filter(Boolean)
      .join('\n')
  });
}
