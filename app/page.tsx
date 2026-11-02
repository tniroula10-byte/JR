import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';

// Per-user pages must never be prerendered or cached
export const dynamic = 'force-dynamic';

export default async function IndexPage() {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active') {
    redirect('/login');
  }
  if (profile.role === 'boss') {
    redirect('/boss/dashboard');
  }
  if (profile.role === 'employee') {
    redirect('/employee/dashboard');
  }
  redirect('/home');
}
