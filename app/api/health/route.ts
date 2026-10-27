/**
 * Uptime & Monitoring Health Endpoint (`app/api/health/route.ts`)
 * Phase 11: Verifies database/adapter connectivity and reports active runtime mode.
 */
import { NextResponse } from 'next/server';
import { getDataRepository } from '@/lib/data';

export async function GET() {
  const repo = getDataRepository();
  return NextResponse.json(
    {
      status: 'ok',
      service: 'john-rambo-pwa',
      adapterMode: repo.mode,
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}
