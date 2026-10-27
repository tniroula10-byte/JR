/**
 * Data Repository Factory (`lib/data/index.ts`)
 * Decision 14: The UI never calls Supabase directly. All data access goes through a typed
 * repository interface in `lib/data/` with two adapters: `mock` and `supabase`.
 * Uses `supabase` when valid keys exist in `.env.local`, otherwise `mock`.
 */

import { MockDataRepository } from '@/lib/data/mock';
import { SupabaseDataRepository } from '@/lib/data/supabase';
import type { DataRepository } from '@/lib/data/types';

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

const mockRepoInstance = new MockDataRepository();
const supabaseRepoInstance = new SupabaseDataRepository();

export function getDataRepository(): DataRepository {
  if (hasLiveSupabaseKeys()) {
    return supabaseRepoInstance;
  }
  return mockRepoInstance;
}

export * from '@/lib/data/types';
