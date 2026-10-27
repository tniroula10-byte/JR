import React from 'react';
import { BossCustomersClient } from '@/components/shared/boss-customers-client';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossCustomersPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();

  const [profiles, invitations] = await Promise.all([
    repo.listAllProfiles(caller),
    repo.listInvitations(caller)
  ]);

  const customers = profiles.filter((p) => p.role === 'customer');
  const staffLookup: Record<string, string> = {};
  for (const p of profiles) {
    if (p.role !== 'customer') {
      staffLookup[p.id] = p.fullName;
    }
  }

  return (
    <BossCustomersClient
      customers={customers}
      invitations={invitations}
      staffLookup={staffLookup}
    />
  );
}
