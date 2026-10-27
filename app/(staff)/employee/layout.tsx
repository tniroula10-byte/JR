/**
 * Route Guard #2: Employee Server Layout (`app/(staff)/employee/layout.tsx`)
 * Strictly restricts `/employee/*` routes to active `employee` (or `boss` oversight).
 */
import React from 'react';
import { AppShell } from '@/components/shared/app-shell';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function EmployeeLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { profile, caller } = await requireActiveSession(['employee', 'boss']);
  const repo = getDataRepository();
  const notifications = await repo.listNotifications(caller);
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <AppShell profile={profile} unreadNotificationsCount={unreadCount}>
      {children}
    </AppShell>
  );
}
