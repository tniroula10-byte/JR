import React from 'react';
import { StaffOffersClient } from '@/components/catalog/staff-offers';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function EmployeeOffersPage() {
  const { caller } = await requireActiveSession(['employee', 'boss']);
  const repo = getDataRepository();
  const offers = await repo.listOffers(caller);

  return <StaffOffersClient offers={offers} />;
}
