import React from 'react';
import { EmployeeStaffChannelClient } from '@/components/shared/staff-channel';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function EmployeeAnnouncementsPage() {
  const { caller } = await requireActiveSession(['employee', 'boss']);
  const repo = getDataRepository();
  const announcements = await repo.listStaffAnnouncements(caller);

  return (
    <EmployeeStaffChannelClient
      employeeId={caller.userId}
      announcements={announcements}
    />
  );
}
