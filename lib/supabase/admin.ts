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

export async function syncUserToSupabaseAuth(input: {
  email: string;
  password?: string;
  username?: string;
  fullName?: string;
  role?: string;
}): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { data: listData } = await admin.auth.admin.listUsers();
    const existing = listData?.users?.find(
      (u) => u.email?.toLowerCase() === input.email.trim().toLowerCase()
    );
    const metadata = {
      ...(existing?.user_metadata ?? {}),
      ...(input.username ? { username: input.username } : {}),
      ...(input.fullName ? { full_name: input.fullName } : {}),
      ...(input.role ? { role: input.role } : {})
    };
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, {
        ...(input.password ? { password: input.password } : {}),
        email_confirm: true,
        user_metadata: metadata
      });
    } else {
      await admin.auth.admin.createUser({
        email: input.email.trim().toLowerCase(),
        ...(input.password ? { password: input.password } : {}),
        email_confirm: true,
        user_metadata: metadata
      });
    }
  } catch {
    // Graceful no-op when running in unit tests or offline
  }
}
