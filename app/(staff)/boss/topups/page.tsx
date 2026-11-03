import React from 'react';
import { StaffTopupsClient } from '@/components/topups/staff-topups';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossTopupsPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();
  const [topups, games, paymentMethods, settings, profiles] = await Promise.all([
    repo.listTopups(caller),
    repo.listGames(caller),
    repo.listPaymentMethods(caller),
    repo.getAppSettings(caller),
    repo.listAllProfiles(caller)
  ]);

  return (
    <StaffTopupsClient
      callerRole="boss"
      topups={topups}
      games={games}
      paymentMethods={paymentMethods}
      settings={settings}
      customers={profiles.filter((p) => p.role === 'customer' && p.status === 'active')}
    />
  );
}
