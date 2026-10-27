import React from 'react';
import { CustomerOffersClient } from '@/components/catalog/customer-offers';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function CustomerOffersPage() {
  const { caller } = await requireActiveSession(['customer']);
  const repo = getDataRepository();
  const offers = await repo.listOffers(caller);

  return <CustomerOffersClient offers={offers} />;
}
