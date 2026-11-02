/**
 * Data Repository Factory (`lib/data/index.ts`)
 * Decision 14: The UI never calls Supabase directly. All data access goes through a typed
 * repository interface in `lib/data/` with two adapters: `mock` and `supabase`.
 * Uses `supabase` when valid keys exist in `.env.local`, otherwise `mock`.
 */

import { MockDataRepository } from '@/lib/data/mock';
import { SupabaseDataRepository } from '@/lib/data/supabase';
import type { DataRepository } from '@/lib/data/types';
import { hasLiveSupabaseKeys } from '@/lib/supabase/env';

export { hasLiveSupabaseKeys, isDemoAuthAllowed } from '@/lib/supabase/env';

const mockRepoInstance = new MockDataRepository();
const supabaseRepoInstance = new SupabaseDataRepository();

export function getDataRepository(): DataRepository {
  if (hasLiveSupabaseKeys()) {
    return supabaseRepoInstance;
  }
  return mockRepoInstance;
}

export * from '@/lib/data/types';
