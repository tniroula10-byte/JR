/**
 * Route Guard #2: Customer Server Layout (`app/(customer)/layout.tsx`)
 * Verifies active customer (or staff previewing notifications) session on the server.
 */
import React from 'react';
import { AppShell } from '@/components/shared/app-shell';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function CustomerLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { profile, caller } = await requireActiveSession(['customer', 'employee', 'boss']);
  const repo = getDataRepository();
  const notifications = await repo.listNotifications(caller);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <AppShell profile={profile} unreadNotificationsCount={unreadCount}>
      {children}
    </AppShell>
  );
}
