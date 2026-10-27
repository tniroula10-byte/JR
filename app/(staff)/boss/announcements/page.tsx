import React from 'react';
import { BossAnnouncementsClient } from '@/components/shared/boss-announcements-client';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossAnnouncementsPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();

  const [staffAnnouncements, customerAnnouncements] = await Promise.all([
    repo.listStaffAnnouncements(caller),
    repo.listCustomerAnnouncements(caller)
  ]);

  return (
    <BossAnnouncementsClient
      staffAnnouncements={staffAnnouncements}
      customerAnnouncements={customerAnnouncements}
    />
  );
}
