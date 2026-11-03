/**
 * Transactional Email (`lib/email.ts`)
 * - Production: Resend (`RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`).
 * - Local development: the Supabase stack's Mailpit inbox (`MAILPIT_URL`), so emails can be tested.
 * - Neither configured: nothing is sent and the caller is told so.
 * Sign-in codes are sent by Supabase Auth itself (configure Resend SMTP in the dashboard).
 */
import 'server-only';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type EmailResult =
  | { ok: true; provider: 'resend' | 'mailpit' }
  | { ok: false; reason: 'not_configured' | 'failed'; error?: string };

const DEFAULT_FROM = 'John Rambo Support <support@example.com>';

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const from = process.env.EMAIL_FROM_ADDRESS || DEFAULT_FROM;

  if (process.env.RESEND_API_KEY) {
    try {
      // Resend REST API (https://resend.com/docs/api-reference/emails/send-email)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text })
      });
      if (res.ok) return { ok: true, provider: 'resend' };
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, reason: 'failed', error: body.message ?? `Resend HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, reason: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  if (process.env.MAILPIT_URL) {
    try {
      const fromEmail = from.match(/<([^>]+)>/)?.[1] ?? from;
      const res = await fetch(`${process.env.MAILPIT_URL}/api/v1/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: { Email: fromEmail, Name: 'John Rambo Support' },
          To: [{ Email: message.to }],
          Subject: message.subject,
          Text: message.text
        })
      });
      return res.ok
        ? { ok: true, provider: 'mailpit' }
        : { ok: false, reason: 'failed', error: `Mailpit HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, reason: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: false, reason: 'not_configured' };
}
