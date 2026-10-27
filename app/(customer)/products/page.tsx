import React from 'react';
import { CustomerCatalogClient } from '@/components/catalog/customer-catalog';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function CustomerProductsPage({
  searchParams
}: {
  searchParams: Promise<{ offerProduct?: string }>;
}) {
  const { caller } = await requireActiveSession(['customer']);
  const params = await searchParams;
  const repo = getDataRepository();
  const products = await repo.listProducts(caller);

  return (
    <CustomerCatalogClient
      products={products}
      initialProductId={params.offerProduct}
    />
  );
}
