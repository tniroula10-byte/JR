/**
 * Runtime Mode Detection (`lib/supabase/env.ts`)
 * Dependency-free so it can be imported from Edge middleware as well as server code.
 *
 * - Live mode: valid Supabase keys exist. Only real Supabase Auth sessions are accepted.
 * - Demo mode: no keys. Demo persona cookies are accepted ONLY when explicitly allowed
 *   (never in a production deployment unless `JR_ALLOW_DEMO_AUTH=1` is set, e.g. for E2E tests).
 */

export function hasLiveSupabaseKeys(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return false;
  if (
    anonKey === 'your-supabase-anon-key-here' ||
    url === 'http://127.0.0.1:54321' ||
    process.env.JR_FORCE_MOCK === '1'
  ) {
    return false;
  }
  return url.startsWith('https://') && anonKey.length > 30;
}

export function isDemoAuthAllowed(): boolean {
  if (hasLiveSupabaseKeys()) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return process.env.JR_ALLOW_DEMO_AUTH === '1';
}
