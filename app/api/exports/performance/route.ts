/**
 * Boss-Only Performance Analytics CSV Export Route (`app/api/exports/performance/route.ts`)
 * Section 9: Server-side, boss-only, logged in `audit_log`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { getDataRepository } from '@/lib/data';

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || profile.status !== 'active' || profile.role !== 'boss') {
    return NextResponse.json(
      { error: 'FORBIDDEN: Only the Boss can export performance analytics CSV.' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get('employeeId') || undefined;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const repo = getDataRepository();
  const csv = await repo.exportPerformanceCsv(
    { userId: profile.id, role: profile.role, status: profile.status },
    {
      employeeId,
      startDateIso: startDate ? new Date(`${startDate}T00:00:00Z`).toISOString() : undefined,
      endDateIso: endDate ? new Date(`${endDate}T23:59:59Z`).toISOString() : undefined
    }
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="john-rambo-staff-performance.csv"',
      'Cache-Control': 'no-store'
    }
  });
}
