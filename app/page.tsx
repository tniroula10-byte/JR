import { redirect } from 'next/navigation';
import { getCurrentProfile } from '@/lib/auth/session';

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
