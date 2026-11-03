/**
 * Durable Login Throttle (`lib/auth/login-throttle.ts`)
 * Counts failed sign-in and code attempts in Postgres (shared by every serverless
 * instance) when Supabase is configured, otherwise in process memory (demo mode).
 * Two limits apply: per account identifier, and per client IP (stops spraying many accounts).
 */
import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { hasLiveSupabaseKeys } from '@/lib/supabase/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, clearRateLimit, RATE_LIMIT_PRESETS } from '@/lib/rate-limit';

const PER_ACCOUNT = RATE_LIMIT_PRESETS.LOGIN_EMAIL; // 5 per 15 minutes
const PER_IP = { windowMs: 15 * 60 * 1000, maxRequests: 30 };

function hashKey(key: string): string {
  return createHash('sha256').update(`jr-throttle:${key}`).digest('hex');
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}

async function hit(key: string, cfg: { windowMs: number; maxRequests: number }): Promise<boolean> {
  if (!hasLiveSupabaseKeys()) {
    return checkRateLimit(key, cfg).allowed;
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('srv_throttle_hit', {
    p_key_hash: hashKey(key),
    p_window_seconds: Math.round(cfg.windowMs / 1000),
    p_max: cfg.maxRequests
  });
  // Fail closed: if the throttle cannot be checked, do not allow the attempt
  return !error && data === true;
}

/**
 * Records an attempt for `scope` (e.g. "password-login") and the given account identifier.
 * Returns false when either the per-account or the per-IP limit is exhausted.
 */
export async function allowAuthAttempt(scope: string, identifier: string): Promise<boolean> {
  const ip = await clientIp();
  const accountOk = await hit(`${scope}:acct:${identifier.trim().toLowerCase()}`, PER_ACCOUNT);
  const ipOk = await hit(`${scope}:ip:${ip}`, PER_IP);
  return accountOk && ipOk;
}

/** After a successful sign-in only failures should count, so reset the account key. */
export async function clearAuthAttempts(scope: string, identifier: string): Promise<void> {
  const key = `${scope}:acct:${identifier.trim().toLowerCase()}`;
  if (!hasLiveSupabaseKeys()) {
    clearRateLimit(key);
    return;
  }
  await createSupabaseAdminClient().rpc('srv_throttle_clear', { p_key_hash: hashKey(key) });
}
