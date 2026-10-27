import React from 'react';
import { BossAnalyticsClient } from '@/components/analytics/boss-analytics-client';
import { requireActiveSession } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export default async function BossAnalyticsPage({
  searchParams
}: {
  searchParams: Promise<{ employeeId?: string; startDate?: string; endDate?: string }>;
}) {
  const { caller } = await requireActiveSession(['boss']);
  const params = await searchParams;
  const repo = getDataRepository();

  const filter = {
    employeeId: params.employeeId || undefined,
    startDateIso: params.startDate ? new Date(`${params.startDate}T00:00:00Z`).toISOString() : undefined,
    endDateIso: params.endDate ? new Date(`${params.endDate}T23:59:59Z`).toISOString() : undefined
  };

  const [employees, metrics, activityEvents] = await Promise.all([
    repo.listEmployeesWithFlags(caller),
    repo.getEmployeePerformance(caller, filter),
    repo.listActivityEvents(caller, filter)
  ]);

  return (
    <BossAnalyticsClient
      employees={employees}
      metrics={metrics}
      activityEvents={activityEvents}
      selectedEmployeeId={params.employeeId ?? ''}
      startDateIso={params.startDate ?? ''}
      endDateIso={params.endDate ?? ''}
    />
  );
}
