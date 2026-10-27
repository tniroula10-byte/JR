import React from 'react';
import { BossEmployeesClient } from '@/components/shared/boss-employees-client';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossEmployeesPage() {
  const { caller } = await requireActiveSession(['boss']);
  const repo = getDataRepository();
  const employees = await repo.listEmployeesWithFlags(caller);

  return <BossEmployeesClient employees={employees} />;
}
