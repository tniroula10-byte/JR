/**
 * Route Guard #2: Boss Server Layout (`app/(staff)/boss/layout.tsx`)
 * Strictly restricts `/boss/*` routes to the singleton `boss` role.
 */
import React from 'react';
import { AppShell } from '@/components/shared/app-shell';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

// Per-user pages must never be prerendered or cached
export const dynamic = 'force-dynamic';

export default async function BossLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { profile, caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();
  const notifications = await repo.listNotifications(caller);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <AppShell profile={profile} unreadNotificationsCount={unreadCount}>
      {children}
    </AppShell>
  );
}
