/**
 * Integrations against the local Supabase stack (`tests/integration/integrations.test.ts`):
 * email (Mailpit), error alerts, Web Push delivery, story media upload / cleanup.
 * Run with: npm run test:db (same environment as live-db.test.ts).
 */
import { createECDH, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendEmail } from '@/lib/email';
import { reportServerError } from '@/lib/alerts';
import { flushPendingPush } from '@/lib/push';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const MAILPIT = process.env.MAILPIT_URL ?? '';
const RUN = Date.now().toString(36);
const live = Boolean(SERVICE && ANON && MAILPIT && process.env.VAPID_PRIVATE_KEY);

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function mailTo(address: string, subjectPart: string): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    const list = (await res.json()) as { messages: Array<{ ID: string; Subject: string }> };
    const hit = list.messages?.find((m) => m.Subject.includes(subjectPart));
    if (hit) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string };
      return msg.Text;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

describe.skipIf(!live)('integrations: email, alerts, web push, story media', () => {
  let bossId: string;
  let boss: SupabaseClient;

  beforeAll(async () => {
    const { data } = await admin.from('profiles').select('id, email').eq('role', 'boss').single();
    bossId = data!.id;
    boss = createClient(URL_, ANON, { auth: { persistSession: false } });
    const { error } = await boss.auth.signInWithPassword({
      email: data!.email,
      password: process.env.BOSS_PASSWORD ?? 'LocalBossPass#2026'
    });
    expect(error).toBeNull();
  });

  it('sends transactional email through the configured provider', async () => {
    const to = `mail-${RUN}@test.local`;
    const res = await sendEmail({ to, subject: `Hello ${RUN}`, text: 'Body text' });
    expect(res).toEqual({ ok: true, provider: 'mailpit' });
    expect(await mailTo(to, `Hello ${RUN}`)).toContain('Body text');
  });

  it('emails an alert for a server error, once per 15 minutes per error', async () => {
    const err = new Error(`Boom ${RUN}`);
    await reportServerError(err, { path: '/boss/dashboard', method: 'GET', routeType: 'render' });
    await reportServerError(err, { path: '/boss/dashboard', method: 'GET', routeType: 'render' });
    const body = await mailTo(process.env.ALERT_EMAIL!, 'Server error on /boss/dashboard');
    expect(body).toContain(`Boom ${RUN}`);
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`Boom ${RUN}`)}`);
    expect(((await res.json()) as { messages: unknown[] }).messages).toHaveLength(1);
  });

  describe('web push', () => {
    let server: Server;
    const received: Array<{ path: string; encoding: string | undefined; bytes: number }> = [];
    let port = 0;

    beforeAll(async () => {
      // Push services are always HTTPS, so the stand-in receiver uses a throwaway certificate
      const dir = mkdtempSync(join(tmpdir(), 'jr-push-'));
      execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
        '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')
      ], { stdio: 'ignore' });
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      const tls = { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) };
      server = createServer(tls, (req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          received.push({
            path: req.url ?? '',
            encoding: req.headers['content-encoding'] as string | undefined,
            bytes: Buffer.concat(chunks).length
          });
          // A "gone" device must be cleaned up
          res.statusCode = req.url?.includes('gone') ? 410 : 201;
          res.end();
        });
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
      port = (server.address() as { port: number }).port;
    });

    afterAll(() => {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      return new Promise<void>((r) => server.close(() => r()));
    });

    it('delivers each new notification once, encrypted, only to the recipient; prunes dead devices', async () => {
      const keys = () => {
        const ecdh = createECDH('prime256v1');
        ecdh.generateKeys();
        return {
          p256dh: ecdh.getPublicKey().toString('base64url'),
          auth: randomBytes(16).toString('base64url')
        };
      };
      const { data: emp } = await admin.from('profiles').select('id').eq('role', 'employee').limit(1).single();
      await admin.from('push_subscriptions').delete().like('endpoint', '%://127.0.0.1:%');
      await admin.from('push_subscriptions').insert([
        { user_id: bossId, endpoint: `https://127.0.0.1:${port}/push/boss-${RUN}`, ...keys() },
        { user_id: bossId, endpoint: `https://127.0.0.1:${port}/push/gone-${RUN}`, ...keys() },
        ...(emp ? [{ user_id: emp.id, endpoint: `https://127.0.0.1:${port}/push/emp-${RUN}`, ...keys() }] : [])
      ]);
      await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).is('pushed_at', null);
      await admin.from('notifications').insert({
        recipient_id: bossId,
        type: 'test',
        title: 'Push test',
        body: `Hello ${RUN}`,
        link: '/boss/dashboard'
      });

      const sent = await flushPendingPush();
      expect(sent).toBe(1); // both boss devices were tried; one answered 410 Gone; the employee got nothing
      expect(received.map((r) => r.path).sort()).toEqual([`/push/boss-${RUN}`, `/push/gone-${RUN}`]);
      expect(received.every((r) => r.encoding === 'aes128gcm' && r.bytes > 0)).toBe(true);
      expect(JSON.stringify(received)).not.toContain(`Hello ${RUN}`);

      // Already pushed: nothing is sent twice
      expect(await flushPendingPush()).toBe(0);
      const { data: left } = await admin.from('push_subscriptions').select('endpoint').eq('user_id', bossId);
      expect(left!.map((s) => s.endpoint)).toEqual([`https://127.0.0.1:${port}/push/boss-${RUN}`]);
    });
  });

  it('story media: only the uploader\'s own uploaded file can be attached; expired media is removed', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const path = `${bossId}/${RUN}.png`;
    const { data: signed } = await admin.storage.from('story-media').createSignedUploadUrl(path);
    const put = await fetch(signed!.signedUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png', 'x-upsert': 'false' },
      body: png
    });
    expect(put.ok).toBe(true);

    // Wrong type for the bucket is refused by Storage itself
    const { data: badSigned } = await admin.storage.from('story-media').createSignedUploadUrl(`${bossId}/${RUN}.html`);
    const bad = await fetch(badSigned!.signedUrl, {
      method: 'PUT',
      headers: { 'content-type': 'text/html' },
      body: '<script>alert(1)</script>'
    });
    expect(bad.ok).toBe(false);

    const missing = await boss.rpc('create_story', {
      p_kind: 'image', p_caption: 'x', p_media_path: `${bossId}/not-uploaded.png`, p_bg_style: null
    });
    expect(missing.error?.message).toMatch(/Upload the image or video first/);
    const foreign = await boss.rpc('create_story', {
      p_kind: 'image', p_caption: 'x', p_media_path: `00000000-0000-0000-0000-000000000000/${RUN}.png`, p_bg_style: null
    });
    expect(foreign.error?.message).toMatch(/Upload the image or video first/);

    const { data: story, error } = await boss.rpc('create_story', {
      p_kind: 'image', p_caption: `Pic ${RUN}`, p_media_path: path, p_bg_style: null
    });
    expect(error).toBeNull();
    const storyId = (story as unknown as { id: string }).id;

    // Customers have no direct access to the private bucket
    const anonList = await createClient(URL_, ANON).storage.from('story-media').list(bossId);
    expect(anonList.data ?? []).toEqual([]);

    // Expire it, then run the cleanup the nightly job uses
    await admin.from('stories').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', storyId);
    const { SupabaseDataRepository } = await import('@/lib/data/supabase');
    const purged = await new SupabaseDataRepository().purgeExpiredStories();
    expect(purged).toBeGreaterThanOrEqual(1);
    const { data: after } = await admin.storage.from('story-media').list(bossId);
    expect((after ?? []).map((f) => f.name)).not.toContain(`${RUN}.png`);
    const { data: row } = await admin.from('stories').select('media_purged_at').eq('id', storyId).single();
    expect(row!.media_purged_at).not.toBeNull();
  });
});
