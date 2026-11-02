import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    set: () => {},
    delete: () => {}
  })
}));

import { middleware } from '@/middleware';
import { hasLiveSupabaseKeys, isDemoAuthAllowed } from '@/lib/supabase/env';
import { getCurrentProfile } from '@/lib/auth/session';
import { GET as cronGet } from '@/app/api/cron/route';

const LIVE_URL = 'https://abcdefghijklmnop.supabase.co';
const LIVE_KEY = 'sb_publishable_' + 'x'.repeat(40);

function useLiveKeys() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', LIVE_URL);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', LIVE_KEY);
  vi.stubEnv('JR_FORCE_MOCK', '');
}

function useNoKeys() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
}

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, 'http://localhost:3000'));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

function location(res: Response) {
  const loc = res.headers.get('location');
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
}

describe('Step 1: authentication lockdown', () => {
  beforeEach(() => {
    cookieJar.clear();
    vi.stubEnv('JR_ALLOW_DEMO_AUTH', '');
    // Any network call means a test escaped its intended path: answer "unauthenticated"
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'invalid' }), { status: 401 }))
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('demo-mode gating', () => {
    it('allows demo logins only in development or with an explicit opt-in, never with live keys', () => {
      useNoKeys();
      vi.stubEnv('NODE_ENV', 'development');
      expect(isDemoAuthAllowed()).toBe(true);

      vi.stubEnv('NODE_ENV', 'production');
      expect(isDemoAuthAllowed()).toBe(false);

      vi.stubEnv('JR_ALLOW_DEMO_AUTH', '1');
      expect(isDemoAuthAllowed()).toBe(true);

      useLiveKeys();
      expect(hasLiveSupabaseKeys()).toBe(true);
      expect(isDemoAuthAllowed()).toBe(false);
    });
  });

  describe('middleware', () => {
    it('live mode: ?as=boss-1 does not grant access or set a cookie', async () => {
      useLiveKeys();
      const res = await middleware(request('/boss/dashboard?as=boss-1'));
      expect(location(res)).toBe('/login');
      expect(res.cookies.get('jr_mock_user_id')).toBeUndefined();
    });

    it('live mode: a forged demo cookie is ignored', async () => {
      useLiveKeys();
      const res = await middleware(request('/boss/dashboard', { jr_mock_user_id: 'boss-1' }));
      expect(location(res)).toBe('/login');
    });

    it('production without keys fails closed, even with ?as=', async () => {
      useNoKeys();
      vi.stubEnv('NODE_ENV', 'production');
      const res = await middleware(request('/boss/dashboard?as=boss-1'));
      expect(location(res)).toBe('/login?error=not_configured');
      expect(res.cookies.get('jr_mock_user_id')).toBeUndefined();
    });

    it('demo mode: no cookie means signed out (no default customer)', async () => {
      useNoKeys();
      vi.stubEnv('NODE_ENV', 'development');
      const res = await middleware(request('/home'));
      expect(location(res)).toBe('/login');
    });

    it('demo mode: role guards still apply and the persona cookie is httpOnly', async () => {
      useNoKeys();
      vi.stubEnv('NODE_ENV', 'development');
      const asRes = await middleware(request('/home?as=cust-1'));
      expect(asRes.cookies.get('jr_mock_user_id')?.httpOnly).toBe(true);

      const res = await middleware(request('/boss/dashboard', { jr_mock_user_id: 'cust-1' }));
      expect(location(res)).toBe('/home');
    });

    it('public pages stay reachable', async () => {
      useNoKeys();
      vi.stubEnv('NODE_ENV', 'production');
      const res = await middleware(request('/login'));
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('server session resolution', () => {
    it('live mode: the demo cookie never resolves to a profile', async () => {
      useLiveKeys();
      cookieJar.set('jr_mock_user_id', 'boss-1');
      expect(await getCurrentProfile()).toBeNull();
    });

    it('production without keys: the demo cookie never resolves to a profile', async () => {
      useNoKeys();
      vi.stubEnv('NODE_ENV', 'production');
      cookieJar.set('jr_mock_user_id', 'boss-1');
      expect(await getCurrentProfile()).toBeNull();
    });

    it('development demo mode still resolves personas for local testing', async () => {
      useNoKeys();
      vi.stubEnv('NODE_ENV', 'development');
      cookieJar.set('jr_mock_user_id', 'boss-1');
      expect((await getCurrentProfile())?.role).toBe('boss');
    });
  });

  describe('cron endpoint', () => {
    it('rejects every request when CRON_SECRET is unset (no hardcoded fallback)', async () => {
      vi.stubEnv('CRON_SECRET', '');
      const req = new NextRequest('http://localhost:3000/api/cron', {
        headers: { authorization: 'Bearer dev-cron-secret' }
      });
      const res = await cronGet(req);
      expect(res.status).toBe(401);
    });
  });
});
