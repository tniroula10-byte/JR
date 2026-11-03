import React from 'react';
import { CustomerTopupsClient } from '@/components/topups/customer-topups';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function CustomerTopupsPage() {
  const { caller } = await requireActiveSession(['customer']);
  const topups = await getDataRepository().listTopups(caller);
  return <CustomerTopupsClient topups={topups} />;
}
