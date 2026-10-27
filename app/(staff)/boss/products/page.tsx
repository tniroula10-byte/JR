import React from 'react';
import { BossProductsClient } from '@/components/catalog/boss-products-client';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossProductsPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();
  const products = await repo.listProducts(caller);

  return <BossProductsClient products={products} />;
}
