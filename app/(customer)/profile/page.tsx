import React from 'react';
import { CustomerProfileClient } from '@/components/shared/customer-profile';
import { requireActiveSession } from '@/lib/auth/session';

export default async function CustomerProfilePage() {
  const { profile } = await requireActiveSession(['customer']);
  return <CustomerProfileClient profile={profile} />;
}
