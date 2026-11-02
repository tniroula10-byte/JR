/**
 * Server Session & Role Guard Resolution (`lib/auth/session.ts`)
 * Supports both Mock Persona Sessions (`jr_mock_user_id` cookie) and Live Supabase Auth.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getDataRepository,
  hasLiveSupabaseKeys,
  isDemoAuthAllowed,
  type CallerContext,
  type Profile
} from '@/lib/data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const MOCK_SESSION_COOKIE = 'jr_mock_user_id';

export async function getCurrentProfile(): Promise<Profile | null> {
  // Read cookies first on every path so Next.js always renders per request and never
  // prerenders (and caches) a signed-in page at build time.
  const cookieStore = await cookies();
  const repo = getDataRepository();

  if (hasLiveSupabaseKeys()) {
    // Live mode: only a validated Supabase Auth session counts. No cookie fallback.
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return null;
    return repo.getProfileById(user.id);
  }

  if (!isDemoAuthAllowed()) {
    return null;
  }

  const mockUserId = cookieStore.get(MOCK_SESSION_COOKIE)?.value;
  if (!mockUserId || mockUserId === 'anon' || mockUserId === 'none') {
    return null;
  }
  return repo.getProfileById(mockUserId);
}

export async function requireActiveSession(allowedRoles?: Array<'boss' | 'employee' | 'customer'>): Promise<{
  profile: Profile;
  caller: CallerContext;
}> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }
  if (profile.status === 'pending_approval' || profile.status === 'invited') {
    redirect('/login?error=pending_approval');
  }
  if (profile.status === 'rejected') {
    redirect('/login?error=account_rejected');
  }
  if (profile.status !== 'active') {
    redirect('/login?error=account_suspended');
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    if (profile.role === 'boss') redirect('/boss/dashboard');
    if (profile.role === 'employee') redirect('/employee/dashboard');
    redirect('/home');
  }
  return {
    profile,
    caller: {
      userId: profile.id,
      role: profile.role,
      status: profile.status
    }
  };
}
