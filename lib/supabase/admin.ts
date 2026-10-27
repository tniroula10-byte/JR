/**
 * Server-Only Supabase Service-Role Client (`lib/supabase/admin.ts`)
 * Architecture Rule 2: The Supabase service-role key lives ONLY in server-only modules
 * (invites, role changes, exports, cron endpoints). Never expose it to the browser.
 */
import 'server-only';
import { createClient } from '@supabase/supabase-js';

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY on server.');
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
